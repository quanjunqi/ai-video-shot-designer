package catalog

import (
	"context"
	"testing"
)

// seedUnboundCandidate 插入一行未绑定逻辑模型的 model_catalog（可指定 provider_model / workspace）。
func seedUnboundCandidate(t *testing.T, store PostgresStore, id, providerModel, modelType, workspaceID string) {
	t.Helper()
	ctx := context.Background()
	if _, err := store.Pool.Exec(ctx, `INSERT INTO model_catalog (id, channel_id, family, name, provider_model, type, status, workspace_id)
	    VALUES ($1, $2, $3, $4, $5, $6, 'enabled', $7)`,
		id, "ch-"+workspaceID, "family-"+id, "显示名 "+id, providerModel, modelType, workspaceID); err != nil {
		t.Fatalf("seed unbound model %s: %v", id, err)
	}
}

// 判据 1+4（真库）：同名跨渠道 → 1 建组 + 2 绑定；第二次调用幂等 created=0。
func TestPostgresReconcileMergesSameNameAndIsIdempotent(t *testing.T) {
	store := testPostgresStore(t)
	ctx := context.Background()
	seedUnboundCandidate(t, store, "mc_a1", "models/kimi-k2.5", "text", "ws_r")
	seedUnboundCandidate(t, store, "mc_a2", "models/kimi-k2.5", "text", "ws_r")
	seedUnboundCandidate(t, store, "mc_b1", "models/gpt-4o", "text", "ws_r")

	result, err := store.ReconcileLogicalModels(ctx, "ws_r", "usr_1")
	if err != nil {
		t.Fatalf("first reconcile: %v", err)
	}
	if result.Created != 2 {
		t.Errorf("首轮应建 2 组（kimi-k2-5 + gpt-4o），实际 %d", result.Created)
	}
	if result.Bound != 3 {
		t.Errorf("首轮应绑 3 行，实际 %d", result.Bound)
	}

	// 同名两行绑定到同一分组
	var logicalID string
	if err := store.Pool.QueryRow(ctx, `SELECT logical_model_id FROM model_catalog WHERE id = 'mc_a1'`).Scan(&logicalID); err != nil {
		t.Fatal(err)
	}
	if logicalID != "kimi-k2-5" {
		t.Errorf("mc_a1 应归入 kimi-k2-5，实际 %q", logicalID)
	}
	var logicalID2 string
	if err := store.Pool.QueryRow(ctx, `SELECT logical_model_id FROM model_catalog WHERE id = 'mc_a2'`).Scan(&logicalID2); err != nil {
		t.Fatal(err)
	}
	if logicalID2 != logicalID {
		t.Errorf("同名跨渠道应绑定同一分组：%q vs %q", logicalID, logicalID2)
	}

	// 幂等：第二次 created=0、bound=0
	result, err = store.ReconcileLogicalModels(ctx, "ws_r", "usr_1")
	if err != nil {
		t.Fatalf("second reconcile: %v", err)
	}
	if result.Created != 0 || result.Bound != 0 {
		t.Errorf("幂等调用应 0 建 0 绑，实际 created=%d bound=%d", result.Created, result.Bound)
	}
}

// 判据 3（真库）：已有手工绑定不动 —— 预绑定行不换组、不统计；其余行正常归并。
func TestPostgresReconcileKeepsExistingBinding(t *testing.T) {
	store := testPostgresStore(t)
	ctx := context.Background()
	seedUnboundCandidate(t, store, "mc_manual", "models/manual-model", "text", "ws_r")
	seedUnboundCandidate(t, store, "mc_free", "models/free-model", "text", "ws_r")
	seedLogicalModel(t, store, "manual-group")
	// 预绑定：mc_manual 手工挂到 manual-group
	if _, err := store.BindCandidates(ctx, "manual-group", BindCandidatesInput{ModelIDs: []string{"mc_manual"}}); err != nil {
		t.Fatalf("pre-bind manual: %v", err)
	}

	result, err := store.ReconcileLogicalModels(ctx, "ws_r", "usr_1")
	if err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	if result.Created != 1 {
		t.Errorf("只应建 free-model 一组，实际 %d", result.Created)
	}
	if result.Bound != 1 || result.Skipped != 0 {
		t.Errorf("只应绑 free-model 一行，实际 bound=%d skipped=%d", result.Bound, result.Skipped)
	}
	// 手工绑定未被动
	var owner string
	if err := store.Pool.QueryRow(ctx, `SELECT logical_model_id FROM model_catalog WHERE id = 'mc_manual'`).Scan(&owner); err != nil {
		t.Fatal(err)
	}
	if owner != "manual-group" {
		t.Errorf("手工绑定应保持 manual-group，实际 %q", owner)
	}
}

// 判据 6 补充（真库）：空 provider_model 行计入 skipped、不建组。
func TestPostgresReconcileSkipsUnkeyableRows(t *testing.T) {
	store := testPostgresStore(t)
	ctx := context.Background()
	seedUnboundCandidate(t, store, "mc_blank", "", "text", "ws_r")
	seedUnboundCandidate(t, store, "mc_ok", "models/ok-model", "text", "ws_r")

	result, err := store.ReconcileLogicalModels(ctx, "ws_r", "usr_1")
	if err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	if result.Skipped != 1 {
		t.Errorf("空 provider_model 行应计入 skipped=1，实际 %d", result.Skipped)
	}
	if result.Created != 1 || result.Bound != 1 {
		t.Errorf("应只归并 ok-model：created=%d bound=%d", result.Created, result.Bound)
	}
}

// 工作区隔离：reconcile 只处理当前工作区行，其它工作区（含平台行 ”）不被动。
func TestPostgresReconcileIsWorkspaceScoped(t *testing.T) {
	store := testPostgresStore(t)
	ctx := context.Background()
	seedUnboundCandidate(t, store, "mc_ws_a", "models/shared-model", "text", "ws_a")
	seedUnboundCandidate(t, store, "mc_ws_b", "models/shared-model", "text", "ws_b")
	seedUnboundCandidate(t, store, "mc_platform", "models/shared-model", "text", "")

	result, err := store.ReconcileLogicalModels(ctx, "ws_a", "usr_1")
	if err != nil {
		t.Fatalf("reconcile ws_a: %v", err)
	}
	if result.Bound != 1 {
		t.Errorf("ws_a 只应绑自己的一行，实际 bound=%d", result.Bound)
	}
	var ownerB, ownerPlatform *string
	if err := store.Pool.QueryRow(ctx, `SELECT logical_model_id FROM model_catalog WHERE id = 'mc_ws_b'`).Scan(&ownerB); err != nil {
		t.Fatal(err)
	}
	if err := store.Pool.QueryRow(ctx, `SELECT logical_model_id FROM model_catalog WHERE id = 'mc_platform'`).Scan(&ownerPlatform); err != nil {
		t.Fatal(err)
	}
	if ownerB != nil || ownerPlatform != nil {
		t.Errorf("其它工作区/平台行不应被本工作区 reconcile 动：ws_b=%v platform=%v", ownerB, ownerPlatform)
	}
}

// 已有同名分组复用（真库）：先手工建组 kimi-k2-5，再 reconcile 同名模型 → 不建新组、只补绑定。
func TestPostgresReconcileReusesExistingGroup(t *testing.T) {
	store := testPostgresStore(t)
	ctx := context.Background()
	seedLogicalModel(t, store, "kimi-k2-5")
	seedUnboundCandidate(t, store, "mc_new", "models/kimi-k2.5", "text", "ws_r")

	result, err := store.ReconcileLogicalModels(ctx, "ws_r", "usr_1")
	if err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	if result.Created != 0 || result.Bound != 1 {
		t.Errorf("应复用既有分组、只补绑定：created=%d bound=%d", result.Created, result.Bound)
	}
	var owner string
	if err := store.Pool.QueryRow(ctx, `SELECT logical_model_id FROM model_catalog WHERE id = 'mc_new'`).Scan(&owner); err != nil {
		t.Fatal(err)
	}
	if owner != "kimi-k2-5" {
		t.Errorf("应绑定到既有分组 kimi-k2-5，实际 %q", owner)
	}
}
