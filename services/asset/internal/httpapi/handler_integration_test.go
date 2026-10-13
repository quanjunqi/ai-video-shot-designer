package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"shotdesigner/services/asset/internal/asset"
)

// Handler 的 Store 是具体类型，成功路径需要真实 DB + MinIO（见 handler_test.go
// 顶部说明）。本文件补上 create/put/commit/list/content 的完整成功路径与
// 错误码映射。未设置 env 时跳过 —— CI 的 backend job 提供（ci.yml services）。

func handlerStore(t *testing.T) asset.Store {
	t.Helper()
	url := os.Getenv("ASSET_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set ASSET_TEST_DATABASE_URL")
	}
	endpoint := os.Getenv("ASSET_TEST_S3_ENDPOINT")
	accessKey := os.Getenv("ASSET_TEST_S3_ACCESS_KEY")
	secretKey := os.Getenv("ASSET_TEST_S3_SECRET_KEY")
	if endpoint == "" || accessKey == "" || secretKey == "" {
		t.Skip("set ASSET_TEST_S3_ENDPOINT/ACCESS_KEY/SECRET_KEY")
	}
	ctx := context.Background()
	admin, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(admin.Close)
	var suffix [8]byte
	if _, err := rand.Read(suffix[:]); err != nil {
		t.Fatal(err)
	}
	schema := "asset_http_test_" + hex.EncodeToString(suffix[:])
	quoted := pgx.Identifier{schema}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+quoted); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), "DROP SCHEMA "+quoted+" CASCADE")
	})
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	migrations, _ := filepath.Glob(filepath.Join("..", "..", "migrations", "*.sql"))
	sort.Strings(migrations)
	for _, f := range migrations {
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, string(b)); err != nil {
			t.Fatalf("apply %s: %v", filepath.Base(f), err)
		}
	}

	mc, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: false,
	})
	if err != nil {
		t.Fatal(err)
	}
	var bs [8]byte
	if _, err := rand.Read(bs[:]); err != nil {
		t.Fatal(err)
	}
	bucket := "asset-http-test-" + hex.EncodeToString(bs[:])
	if err := mc.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = mc.RemoveBucketWithOptions(context.Background(), bucket, minio.RemoveBucketOptions{ForceDelete: true})
	})
	return asset.Store{Pool: pool, Object: mc, Bucket: bucket, MaxBytes: 8192}
}

func newFullHandler(t *testing.T) (Handler, *httptest.ResponseRecorder) {
	t.Helper()
	h := Handler{Store: handlerStore(t), Token: "test-secret"}
	return h, httptest.NewRecorder()
}

func assetReq(method, target, body string) *http.Request {
	var r *http.Request
	if body == "" {
		r = httptest.NewRequest(method, target, nil)
	} else {
		r = httptest.NewRequest(method, target, strings.NewReader(body))
	}
	r.Header.Set("Authorization", "Bearer test-secret")
	r.Header.Set("X-Workspace-Id", "ws-1")
	r.Header.Set("X-Actor-Id", "actor-1")
	return r
}

func TestHandlerUploadLifecycle(t *testing.T) {
	h, rec := newFullHandler(t)

	// create → 201
	h.Routes().ServeHTTP(rec, assetReq(http.MethodPost, "/internal/v1/assets/uploads", `{"project_id":"proj-1","name":"hero.png","kind":"scene"}`))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create 期望 201，得到 %d：%s", rec.Code, rec.Body.String())
	}
	var created map[string]any
	_ = jsonUnmarshal(rec.Body.Bytes(), &created)
	id, _ := created["id"].(string)
	if id == "" {
		t.Fatalf("create 未返回 upload id：%s", rec.Body.String())
	}

	// put → 204
	rec = httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/internal/v1/assets/uploads/"+id+"/content", strings.NewReader("hello asset"))
	req.Header.Set("Authorization", "Bearer test-secret")
	req.Header.Set("X-Workspace-Id", "ws-1")
	req.ContentLength = 11
	h.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("put 期望 204，得到 %d：%s", rec.Code, rec.Body.String())
	}

	// commit → 201 + asset
	rec = httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, assetReq(http.MethodPost, "/internal/v1/assets/uploads/"+id+"/commit", ""))
	if rec.Code != http.StatusCreated {
		t.Fatalf("commit 期望 201，得到 %d：%s", rec.Code, rec.Body.String())
	}
	var committed map[string]any
	_ = jsonUnmarshal(rec.Body.Bytes(), &committed)
	assetID, _ := committed["id"].(string)
	if assetID == "" || committed["byte_size"].(float64) != 11 {
		t.Fatalf("commit 返回不对：%s", rec.Body.String())
	}

	// list → 200 且可见
	rec = httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, assetReq(http.MethodGet, "/internal/v1/assets?project_id=proj-1", ""))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), assetID) {
		t.Fatalf("list 期望 200 且包含新资产：%d %s", rec.Code, rec.Body.String())
	}

	// content → 200 + 原字节 + 缓存头
	rec = httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, assetReq(http.MethodGet, "/internal/v1/assets/"+assetID+"/content", ""))
	if rec.Code != http.StatusOK {
		t.Fatalf("content 期望 200，得到 %d", rec.Code)
	}
	body, _ := io.ReadAll(rec.Body)
	if string(body) != "hello asset" {
		t.Fatalf("content 内容不对：%q", string(body))
	}
	if rec.Header().Get("Cache-Control") != "public, max-age=86400" {
		t.Fatalf("content 应可缓存：%q", rec.Header().Get("Cache-Control"))
	}
}

func TestHandlerPutErrorMapping(t *testing.T) {
	h, _ := newFullHandler(t)
	// 不存在 → 404
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, assetReq(http.MethodPut, "/internal/v1/assets/uploads/upl_nope/content", "x"))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("不存在 upload 期望 404，得到 %d", rec.Code)
	}
	// 超限 → 413（MaxBytes=8192，发 9000 字节）
	rec = httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, assetReq(http.MethodPost, "/internal/v1/assets/uploads", `{"project_id":"p","name":"big.png"}`))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create 期望 201，得到 %d", rec.Code)
	}
	var created map[string]any
	_ = jsonUnmarshal(rec.Body.Bytes(), &created)
	id, _ := created["id"].(string)
	rec = httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/internal/v1/assets/uploads/"+id+"/content", strings.NewReader(strings.Repeat("x", 9000)))
	req.Header.Set("Authorization", "Bearer test-secret")
	req.Header.Set("X-Workspace-Id", "ws-1")
	req.ContentLength = 9000
	h.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("超限期望 413，得到 %d", rec.Code)
	}
}

func TestHandlerCommitHashMismatch(t *testing.T) {
	h, rec := newFullHandler(t)
	// 期望哈希与实际不符 → 422
	h.Routes().ServeHTTP(rec, assetReq(http.MethodPost, "/internal/v1/assets/uploads",
		`{"project_id":"p","name":"strict.png","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}`))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create 期望 201，得到 %d", rec.Code)
	}
	var created map[string]any
	_ = jsonUnmarshal(rec.Body.Bytes(), &created)
	id, _ := created["id"].(string)
	rec = httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/internal/v1/assets/uploads/"+id+"/content", strings.NewReader("different"))
	req.Header.Set("Authorization", "Bearer test-secret")
	req.Header.Set("X-Workspace-Id", "ws-1")
	req.ContentLength = 9
	h.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("put 期望 204，得到 %d", rec.Code)
	}
	rec = httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, assetReq(http.MethodPost, "/internal/v1/assets/uploads/"+id+"/commit", ""))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("哈希不符期望 422，得到 %d：%s", rec.Code, rec.Body.String())
	}
}

func TestHandlerListEmpty(t *testing.T) {
	h, rec := newFullHandler(t)
	h.Routes().ServeHTTP(rec, assetReq(http.MethodGet, "/internal/v1/assets", ""))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"items":[]`) {
		t.Fatalf("空列表期望 200 []，得到 %d：%s", rec.Code, rec.Body.String())
	}
}

// 复用一个轻量 JSON 解码（避免引入额外依赖）
func jsonUnmarshal(b []byte, v any) error {
	return json.Unmarshal(b, v)
}
