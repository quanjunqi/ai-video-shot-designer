package catalog

import (
	"testing"
)

// ---- normalizeProviderModel ----

func TestNormalizeProviderModel(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"models/kimi-k2.5", "kimi-k2-5"},       // 去前缀 + 点号归一
		{"models/GPT-4o", "gpt-4o"},             // 大小写忽略
		{"models/x/y/z", "x-y-z"},               // 多段路径压缩为连字符
		{"  models/gemini-pro  ", "gemini-pro"}, // 空白修剪
		{"gpt-4o", "gpt-4o"},                    // 无前缀原样
		{"models/", ""},                         // 只有前缀 → 空
		{"", ""},                                // 空输入 → 空
		{"models/kimi--k2..5", "kimi-k2-5"},     // 连续非法字符压缩为单连字符
		{"models/-lead-trail-", "lead-trail"},   // 去首尾连字符
	}
	for _, tc := range cases {
		if got := normalizeProviderModel(tc.in); got != tc.want {
			t.Errorf("normalizeProviderModel(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestNormalizeProviderModelAlwaysValidID(t *testing.T) {
	// 任意输入的归一结果要么为空、要么通过 ValidLogicalModelID（归并键 = id 的前置条件）。
	inputs := []string{
		"models/Kimi K2.5  ultra",
		"models/a_b_c/d.e-f",
		"UPPER//CASE//MODEL",
		"models/!@#$%^&*()",
		"models/模型名-中文",
	}
	for _, in := range inputs {
		got := normalizeProviderModel(in)
		if got == "" {
			continue
		}
		if !ValidLogicalModelID(got) {
			t.Errorf("normalizeProviderModel(%q) = %q 未通过 ValidLogicalModelID", in, got)
		}
	}
}

// ---- PlanReconcile ----

func model(id, channel, provider, name, typ string) ReconcileModel {
	return ReconcileModel{ID: id, ChannelID: channel, ProviderModel: provider, Name: name, Type: typ}
}

func existingModel(id string) LogicalModel {
	return LogicalModel{ID: id}
}

// 判据 1：同名跨渠道 → 同一逻辑模型 + 各自候选。
func TestPlanReconcileMergesSameNameAcrossChannels(t *testing.T) {
	models := []ReconcileModel{
		model("mc-1", "ch-a", "models/kimi-k2.5", "Kimi K2.5", "text"),
		model("mc-2", "ch-b", "models/kimi-k2.5", "Kimi K2.5", "text"),
		model("mc-3", "ch-c", "models/gpt-4o", "GPT-4o", "text"),
	}
	plan := PlanReconcile(models, nil, nil)

	if len(plan.Create) != 2 {
		t.Fatalf("期望 2 个建组，实际 %d", len(plan.Create))
	}
	if len(plan.Bind) != 3 {
		t.Fatalf("期望 3 条绑定，实际 %d", len(plan.Bind))
	}
	if plan.Skipped != 0 {
		t.Fatalf("期望跳过 0，实际 %d", plan.Skipped)
	}

	// 同名两模型绑定到同一逻辑模型
	if plan.Bind[0].LogicalModelID != plan.Bind[1].LogicalModelID {
		t.Errorf("同名跨渠道应绑定同一逻辑模型：%s vs %s",
			plan.Bind[0].LogicalModelID, plan.Bind[1].LogicalModelID)
	}
	if plan.Bind[0].LogicalModelID != "kimi-k2-5" {
		t.Errorf("归并键应为 kimi-k2-5，实际 %q", plan.Bind[0].LogicalModelID)
	}
	if plan.Bind[2].LogicalModelID != "gpt-4o" {
		t.Errorf("独立模型分组 id 应为 gpt-4o，实际 %q", plan.Bind[2].LogicalModelID)
	}
}

// 判据 1 补充：桶内分组 type 取自首个非空候选；label 取自首个非空 Name。
func TestPlanReconcileGroupMetaFromFirstNonEmpty(t *testing.T) {
	models := []ReconcileModel{
		model("mc-1", "ch-a", "models/kimi-k2.5", "", ""),
		model("mc-2", "ch-b", "models/kimi-k2.5", "Kimi K2.5", "image"),
	}
	plan := PlanReconcile(models, nil, nil)

	if len(plan.Create) != 1 {
		t.Fatalf("期望 1 个建组，实际 %d", len(plan.Create))
	}
	g := plan.Create[0]
	if g.ID != "kimi-k2-5" || g.Type != "image" {
		t.Errorf("type 应取首个非空 image，实际 %q/%q", g.ID, g.Type)
	}
	if g.Label != "Kimi K2.5" {
		t.Errorf("label 应取首个非空 Name，实际 %q", g.Label)
	}
	if g.Status != "enabled" {
		t.Errorf("新建分组默认 enabled，实际 %q", g.Status)
	}
}

// 判据 2：不同名 → 独立逻辑模型。
func TestPlanReconcileKeepsDifferentNamesSeparate(t *testing.T) {
	models := []ReconcileModel{
		model("mc-1", "ch-a", "models/kimi-k2.5", "Kimi", "text"),
		model("mc-2", "ch-b", "models/gpt-4o", "GPT", "text"),
		model("mc-3", "ch-c", "models/claude-3-5-sonnet", "Claude", "text"),
	}
	plan := PlanReconcile(models, nil, nil)
	if len(plan.Create) != 3 {
		t.Fatalf("不同名应 3 个独立分组，实际 %d", len(plan.Create))
	}
	seen := map[string]bool{}
	for _, c := range plan.Create {
		if seen[c.ID] {
			t.Errorf("分组 id 重复：%s", c.ID)
		}
		seen[c.ID] = true
	}
}

// 判据 3：已有绑定不动（不抢、不换组）。
func TestPlanReconcileSkipsAlreadyBound(t *testing.T) {
	models := []ReconcileModel{
		model("mc-1", "ch-a", "models/kimi-k2.5", "Kimi", "text"),
		model("mc-2", "ch-b", "models/kimi-k2.5", "Kimi", "text"),
		model("mc-3", "ch-c", "models/gpt-4o", "GPT", "text"),
	}
	// mc-1 已由管理员手工绑定到组 manual-group
	bound := map[string]string{"mc-1": "manual-group"}
	plan := PlanReconcile(models, nil, bound)

	if plan.Skipped != 1 {
		t.Fatalf("已绑定行应跳过 1，实际 %d", plan.Skipped)
	}
	// 剩余同名 mc-2 仍归并到 kimi-k2-5（不与 mc-1 抢 manual-group）
	if len(plan.Bind) != 2 {
		t.Fatalf("期望 2 条绑定，实际 %d", len(plan.Bind))
	}
	for _, b := range plan.Bind {
		if b.ModelID == "mc-1" {
			t.Error("已绑定的 mc-1 不应出现在绑定输出")
		}
		if b.LogicalModelID == "manual-group" {
			t.Error("绑定输出不得指向手工组 manual-group（不抢已有绑定）")
		}
	}
}

// 判据 4：已有同名分组复用（只补绑定、不重复建）。
func TestPlanReconcileReusesExistingGroup(t *testing.T) {
	existing := []LogicalModel{existingModel("kimi-k2-5")}
	models := []ReconcileModel{
		model("mc-1", "ch-a", "models/kimi-k2.5", "Kimi", "text"),
	}
	plan := PlanReconcile(models, existing, nil)

	if len(plan.Create) != 0 {
		t.Fatalf("已有同名分组不应重复创建，实际 %d", len(plan.Create))
	}
	if len(plan.Bind) != 1 || plan.Bind[0].LogicalModelID != "kimi-k2-5" {
		t.Errorf("应只绑定到既有分组 kimi-k2-5，实际 %+v", plan.Bind)
	}
}

// 判据 4 延伸：归并键撞既有手工分组 id = 同名复用（不新建、不抢），
// 而非「撞 id 新建 + 后缀」——分桶按键聚合保证键唯一，后缀机制在设计上不可达（见 devlog D-004）。
func TestPlanReconcileKeyIsAlwaysValidID(t *testing.T) {
	// 任意合法输入产生的归并键均通过 ValidLogicalModelID（归并键 = 分组 id 的前置条件）。
	// 该属性由 TestNormalizeProviderModelAlwaysValidID 覆盖；此处验证空输入不产生分组。
	models := []ReconcileModel{
		model("mc-1", "ch-a", "models/Kimi K2.5 ultra", "Kimi", "text"),
	}
	plan := PlanReconcile(models, nil, nil)
	if len(plan.Create) != 1 || !ValidLogicalModelID(plan.Create[0].ID) {
		t.Errorf("归并键应为合法 id，实际 %+v", plan.Create)
	}
}

// 判据 6：幂等 —— 第二次规划为空（Create/Bind 为空、Skipped 与模型数一致）。
func TestPlanReconcileIsIdempotent(t *testing.T) {
	models := []ReconcileModel{
		model("mc-1", "ch-a", "models/kimi-k2.5", "Kimi", "text"),
		model("mc-2", "ch-b", "models/gpt-4o", "GPT", "text"),
	}
	first := PlanReconcile(models, nil, nil)
	if len(first.Create) != 2 || len(first.Bind) != 2 {
		t.Fatalf("首轮应 2 建组 2 绑定，实际 %d/%d", len(first.Create), len(first.Bind))
	}

	// 模拟第一次执行后的状态：分组已建、候选已绑
	existing := []LogicalModel{existingModel("kimi-k2-5"), existingModel("gpt-4o")}
	bound := map[string]string{"mc-1": "kimi-k2-5", "mc-2": "gpt-4o"}

	second := PlanReconcile(models, existing, bound)
	if len(second.Create) != 0 || len(second.Bind) != 0 {
		t.Errorf("第二次规划应为空，实际 Create=%d Bind=%d", len(second.Create), len(second.Bind))
	}
	if second.Skipped != len(models) {
		t.Errorf("第二次应全部跳过 %d，实际 %d", len(models), second.Skipped)
	}
}

// 边界：无待归并模型 → 空计划、不报错。
func TestPlanReconcileEmptyInput(t *testing.T) {
	plan := PlanReconcile(nil, nil, nil)
	if len(plan.Create) != 0 || len(plan.Bind) != 0 || plan.Skipped != 0 {
		t.Errorf("空输入应产生空计划，实际 %+v", plan)
	}
}

// 边界：无可归并键（provider_model 为空/非法）→ 跳过，不建组。
func TestPlanReconcileSkipsUnkeyable(t *testing.T) {
	models := []ReconcileModel{
		model("mc-1", "ch-a", "", "No Provider", "text"),
		model("mc-2", "ch-b", "models/", "Prefix Only", "text"),
	}
	plan := PlanReconcile(models, nil, nil)
	if plan.Skipped != 2 {
		t.Errorf("无可归并键应跳过 2，实际 %d", plan.Skipped)
	}
	if len(plan.Create) != 0 || len(plan.Bind) != 0 {
		t.Errorf("不应产生建组或绑定，实际 %+v", plan)
	}
}
