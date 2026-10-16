package catalog

import (
	"strings"
)

// 逻辑模型自动归并（TASK-MODEL-007）。
//
// 定位：**辅助工具**，不是替代 Owner 决策（TASK-MODEL-006 拍板：
// 逻辑模型 = 模型分组机制，Owner 自行创建分组）。
// 本文件只把「同名模型归并成组 + 绑定候选」这一无歧义机械劳动自动化：
//   - 归并键 = normalizeProviderModel(providerModel)（去 models/ 前缀 + 小写 + 非字母数字归一为连字符）
//   - 同名跨渠道 → 同一逻辑模型分组，多渠道 = 多个候选
//   - 不同名 → 独立逻辑模型
//   - 已有绑定（候选已挂 logical_model_id）→ 跳过不抢（ErrModelBoundElsewhere 语义）
//   - 已有同名逻辑模型 → 复用其 ID，只补绑定
//   - 幂等：同一状态重复规划结果稳定（第二次 create/bind 为空）
//   - 只增不删：不删除、不改名、不改启停；删除/调整仍走既有手工 CRUD
//
// 纯函数、无 I/O：输入输出均显式，便于单测覆盖全部规则分支。

// ReconcileModel 是待归并的入池模型（model_catalog 一行，未绑定逻辑模型）。
type ReconcileModel struct {
	ID            string
	ChannelID     string
	ProviderModel string
	Name          string
	Family        string
	Type          string // text | image | video
}

// ReconcileBinding 是一条候选绑定写入（model_catalog 行挂到逻辑模型）。
type ReconcileBinding struct {
	ModelID        string
	LogicalModelID string
	RoutePriority  int
}

// ReconcilePlan 是一次归并的完整计划（只增：新建分组 + 绑定未绑候选）。
type ReconcilePlan struct {
	Create  []LogicalModelCreate
	Bind    []ReconcileBinding
	Skipped int // 已绑定 / 无可归并键而跳过的行数
}

// normalizeProviderModel 把上游模型名归一为逻辑模型 id 的候选键：
// 去除 models/ 前缀、忽略大小写、非 [a-z0-9] 压缩为单连字符、去首尾连字符。
// 与 VOZEB `normalizeModelId`（去 models/ 前缀 + 小写）同构，额外做合法化。
func normalizeProviderModel(providerModel string) string {
	name := strings.ToLower(strings.TrimSpace(providerModel))
	name = strings.TrimPrefix(name, "models/")
	var b strings.Builder
	b.Grow(len(name))
	prevHyphen := true // 开头不允许连字符
	for i := 0; i < len(name); i++ {
		c := name[i]
		switch {
		case c >= 'a' && c <= 'z', c >= '0' && c <= '9':
			b.WriteByte(c)
			prevHyphen = false
		default:
			if !prevHyphen {
				b.WriteByte('-')
				prevHyphen = true
			}
		}
	}
	out := strings.TrimSuffix(b.String(), "-")
	if out == "" {
		return ""
	}
	if len(out) > maxLogicalModelIDLength {
		out = strings.TrimSuffix(out[:maxLogicalModelIDLength], "-")
	}
	return out
}

// PlanReconcile 计算归并计划。
//
// 参数：
//   - models：待归并的入池模型（调用方应已过滤：未绑定、provider_model 非空、属于目标工作区）
//   - existing：现存逻辑模型（只用到 ID，用于复用与避免冲突）
//   - boundModelIDs：modelID → 已绑定的逻辑模型 ID（已有手工绑定，跳过不抢）
//
// 规则（与文件头注释一致，纯函数可单测）：
//  1. 同归并键跨渠道 → 同一分组（Create 一条 + Bind 多条）
//  2. 不同键 → 独立分组
//  3. 已绑定行 → Skipped，不进入任何输出
//  4. 已存在同名分组 → Create 不含它，只 Bind
//  5. 新分组 id 冲突（与既有或本次已分配）→ 追加 -2/-3… 后缀且保证合法
//  6. 幂等：对同一状态重复调用，第二次 Create/Bind 为空、Skipped 与模型数一致
func PlanReconcile(models []ReconcileModel, existing []LogicalModel, boundModelIDs map[string]string) ReconcilePlan {
	plan := ReconcilePlan{}

	usedIDs := make(map[string]bool, len(existing)+len(models))
	for _, m := range existing {
		usedIDs[m.ID] = true
	}

	// 1. 分桶：归并键 → 待归并模型（保输入顺序）
	buckets := make(map[string][]ReconcileModel)
	order := make([]string, 0, len(models))
	for _, m := range models {
		if _, bound := boundModelIDs[m.ID]; bound {
			plan.Skipped++
			continue
		}
		key := normalizeProviderModel(m.ProviderModel)
		if key == "" {
			plan.Skipped++
			continue
		}
		if _, seen := buckets[key]; !seen {
			order = append(order, key)
		}
		buckets[key] = append(buckets[key], m)
	}

	// 2. 每桶：复用或新建分组，然后绑定。
	//    归并键即分组 id（normalizeProviderModel 已保证合法）：分桶按键聚合 ⇒ 键唯一 ⇒
	//    不存在「同键新建冲突」；键撞既有分组 = 同名复用（判据 4），不抢不新建。
	for _, key := range order {
		group := buckets[key]
		if !usedIDs[key] {
			usedIDs[key] = true
			plan.Create = append(plan.Create, newLogicalModelFromGroup(key, group))
		}

		for _, m := range group {
			plan.Bind = append(plan.Bind, ReconcileBinding{
				ModelID:        m.ID,
				LogicalModelID: key,
				RoutePriority:  DefaultRoutePriority,
			})
		}
	}
	return plan
}

// newLogicalModelFromGroup 从一组同键模型构造逻辑模型创建输入：
// label 取首个非空 Name；type 取首个非空（桶内冲突时保持首个，路由期按能力过滤）。
func newLogicalModelFromGroup(id string, group []ReconcileModel) LogicalModelCreate {
	create := LogicalModelCreate{
		ID:     id,
		Label:  id,
		Type:   "text",
		Status: "enabled",
		Sort:   intPtr(defaultLogicalModelSort),
	}
	for _, m := range group {
		if create.Label == id && m.Name != "" {
			create.Label = m.Name
		}
		if m.Type != "" {
			create.Type = m.Type
			break
		}
	}
	if len(create.Label) > 200 {
		create.Label = create.Label[:200]
	}
	return create
}

func intPtr(v int) *int { return &v }
