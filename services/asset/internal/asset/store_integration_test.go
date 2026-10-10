package asset

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// asset 的 Store 此前【没有任何测试证据】（CreateUpload/Put/Commit/List 共 204 行）。
//
// 本文件覆盖**不需要对象存储**的两条：CreateUpload 与 List。
// Put / Commit 会连 MinIO ⇒ 要覆盖它们需在 CI 里再加一个 MinIO service（另议，不在此片）。
//
// 准备方式与 production/execution 的集成测试一致：**每个用例自建随机 schema、
// 就地应用 migrations、结束时清理** —— 因此它不依赖"开发者本地库已被预先应用迁移"。
// 未设置 ASSET_TEST_DATABASE_URL 时跳过（CI 现在会提供它，见 ci.md §7）。

func testStore(t *testing.T) Store {
	t.Helper()
	url := os.Getenv("ASSET_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set ASSET_TEST_DATABASE_URL to a dedicated PostgreSQL test database")
	}
	ctx := context.Background()
	admin, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(admin.Close)
	if err := admin.Ping(ctx); err != nil {
		t.Fatal(err)
	}
	var suffix [8]byte
	if _, err := rand.Read(suffix[:]); err != nil {
		t.Fatal(err)
	}
	schema := "asset_test_" + hex.EncodeToString(suffix[:])
	quoted := pgx.Identifier{schema}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+quoted); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec(context.Background(), "DROP SCHEMA "+quoted+" CASCADE"); err != nil {
			t.Errorf("remove test schema: %v", err)
		}
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

	migrations, err := filepath.Glob(filepath.Join("..", "..", "migrations", "*.sql"))
	if err != nil {
		t.Fatal(err)
	}
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
	return Store{Pool: pool, MaxBytes: 1 << 20, Bucket: "test-bucket"}
}

func TestIntegrationCreateUploadShapeTrimAndDefaults(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	// 刻意带空白：ProjectID/Name 应被 TrimSpace（判据：store.go 的 input.X = strings.TrimSpace）
	up, err := s.CreateUpload(ctx, "ws_a", "user_a", UploadInput{ProjectID: "  proj_1  ", Name: "  角色立绘  "})
	if err != nil {
		t.Fatalf("CreateUpload: %v", err)
	}
	if !strings.HasPrefix(up.ID, "upl_") {
		t.Errorf("上传 id 应以 upl_ 开头，得到 %q", up.ID)
	}
	if up.ProjectID != "proj_1" {
		t.Errorf("project_id 应已 TrimSpace，得到 %q", up.ProjectID)
	}
	wantKey := "ws_a/proj_1/" + up.ID
	if up.ObjectKey != wantKey {
		t.Errorf("object_key 应为 workspace/project/id（%q），得到 %q", wantKey, up.ObjectKey)
	}
	if up.Status != "uploading" {
		t.Errorf("新上传状态应为 uploading（表默认值），得到 %q", up.Status)
	}
	if up.CreatedAt.IsZero() {
		t.Error("created_at 不应为零值")
	}

	// 直查该行：默认值与「空串转 NULL」必须落到库里
	var kind, scope, name string
	var episodeID, expectedSHA *string
	if err := s.Pool.QueryRow(ctx,
		`SELECT kind, scope, name, episode_id, expected_sha256 FROM asset_uploads WHERE workspace_id='ws_a' AND id=$1`, up.ID).
		Scan(&kind, &scope, &name, &episodeID, &expectedSHA); err != nil {
		t.Fatalf("直查上传行: %v", err)
	}
	if kind != "other" || scope != "project" {
		t.Errorf("省略 kind/scope 时应落默认值 other/project，得到 %q/%q", kind, scope)
	}
	if name != "角色立绘" {
		t.Errorf("name 应已 TrimSpace，得到 %q", name)
	}
	// ★ 判据：INSERT 用的是 NULLIF($4,'') / NULLIF($10,'')
	//   ⇒ 未提供 episode_id / sha256 时库里应是 NULL，而不是空串。
	if episodeID != nil || expectedSHA != nil {
		t.Errorf("未提供的 episode_id/expected_sha256 应为 NULL，得到 %v / %v", episodeID, expectedSHA)
	}
}

func TestIntegrationCreateUploadValidatesBeforeWriting(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	for _, c := range []struct {
		name  string
		input UploadInput
	}{
		{"project_id 为空", UploadInput{Name: "x"}},
		{"project_id 仅空白", UploadInput{ProjectID: "   ", Name: "x"}},
		{"name 为空", UploadInput{ProjectID: "p"}},
		{"name 仅空白", UploadInput{ProjectID: "p", Name: "  "}},
	} {
		t.Run(c.name, func(t *testing.T) {
			if _, err := s.CreateUpload(ctx, "ws_a", "user_a", c.input); err == nil {
				t.Fatal("应报错（project_id 与 name 必填）")
			}
		})
	}
	// 校验发生在写库之前 ⇒ 一行都不应落库
	var n int
	if err := s.Pool.QueryRow(ctx, `SELECT count(*) FROM asset_uploads`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("校验失败的上传不应写库，实际有 %d 行", n)
	}
}

func TestIntegrationCreateUploadEnforcesSHA256Check(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	good := strings.Repeat("a", 64)
	if _, err := s.CreateUpload(ctx, "ws_a", "u", UploadInput{ProjectID: "p", Name: "ok", SHA256: good}); err != nil {
		t.Fatalf("64 位 sha256 应被接受：%v", err)
	}
	// 表上有 CHECK (expected_sha256 IS NULL OR length = 64) ⇒ 63 位必须被拒
	if _, err := s.CreateUpload(ctx, "ws_a", "u", UploadInput{ProjectID: "p", Name: "bad", SHA256: strings.Repeat("a", 63)}); err == nil {
		t.Fatal("63 位 sha256 应被数据库 CHECK 拒绝")
	}
}

func TestIntegrationListScopesByWorkspaceAndProjectAndOrders(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	sha := strings.Repeat("b", 64)
	// assets 对 asset_uploads 有外键 (workspace_id, upload_id)（判据：001_assets.sql 末行）
	// ⇒ 先造父行。用真实的 CreateUpload 而不是手插，顺带复用它的契约。
	seed := func(ws, proj, id, age string) {
		t.Helper()
		up, err := s.CreateUpload(ctx, ws, "tester", UploadInput{ProjectID: proj, Name: id})
		if err != nil {
			t.Fatalf("父上传 %s: %v", id, err)
		}
		// 刻意【不写 status】：取表默认值，用来暴露下面那条可疑默认（见 TestIntegrationAssetStatusDefault）。
		if _, err := s.Pool.Exec(ctx,
			`INSERT INTO assets (workspace_id,id,upload_id,project_id,kind,scope,name,object_key,sha256,byte_size,content_type,created_by,created_at)
			 VALUES ($1,$2,$3,$4,'other','project',$5,$6,$7,10,'image/png','tester', now() - $8::interval)`,
			ws, id, up.ID, proj, id, ws+"/"+proj+"/"+id, sha, age); err != nil {
			t.Fatalf("seed %s: %v", id, err)
		}
	}
	seed("ws_a", "proj_1", "a1", "3 hours")
	seed("ws_a", "proj_2", "a2", "2 hours")
	seed("ws_b", "proj_1", "b1", "1 hour")

	all, err := s.List(ctx, "ws_a", "")
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("ws_a 全量应为 2 行，得到 %d", len(all))
	}
	for _, a := range all {
		if a.ProjectID != "" && a.ProjectID != "proj_1" && a.ProjectID != "proj_2" {
			t.Fatalf("泄漏了其它 workspace 的行：%+v", a)
		}
	}
	// ORDER BY created_at DESC ⇒ 较新的在前
	if all[0].ID != "a2" || all[1].ID != "a1" {
		t.Errorf("应按 created_at 倒序（a2 在前），得到 %s,%s", all[0].ID, all[1].ID)
	}

	one, err := s.List(ctx, "ws_a", "proj_1")
	if err != nil {
		t.Fatalf("List(proj_1): %v", err)
	}
	if len(one) != 1 || one[0].ID != "a1" {
		t.Fatalf("按 project 过滤应只返回 a1，得到 %+v", one)
	}

	none, err := s.List(ctx, "ws_missing", "")
	if err != nil {
		t.Fatalf("List(空 workspace): %v", err)
	}
	if len(none) != 0 {
		t.Fatalf("不存在的 workspace 应返回空，得到 %d 行", len(none))
	}
}

// 空结果必须是【空切片】而非 nil —— List 用 make([]Asset, 0)，因此 JSON 是 [] 而不是 null。
// 这条对前端是可见契约：null 会让 `items.map(...)` 直接抛错。
func TestIntegrationListReturnsEmptySliceNotNil(t *testing.T) {
	s := testStore(t)
	got, err := s.List(context.Background(), "ws_none", "")
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if got == nil {
		t.Fatal("应返回空切片而非 nil（否则 JSON 会渲染成 null）")
	}
	if len(got) != 0 {
		t.Fatalf("应为空，得到 %d 行", len(got))
	}
}

var _ = time.Second

// ★ 实测锁定一处**可疑**的默认值（不是"应该"，而是"当前事实"）：
//
//	assets.status 的表默认值是 'DRAFT'（大写），而 asset_uploads.status 用的是
//	小写枚举 'uploading'/'committed'/'aborted'（判据：001_assets.sql 第 12 行 vs 第 33 行）；
//	并且 Commit 的 INSERT **不写 status**（判据：store.go 的 INSERT INTO assets …）
//	⇒ 一个**提交成功**的资产，其 status 落库是 'DRAFT'，与"已提交"毫无关系。
//
// 本用例把它钉成事实：若有人把默认值改为 'committed'（或给 assets 加 CHECK），
// 本用例会失败并提醒"这是对外可见的数据变更，请确认前端与调用方"。
func TestIntegrationAssetStatusDefaultIsSuspiciousDraft(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	up, err := s.CreateUpload(ctx, "ws_a", "tester", UploadInput{ProjectID: "p", Name: "n"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Pool.Exec(ctx,
		`INSERT INTO assets (workspace_id,id,upload_id,project_id,kind,scope,name,object_key,sha256,byte_size,content_type,created_by)
		 VALUES ('ws_a','a_draft',$1,'p','other','project','n','ws_a/p/a_draft',$2,1,'image/png','tester')`,
		up.ID, strings.Repeat("c", 64)); err != nil {
		t.Fatal(err)
	}
	var status string
	if err := s.Pool.QueryRow(ctx, `SELECT status FROM assets WHERE workspace_id='ws_a' AND id='a_draft'`).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "DRAFT" {
		t.Fatalf("assets.status 默认值已变（现在 %q）—— 这是对外可见的数据变更，"+
			"请确认前端/调用方是否依赖它，再更新本用例", status)
	}
}
