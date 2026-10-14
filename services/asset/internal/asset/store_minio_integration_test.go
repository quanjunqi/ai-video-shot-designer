package asset

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"testing"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// Put / Commit / GetContent 此前 0% 覆盖（需要对象存储，见 store_integration_test.go
// 顶部说明）。本文件补上这三条的真实 MinIO 集成证据：
//
//   每个用例自建随机 bucket，结束时删除；未配置 MinIO env 时跳过。
//   CI 需要为该 job 提供 MinIO service（见 ci.yml backend job services）。

func testMinioStore(t *testing.T) Store {
	t.Helper()
	s := testStore(t)
	endpoint := os.Getenv("ASSET_TEST_S3_ENDPOINT")
	if endpoint == "" {
		t.Skip("set ASSET_TEST_S3_ENDPOINT (e.g. 127.0.0.1:9000) to run MinIO-backed tests")
	}
	accessKey := os.Getenv("ASSET_TEST_S3_ACCESS_KEY")
	secretKey := os.Getenv("ASSET_TEST_S3_SECRET_KEY")
	if accessKey == "" || secretKey == "" {
		t.Skip("set ASSET_TEST_S3_ACCESS_KEY / ASSET_TEST_S3_SECRET_KEY")
	}
	mc, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: false,
	})
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	var suffix [8]byte
	if _, err := rand.Read(suffix[:]); err != nil {
		t.Fatal(err)
	}
	bucket := "asset-test-" + hex.EncodeToString(suffix[:])
	if err := mc.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		// 递归清空再删桶（避免残留对象导致删除失败）
		_ = mc.RemoveBucketWithOptions(ctx, bucket, minio.RemoveBucketOptions{ForceDelete: true})
	})
	s.Object = mc
	s.Bucket = bucket
	s.MaxBytes = 4096
	return s
}

// createUpload 建一条 uploading 状态的 upload 记录。
func createUpload(t *testing.T, s Store) Upload {
	t.Helper()
	u, err := s.CreateUpload(context.Background(), "ws-1", "actor-1", UploadInput{
		ProjectID: "proj-1",
		Name:      "hero.png",
		Kind:      "scene",
	})
	if err != nil {
		t.Fatal(err)
	}
	return u
}

func TestPutAndCommitHappyPath(t *testing.T) {
	s := testMinioStore(t)
	u := createUpload(t, s)
	body := []byte("hello asset")
	if err := s.Put(context.Background(), "ws-1", u.ID, bytes.NewReader(body), int64(len(body)), "image/png"); err != nil {
		t.Fatalf("Put: %v", err)
	}
	a, err := s.Commit(context.Background(), "ws-1", u.ID)
	if err != nil {
		t.Fatalf("Commit: %v", err)
	}
	if a.UploadID != u.ID || a.ProjectID != "proj-1" || a.Name != "hero.png" || a.ByteSize != int64(len(body)) {
		t.Fatalf("asset 元数据不对：%+v", a)
	}
	// sha256 应为内容哈希
	want := "2d5eebd03955939c6aa7ad07292cc6e13934da502e92581ac55fa20c6986c7fb" // sha256("hello asset")
	if a.SHA256 != want {
		t.Fatalf("sha256 不对：%s", a.SHA256)
	}
	// List 可见
	items, err := s.List(context.Background(), "ws-1", "proj-1")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].ID != a.ID {
		t.Fatalf("List 结果不对：%+v", items)
	}
	// GetContent 读回原字节
	c, err := s.GetContent(context.Background(), "ws-1", a.ID)
	if err != nil {
		t.Fatalf("GetContent: %v", err)
	}
	// 显式丢弃 Close 错误：测试读完整响应体后关闭，close 失败无断言价值。
	defer func() { _ = c.Body.Close() }()
	got, err := io.ReadAll(c.Body)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(body) {
		t.Fatalf("读回内容不一致：%q", string(got))
	}
}

func TestPutNotFoundAndConflict(t *testing.T) {
	s := testMinioStore(t)
	if err := s.Put(context.Background(), "ws-1", "upl_nonexistent", bytes.NewReader([]byte("x")), 1, ""); !errors.Is(err, ErrNotFound) {
		t.Fatalf("不存在的 upload 应返回 ErrNotFound，得到 %v", err)
	}
	u := createUpload(t, s)
	body := []byte("payload")
	if err := s.Put(context.Background(), "ws-1", u.ID, bytes.NewReader(body), int64(len(body)), ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Commit(context.Background(), "ws-1", u.ID); err != nil {
		t.Fatal(err)
	}
	// 已 committed 再 Put ⇒ ErrConflict
	if err := s.Put(context.Background(), "ws-1", u.ID, bytes.NewReader(body), int64(len(body)), ""); !errors.Is(err, ErrConflict) {
		t.Fatalf("已提交后 Put 应 ErrConflict，得到 %v", err)
	}
}

func TestPutTooLargeRemovesObject(t *testing.T) {
	s := testMinioStore(t)
	u := createUpload(t, s)
	big := bytes.Repeat([]byte("x"), int(s.MaxBytes)+100)
	if err := s.Put(context.Background(), "ws-1", u.ID, bytes.NewReader(big), int64(len(big)), ""); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("超限应 ErrTooLarge，得到 %v", err)
	}
	// 对象应已被清除：内容端点不应能读到
	if _, err := s.Commit(context.Background(), "ws-1", u.ID); err == nil {
		t.Fatal("超限后不应能 commit 成功")
	}
}

func TestPutSizeMismatch(t *testing.T) {
	s := testMinioStore(t)
	u := createUpload(t, s)
	body := []byte("abc")
	// 声称 size=5 但实际 3 字节：minio-go 在传输层就会拒绝长度不符的请求
	// （ErrSizeMismatch 是 store 的防御分支，真机由传输层先拦截）。
	// 断言不变式：Put 必须失败，且失败后该 upload 不能被 commit（对象未落盘）。
	if err := s.Put(context.Background(), "ws-1", u.ID, bytes.NewReader(body), 5, ""); err == nil {
		t.Fatal("长度声明与 body 不符时 Put 必须失败")
	}
	if _, err := s.Commit(context.Background(), "ws-1", u.ID); err == nil {
		t.Fatal("Put 失败后不应能 commit 成功")
	}
}

func TestCommitHashMismatch(t *testing.T) {
	s := testMinioStore(t)
	// 声明期望 sha256（64 字符假值，非实际内容哈希）⇒ 422 哈希不符
	expected := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" // 64 字符假哈希
	u, err := s.CreateUpload(context.Background(), "ws-1", "actor-1", UploadInput{
		ProjectID: "proj-1",
		Name:      "strict.png",
		SHA256:    expected,
	})
	if err != nil {
		t.Fatal(err)
	}
	body := []byte("actual-content")
	if err := s.Put(context.Background(), "ws-1", u.ID, bytes.NewReader(body), int64(len(body)), ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Commit(context.Background(), "ws-1", u.ID); !errors.Is(err, ErrHashMismatch) {
		t.Fatalf("哈希不符应 ErrHashMismatch，得到 %v", err)
	}
}

func TestCommitNotFoundAndConflict(t *testing.T) {
	s := testMinioStore(t)
	if _, err := s.Commit(context.Background(), "ws-1", "upl_nonexistent"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("不存在的 upload 应 ErrNotFound，得到 %v", err)
	}
	u := createUpload(t, s)
	body := []byte("once")
	if err := s.Put(context.Background(), "ws-1", u.ID, bytes.NewReader(body), int64(len(body)), ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Commit(context.Background(), "ws-1", u.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Commit(context.Background(), "ws-1", u.ID); !errors.Is(err, ErrConflict) {
		t.Fatalf("重复 commit 应 ErrConflict，得到 %v", err)
	}
}

func TestGetContentNotFound(t *testing.T) {
	s := testMinioStore(t)
	if _, err := s.GetContent(context.Background(), "ws-1", "ast_nonexistent"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("不存在的资产应 ErrNotFound，得到 %v", err)
	}
}

func TestListScopesByProject(t *testing.T) {
	s := testMinioStore(t)
	for _, p := range []string{"proj-1", "proj-2"} {
		u, err := s.CreateUpload(context.Background(), "ws-1", "actor-1", UploadInput{ProjectID: p, Name: p + ".png"})
		if err != nil {
			t.Fatal(err)
		}
		body := []byte(p)
		if err := s.Put(context.Background(), "ws-1", u.ID, bytes.NewReader(body), int64(len(body)), ""); err != nil {
			t.Fatal(err)
		}
		if _, err := s.Commit(context.Background(), "ws-1", u.ID); err != nil {
			t.Fatal(err)
		}
	}
	items, err := s.List(context.Background(), "ws-1", "proj-1")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].ProjectID != "proj-1" {
		t.Fatalf("List 应按 project 过滤，得到 %+v", items)
	}
	// 空 project_id ⇒ 全部
	all, err := s.List(context.Background(), "ws-1", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 2 {
		t.Fatalf("空 project 应返回全部，得到 %d", len(all))
	}
}
