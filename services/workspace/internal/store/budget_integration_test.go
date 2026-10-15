package store

import (
	"testing"
)

// 预算规则集成测试：复用 testStore（随机 schema + 全量迁移）。
// 判据 1（迁移可应用、表结构含维度/周期/上限/动作/状态）+ 配置生效读写。
func TestBudgetRulesCRUD(t *testing.T) {
	s, ctx := testStore(t)

	// 写入工作区级日预算（block）
	saved, err := s.UpsertBudgetRule(ctx, "ws_dev", BudgetRule{
		ID: "b1", Scope: "workspace", Period: "day",
		LimitAmount: 500, Action: "block", WarnAt: 0.8, Enabled: true,
	})
	if err != nil {
		t.Fatalf("upsert workspace budget rule: %v", err)
	}
	if saved.WorkspaceID != "ws_dev" {
		t.Fatalf("workspace rule must bind workspace_id, got %q", saved.WorkspaceID)
	}

	// 写入租户级月预算（warn）
	if _, err := s.UpsertBudgetRule(ctx, "ws_dev", BudgetRule{
		ID: "b2", Scope: "tenant", Period: "month",
		LimitAmount: 10000, Action: "warn", WarnAt: 0.8, Enabled: true,
	}); err != nil {
		t.Fatalf("upsert tenant budget rule: %v", err)
	}

	// 列表：租户级 + 工作区级都在
	all, err := s.ListBudgetRules(ctx, "ws_dev")
	if err != nil {
		t.Fatalf("list budget rules: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("expected 2 rules, got %d: %+v", len(all), all)
	}

	// 生效规则：都 enabled → 2 条
	effective, err := s.EffectiveBudgetRules(ctx, "ws_dev")
	if err != nil {
		t.Fatalf("effective budget rules: %v", err)
	}
	if len(effective) != 2 {
		t.Fatalf("expected 2 effective rules, got %d", len(effective))
	}

	// 禁用租户级 → 生效规则只剩工作区级
	if _, err := s.UpsertBudgetRule(ctx, "ws_dev", BudgetRule{
		ID: "b2", Scope: "tenant", Period: "month",
		LimitAmount: 10000, Action: "warn", WarnAt: 0.8, Enabled: false,
	}); err != nil {
		t.Fatalf("disable tenant rule: %v", err)
	}
	effective, err = s.EffectiveBudgetRules(ctx, "ws_dev")
	if err != nil {
		t.Fatal(err)
	}
	if len(effective) != 1 || effective[0].Scope != "workspace" {
		t.Fatalf("disabled rule must be excluded, got %+v", effective)
	}

	// 其他工作区只能看到租户级规则，看不到本工作区的工作区级规则
	other, err := s.ListBudgetRules(ctx, "ws_other")
	if err != nil {
		t.Fatal(err)
	}
	if len(other) != 1 || other[0].Scope != "tenant" {
		t.Fatalf("other workspace must only see tenant rules, got %+v", other)
	}

	// 删除工作区级日预算
	if err := s.DeleteBudgetRule(ctx, "ws_dev", "day"); err != nil {
		t.Fatalf("delete budget rule: %v", err)
	}
	after, err := s.ListBudgetRules(ctx, "ws_dev")
	if err != nil {
		t.Fatal(err)
	}
	if len(after) != 1 || after[0].Period != "month" {
		t.Fatalf("after delete day rule, only month remains, got %+v", after)
	}
}

// 判据 3 例外：无预算规则行时列表/生效查询不报错（默认放行语义）。
func TestBudgetRulesEmptyWorkspaceNoError(t *testing.T) {
	s, ctx := testStore(t)
	items, err := s.ListBudgetRules(ctx, "ws_none")
	if err != nil {
		t.Fatalf("empty workspace list must not error: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("expected empty, got %d", len(items))
	}
}
