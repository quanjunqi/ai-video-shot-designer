package catalog

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// testPostgresStore 与 internal/project 的既有写法一致：未设置
// PRODUCTION_TEST_DATABASE_URL 时跳过；每个用例自建随机 schema 并在结束时清理。
func testPostgresStore(t *testing.T) PostgresStore {
	t.Helper()
	url := os.Getenv("PRODUCTION_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set PRODUCTION_TEST_DATABASE_URL to a dedicated PostgreSQL test database")
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
	schema := "catalog_test_" + hex.EncodeToString(suffix[:])
	quotedSchema := pgx.Identifier{schema}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+quotedSchema); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec(context.Background(), "DROP SCHEMA "+quotedSchema+" CASCADE"); err != nil {
			t.Errorf("remove test schema: %v", err)
		}
	})
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	migrations, err := filepath.Glob(filepath.Join("..", "..", "migrations", "*.sql"))
	if err != nil {
		t.Fatal(err)
	}
	sort.Strings(migrations)
	for _, migrationPath := range migrations {
		migration, err := os.ReadFile(migrationPath)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, string(migration), pgx.QueryExecModeSimpleProtocol); err != nil {
			t.Fatalf("apply migration %s: %v", migrationPath, err)
		}
	}
	return PostgresStore{Pool: pool}
}

// seedCandidate 插入一行 model_catalog 作为候选，返回其 id。
// channel_id 无外键（011 已删除），故直接用占位渠道即可。
func seedCandidate(t *testing.T, store PostgresStore, id, family, note string) string {
	t.Helper()
	ctx := context.Background()
	if _, err := store.Pool.Exec(ctx, `INSERT INTO model_catalog (id, channel_id, family, name, provider_model, type, status, note)
        VALUES ($1, 'test-channel', $2, $3, $4, 'image', 'enabled', $5)`,
		id, family, family+" 显示名", "provider/"+id, note); err != nil {
		t.Fatalf("seed model %s: %v", id, err)
	}
	return id
}

func seedLogicalModel(t *testing.T, store PostgresStore, id string) string {
	t.Helper()
	ctx := context.Background()
	if _, err := store.Pool.Exec(ctx, `INSERT INTO logical_models (id, label, type) VALUES ($1, $2, 'image')`, id, "逻辑模型 "+id); err != nil {
		t.Fatalf("seed logical model %s: %v", id, err)
	}
	return id
}

// 绑定必须按 route_priority 升序返回候选，且只写 logical_model_id 与 route_priority。
func TestPostgresBindCandidatesOrdersByRoutePriority(t *testing.T) {
	store := testPostgresStore(t)
	ctx := context.Background()
	seedLogicalModel(t, store, "image-t2i-high")
	a := seedCandidate(t, store, "mod_int_a", "family-a", "origin-a")
	b := seedCandidate(t, store, "mod_int_b", "family-b", "origin-b")
	c := seedCandidate(t, store, "mod_int_c", "family-c", "origin-c")

	priorityA, priorityB := 30, 10
	input := BindCandidatesInput{ModelIDs: []string{a, b, c}, RoutePriority: &priorityA}
	candidates, err := store.BindCandidates(ctx, "image-t2i-high", input)
	if err != nil {
		t.Fatalf("bind candidates: %v", err)
	}
	if len(candidates) != 3 {
		t.Fatalf("expected 3 candidates, got %d", len(candidates))
	}
	if candidates[0].ID != a || candidates[1].ID != b || candidates[2].ID != c {
		t.Fatalf("same priority should fall back to id order, got %s,%s,%s", candidates[0].ID, candidates[1].ID, candidates[2].ID)
	}
	for _, candidate := range candidates {
		if candidate.LogicalModelID != "image-t2i-high" || candidate.RoutePriority != priorityA {
			t.Fatalf("candidate not bound as requested: %+v", candidate)
		}
	}

	// 第二次绑定：只改 route_priority，并验证其它列一字未动。
	if _, err := store.BindCandidates(ctx, "image-t2i-high", BindCandidatesInput{ModelIDs: []string{a, b}, RoutePriority: &priorityB}); err != nil {
		t.Fatalf("rebind candidates: %v", err)
	}
	candidates, err = store.ListCandidates(ctx, "image-t2i-high")
	if err != nil {
		t.Fatalf("list candidates: %v", err)
	}
	// 重新绑定会把给定的两行设为同一优先级，故按 id 兜底排序
	wantOrder := []string{a, b, c}
	for i, wantID := range wantOrder {
		if candidates[i].ID != wantID {
			t.Fatalf("candidate order = %s..., want %v", candidateIDs(candidates), wantOrder)
		}
	}
	var name, family, providerModel, note string
	var version int
	var routePriority int
	if err := store.Pool.QueryRow(ctx, `SELECT name, family, provider_model, note, version, route_priority FROM model_catalog WHERE id = $1`, a).
		Scan(&name, &family, &providerModel, &note, &version, &routePriority); err != nil {
		t.Fatal(err)
	}
	if name != "family-a 显示名" || family != "family-a" || providerModel != "provider/mod_int_a" || note != "origin-a" {
		t.Fatalf("binding must not touch other columns: name=%q family=%q provider=%q note=%q", name, family, providerModel, note)
	}
	if routePriority != priorityB {
		t.Fatalf("route_priority = %d, want %d", routePriority, priorityB)
	}
	if version < 2 {
		t.Fatalf("model_catalog 的 version 应随更新递增（既有触发器），got %d", version)
	}
	// 未被本次请求提及的行保持原优先级（不重置、不改动）
	var untouchedPriority int
	if err := store.Pool.QueryRow(ctx, `SELECT route_priority FROM model_catalog WHERE id = $1`, c).Scan(&untouchedPriority); err != nil {
		t.Fatal(err)
	}
	if untouchedPriority != priorityA {
		t.Fatalf("untouched row priority = %d, want %d", untouchedPriority, priorityA)
	}
}

// 未提供 routePriority 时用 100（与 026 迁移列默认值一致）。
func TestPostgresBindCandidatesAppliesDefaultPriority(t *testing.T) {
	store := testPostgresStore(t)
	ctx := context.Background()
	seedLogicalModel(t, store, "image-t2i-high")
	modelID := seedCandidate(t, store, "mod_default_priority", "family-d", "origin-d")
	if _, err := store.BindCandidates(ctx, "image-t2i-high", BindCandidatesInput{ModelIDs: []string{modelID}}); err != nil {
		t.Fatalf("bind without priority: %v", err)
	}
	var priority int
	if err := store.Pool.QueryRow(ctx, `SELECT route_priority FROM model_catalog WHERE id = $1`, modelID).Scan(&priority); err != nil {
		t.Fatal(err)
	}
	if priority != DefaultRoutePriority {
		t.Fatalf("route_priority = %d, want default %d", priority, DefaultRoutePriority)
	}
}

// 已属于另一个逻辑模型的行必须 409（不静默抢占），且原有绑定不被改动。
func TestPostgresBindCandidatesRejectsForeignBinding(t *testing.T) {
	store := testPostgresStore(t)
	ctx := context.Background()
	seedLogicalModel(t, store, "image-t2i-high")
	seedLogicalModel(t, store, "image-t2i-low")
	mine := seedCandidate(t, store, "mod_mine", "family-mine", "origin-mine")
	theirs := seedCandidate(t, store, "mod_theirs", "family-theirs", "origin-theirs")
	foreignPriority := 5
	if _, err := store.BindCandidates(ctx, "image-t2i-low", BindCandidatesInput{ModelIDs: []string{theirs}, RoutePriority: &foreignPriority}); err != nil {
		t.Fatalf("seed foreign binding: %v", err)
	}

	_, err := store.BindCandidates(ctx, "image-t2i-high", BindCandidatesInput{ModelIDs: []string{mine, theirs}})
	var conflicts ErrModelsBoundElsewhereList
	if !errors.As(err, &conflicts) {
		t.Fatalf("expected ErrModelsBoundElsewhereList, got %v", err)
	}
	if len(conflicts.Conflicts) != 1 || conflicts.Conflicts[0].ModelID != theirs || conflicts.Conflicts[0].LogicalModelID != "image-t2i-low" {
		t.Fatalf("unexpected conflicts: %+v", conflicts.Conflicts)
	}
	// 事务必须整体回滚：同请求里的合法行也不能被写入
	var owner *string
	var priority int
	if err := store.Pool.QueryRow(ctx, `SELECT logical_model_id, route_priority FROM model_catalog WHERE id = $1`, mine).Scan(&owner, &priority); err != nil {
		t.Fatal(err)
	}
	if owner != nil {
		t.Fatalf("failed bind must not partially write, mod_mine owner=%v", *owner)
	}
	if err := store.Pool.QueryRow(ctx, `SELECT logical_model_id, route_priority FROM model_catalog WHERE id = $1`, theirs).Scan(&owner, &priority); err != nil {
		t.Fatal(err)
	}
	if owner == nil || *owner != "image-t2i-low" || priority != foreignPriority {
		t.Fatalf("foreign binding changed: owner=%v priority=%d", owner, priority)
	}
}

func TestPostgresBindCandidatesUnknownModelOrLogicalModel(t *testing.T) {
	store := testPostgresStore(t)
	ctx := context.Background()
	seedLogicalModel(t, store, "image-t2i-high")
	seedCandidate(t, store, "mod_known", "family-known", "origin-known")

	_, err := store.BindCandidates(ctx, "image-t2i-high", BindCandidatesInput{ModelIDs: []string{"mod_known", "mod_missing"}})
	var missing ErrModelNotFound
	if !errors.As(err, &missing) {
		t.Fatalf("expected ErrModelNotFound, got %v", err)
	}
	if len(missing.ModelIDs) != 1 || missing.ModelIDs[0] != "mod_missing" {
		t.Fatalf("404 must name the missing modelId, got %+v", missing.ModelIDs)
	}

	if _, err := store.BindCandidates(ctx, "nope-model", BindCandidatesInput{ModelIDs: []string{"mod_known"}}); err != ErrNotFound {
		t.Fatalf("unknown logical model should be ErrNotFound, got %v", err)
	}
	if _, err := store.ListCandidates(ctx, "nope-model"); err != ErrNotFound {
		t.Fatalf("ListCandidates on unknown logical model should be ErrNotFound, got %v", err)
	}
}

// 解绑只置 NULL，不删除 model_catalog 行。
func TestPostgresUnbindCandidateKeepsRow(t *testing.T) {
	store := testPostgresStore(t)
	ctx := context.Background()
	seedLogicalModel(t, store, "image-t2i-high")
	seedLogicalModel(t, store, "image-t2i-low")
	modelID := seedCandidate(t, store, "mod_unbind", "family-unbind", "origin-unbind")
	if _, err := store.BindCandidates(ctx, "image-t2i-high", BindCandidatesInput{ModelIDs: []string{modelID}}); err != nil {
		t.Fatalf("bind: %v", err)
	}

	if err := store.UnbindCandidate(ctx, "image-t2i-high", modelID); err != nil {
		t.Fatalf("unbind: %v", err)
	}
	var owner *string
	var count int
	if err := store.Pool.QueryRow(ctx, `SELECT logical_model_id FROM model_catalog WHERE id = $1`, modelID).Scan(&owner); err != nil {
		t.Fatalf("row must still exist after unbind: %v", err)
	}
	if owner != nil {
		t.Fatalf("logical_model_id should be NULL after unbind, got %v", *owner)
	}
	if err := store.Pool.QueryRow(ctx, `SELECT count(*) FROM model_catalog WHERE id = $1`, modelID).Scan(&count); err != nil || count != 1 {
		t.Fatalf("unbind must not delete the row: count=%d err=%v", count, err)
	}

	// 解绑后再绑别的逻辑模型：不再冲突
	if _, err := store.BindCandidates(ctx, "image-t2i-low", BindCandidatesInput{ModelIDs: []string{modelID}}); err != nil {
		t.Fatalf("rebind after unbind: %v", err)
	}
	// 已属于另一个逻辑模型 → 409；不存在 → 404；逻辑模型不存在 → 404
	if err := store.UnbindCandidate(ctx, "image-t2i-high", modelID); err == nil {
		t.Fatal("unbind from the wrong logical model should conflict")
	} else {
		var elsewhere ErrModelBoundElsewhere
		if !errors.As(err, &elsewhere) || elsewhere.LogicalModelID != "image-t2i-low" {
			t.Fatalf("expected ErrModelBoundElsewhere(image-t2i-low), got %v", err)
		}
	}
	if err := store.UnbindCandidate(ctx, "image-t2i-high", "mod_absent"); err == nil {
		t.Fatal("unbind of an unknown model should fail")
	} else {
		var missingModel ErrModelNotFound
		if !errors.As(err, &missingModel) || len(missingModel.ModelIDs) != 1 || missingModel.ModelIDs[0] != "mod_absent" {
			t.Fatalf("expected ErrModelNotFound(mod_absent), got %v", err)
		}
	}
	if err := store.UnbindCandidate(ctx, "nope-model", modelID); err != ErrNotFound {
		t.Fatalf("unbind under an unknown logical model should be ErrNotFound, got %v", err)
	}
}

func TestPostgresLogicalModelCRUD(t *testing.T) {
	store := testPostgresStore(t)
	ctx := context.Background()
	sort := 20
	created, err := store.CreateLogicalModel(ctx, "usr_1", LogicalModelCreate{
		ID: "image-t2i-high", Label: "文生图 · 高质量", Type: "image", Status: "disabled", Sort: &sort, Note: "note",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if created.ID != "image-t2i-high" || created.Status != "disabled" || created.Sort != 20 || created.CreatedBy != "usr_1" {
		t.Fatalf("unexpected created model: %+v", created)
	}
	if _, err := store.CreateLogicalModel(ctx, "usr_1", LogicalModelCreate{ID: "image-t2i-high", Label: "dup", Type: "image"}); err != ErrDuplicate {
		t.Fatalf("duplicate id should be ErrDuplicate, got %v", err)
	}
	seedLogicalModel(t, store, "image-t2i-low")
	models, err := store.ListLogicalModels(ctx, "", "")
	if err != nil || len(models) != 2 {
		t.Fatalf("list all: models=%d err=%v", len(models), err)
	}
	models, err = store.ListLogicalModels(ctx, "disabled", "image")
	if err != nil || len(models) != 1 || models[0].ID != "image-t2i-high" {
		t.Fatalf("filtered list: models=%+v err=%v", models, err)
	}

	label, status, capability := "新展示名", "enabled", "t2i"
	updated, err := store.UpdateLogicalModel(ctx, "image-t2i-high", LogicalModelPatch{
		Label: &label, Status: &status, Capability: &capability,
	})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.Label != "新展示名" || updated.Status != "enabled" || updated.Capability != "t2i" || updated.Sort != 20 {
		t.Fatalf("unexpected updated model: %+v", updated)
	}
	// 未提供的字段保持原值；显式清空 capability → NULL
	empty := ""
	cleared, err := store.UpdateLogicalModel(ctx, "image-t2i-high", LogicalModelPatch{Capability: &empty})
	if err != nil {
		t.Fatalf("clear capability: %v", err)
	}
	if cleared.Capability != "" || cleared.Label != "新展示名" || cleared.Sort != 20 {
		t.Fatalf("unexpected cleared model: %+v", cleared)
	}
	// id 不可修改（store 层兜底）
	if _, err := store.UpdateLogicalModel(ctx, "image-t2i-high", LogicalModelPatch{ID: "image-t2i-low"}); err != ErrLogicalModelIDImmutable {
		t.Fatalf("store must reject an id change, got %v", err)
	}
	if _, err := store.UpdateLogicalModel(ctx, "nope-model", LogicalModelPatch{Label: &label}); err != ErrNotFound {
		t.Fatalf("update of unknown model should be ErrNotFound, got %v", err)
	}
	if _, err := store.GetLogicalModel(ctx, "nope-model"); err != ErrNotFound {
		t.Fatalf("get of unknown model should be ErrNotFound, got %v", err)
	}
}

// 幂等：同一 modelId 重复出现在请求里只应更新一次，且不报冲突。
func TestPostgresBindCandidatesIsIdempotent(t *testing.T) {
	store := testPostgresStore(t)
	ctx := context.Background()
	seedLogicalModel(t, store, "image-t2i-high")
	modelID := seedCandidate(t, store, "mod_idempotent", "family-i", "origin-i")
	priority := 40
	for range 2 {
		if _, err := store.BindCandidates(ctx, "image-t2i-high", BindCandidatesInput{
			ModelIDs: []string{modelID, modelID}, RoutePriority: &priority,
		}); err != nil {
			t.Fatalf("repeated bind must be idempotent: %v", err)
		}
	}
	candidates, err := store.ListCandidates(ctx, "image-t2i-high")
	if err != nil || len(candidates) != 1 {
		t.Fatalf("candidates=%d err=%v", len(candidates), err)
	}
	if candidates[0].RoutePriority != priority {
		t.Fatalf("route_priority = %d, want %d", candidates[0].RoutePriority, priority)
	}
}

func candidateIDs(candidates []Candidate) string {
	ids := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		ids = append(ids, candidate.ID)
	}
	return fmt.Sprintf("%v", ids)
}

// 并发绑定竞争：同一 model_catalog 行不得被两个逻辑模型同时抢走。
// 事务内对候选行 FOR UPDATE，落败方必须看到 409（而不是静默改写）。
func TestPostgresConcurrentBindDoesNotPreempt(t *testing.T) {
	store := testPostgresStore(t)
	ctx := context.Background()
	seedLogicalModel(t, store, "image-t2i-high")
	seedLogicalModel(t, store, "image-t2i-low")
	modelID := seedCandidate(t, store, "mod_contended", "family-contended", "origin-contended")

	targets := []string{"image-t2i-high", "image-t2i-low"}
	errs := make([]error, len(targets))
	start := make(chan struct{})
	var wait sync.WaitGroup
	for i, target := range targets {
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			_, errs[i] = store.BindCandidates(context.Background(), target, BindCandidatesInput{ModelIDs: []string{modelID}})
		}()
	}
	close(start)
	wait.Wait()

	winners, conflicts := 0, 0
	for i, err := range errs {
		switch {
		case err == nil:
			winners++
		default:
			var elsewhere ErrModelsBoundElsewhereList
			if !errors.As(err, &elsewhere) {
				t.Fatalf("bind to %s: unexpected error %v", targets[i], err)
			}
			conflicts++
		}
	}
	if winners != 1 || conflicts != 1 {
		t.Fatalf("exactly one bind must win: winners=%d conflicts=%d errs=%v", winners, conflicts, errs)
	}
	// 最终绑定必须唯一且与胜者一致
	var owner *string
	if err := store.Pool.QueryRow(ctx, `SELECT logical_model_id FROM model_catalog WHERE id = $1`, modelID).Scan(&owner); err != nil {
		t.Fatal(err)
	}
	if owner == nil {
		t.Fatal("the winning bind must persist")
	}
	var bound int
	if err := store.Pool.QueryRow(ctx, `SELECT count(*) FROM model_catalog WHERE id = $1 AND logical_model_id = $2`, modelID, *owner).Scan(&bound); err != nil || bound != 1 {
		t.Fatalf("binding must be recorded exactly once: count=%d err=%v", bound, err)
	}
}
