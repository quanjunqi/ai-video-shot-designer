package catalog

import (
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"sort"
)

// ErrModelNotResolved：既不是具体的 model_catalog 行 id，也不是一个有可用候选的逻辑模型 id。
var ErrModelNotResolved = errors.New("catalog: model not found (neither a catalog model id nor a logical model with enabled candidates)")

// ErrNoCandidateForMode：模型**找得到**（有启用的候选），但没有任何候选**显式声明**支持请求的 mode。
//
// 刻意不复用 ErrModelNotResolved：语义不同（一个是"找不到模型"，一个是"模型在、但没有候选支持该能力"），
// 排障动作也不同（前者查目录/候选绑定，后者查 model_catalog.capability.modes 的声明是否漏写/词表不一致）。
// 合成一个错误会让排障从"看错误码"退化成"读日志猜"。
var ErrNoCandidateForMode = errors.New("catalog: no enabled candidate declares support for the requested mode")

// Resolve 解析"调用方给的这个 id 该用哪个/哪些上游实现"（ADR-003 的候选解析）。
//
// 两条路径，顺序不可颠倒 —— 这是**向后兼容**的关键：
//
//  1. **具体行 id 命中** ⇒ 只返回那一行（与实现本函数之前的行为**完全一致**）。
//     存量的 `logical_model_id IS NULL` 行因此不受影响；逻辑模型 id 与行 id 撞名时，
//     具体优先于抽象。这一支**刻意不看 status**：旧行为就不看，改它会悄悄改变存量渠道的可用性。
//  2. 否则按**逻辑模型 id** 找候选：`logicalModelId == id` 且 `status == "enabled"`，
//     按 routePriority 升序（同优先级按 id 升序，保证**确定性** ——
//     否则同一个请求在不同实例上可能路由到不同渠道，排障会变成猜谜）。
//
// 返回的切片是**候选序列**：第 0 个是首选，其余是备用（失败切换按此顺序）。
// P3-1 只用第 0 个；P3-2 在这里逐个尝试。
//
// 本函数是 ResolveFor(dir, modelID, "") 的别名：**不传 mode ⇒ 不做任何能力过滤**，
// 行为与引入能力过滤之前逐字一致（调用方拿不到请求 mode 时就走这条）。
func Resolve(dir Directory, modelID string) ([]Model, error) {
	return ResolveFor(dir, modelID, "")
}

// ResolveFor 是 Resolve 的**按能力过滤候选**版本（TASK-MODEL-006 判据 6）。
//
// 过滤只依据「**显式声明**」；未声明 ≠ 不支持（本项目能力数据纪律：无依据留空，缺失 = 未知）：
//
//   - 候选声明了 capability.modes 且**不含** requiredMode ⇒ **剔除**
//   - 候选**未声明** capability.modes（键缺失、空数组、capability 为空或解析失败）⇒ **保留**（无断言）
//   - requiredMode == ""（调用方拿不到请求的 mode）⇒ **不过滤**，与 Resolve 完全一致
//
// 为什么"未声明"必须保留而不能当"不支持"：capability 数据是**渐进补齐**的。
// 实测（2026-10-17，production.model_catalog 共 3 行）只有 mod_pearapi_seedance25 一行
// 声明了 modes，另两行没有该键；把"未声明"当"不支持" ⇒ 那两行被误剔除 ⇒ 真实链路直接断。
// 这与本项目反复出现的「未验证 ≠ 否定」是同一条原则（能力数据来源见
// .github/tasks/TASK-MODEL-006/model-capabilities.md）。
//
// 解析用 **capability.modes**（模型层的显式声明，DB 与前端共用的键）。
// 另有两个同名字段**不是**这个东西，刻意不读：
//   - 契约 openapi/bff.yaml 的 `supported_modes` 是**协议模板 capabilities 的键推导出的派生值**
//     （capabilities 端点响应，实现见 production internal/httpapi/handlers_catalog.go），
//     **不在模型 capability 里** —— 从模型 capability 反序列化它永远是零值。
//   - 设计文档 capability-layering-design.md 里的 `generation_modes`（"t2v"/"first_frame" 等）
//     是另一套拼写；本函数只用库中实际存在的 modes 词表，不做别名归一（归一需要依据）。
//
// 「模板层能力校验」（mode 必须命中协议模板 capabilities 声明的 mode，见契约 mode 字段描述）
// 是**另一个数据源**（需经 Model.ProtocolTemplateID 取模板），不在本函数范围。
func ResolveFor(dir Directory, modelID, requiredMode string) ([]Model, error) {
	if modelID == "" {
		return nil, ErrModelNotResolved
	}
	// 1. 具体行 id 命中：只返回那一行，**不做能力过滤**（与"刻意不看 status"同一理由，见下）。
	//
	// 为什么这一支连 capability.modes 也不过（本卡新增的判断，依据）：
	//   a. 语义：调用方**点名**了这一行（钉住具体渠道/模型），这里没有候选集、也没有失败切换的
	//      余地 —— 过滤唯一的效果是把一次本来能成功的调用变成硬错误，而不是"换一个更好的候选"。
	//      「候选过滤」（ADR-003 §3.1）是逻辑模型 id 那一支的语义。
	//   b. 事实：实测（2026-10-17）全库**唯一**声明了 capability.modes 的行
	//      mod_pearapi_seedance25 的 logical_model_id 为 NULL ⇒ 它**只能走这一支**。
	//      而它声明的词表 {"text-to-video","first-frame","first-last-frame","omni-reference",
	//      "video-edit","extend","with-audio"} 与调用方实际传的 mode 并不同源
	//      （前端实测传过 mode="image-to-image"；设计文档用 "t2v"/"first_frame"）。
	//      在这里过滤 ⇒ 任何词表没对齐的存量调用立刻由"能用"变 422，正是这一支存在的
	//      意义（向后兼容）所要避免的行为变更。
	//   代价如实记录：以当前数据，过滤对这一行不生效；等逻辑模型候选集（多候选 + 声明 modes）
	//   落地后，过滤在候选支生效。
	for i := range dir.Models {
		if dir.Models[i].ID == modelID {
			return []Model{dir.Models[i]}, nil
		}
	}
	var out []Model
	for i := range dir.Models {
		m := dir.Models[i]
		if m.LogicalModelID == modelID && m.Status == "enabled" {
			out = append(out, m)
		}
	}
	if len(out) == 0 {
		// 没有任何启用候选 ⇒ 语义仍是"找不到模型"（保持改动前的错误类型不变）
		return nil, ErrModelNotResolved
	}
	if requiredMode != "" {
		kept := make([]Model, 0, len(out))
		for _, m := range out {
			modes := declaredModes(m.Capability)
			// 三分支刻意写全：未声明（len==0）与声明且含 mode 都保留；**只有**
			// "声明了但不含"才剔除 —— 这就是本函数的全部过滤语义。
			if len(modes) == 0 || slices.Contains(modes, requiredMode) {
				kept = append(kept, m)
			}
		}
		if len(kept) == 0 {
			// 明确失败，不静默返回空切片（空切片会让调用方 panic 或退化成"随机渠道"）。
			// 错误信息带上 mode 与候选数，排障时不必回放请求。
			return nil, fmt.Errorf("%w: model=%q requiredMode=%q enabledCandidates=%d",
				ErrNoCandidateForMode, modelID, requiredMode, len(out))
		}
		out = kept
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].RoutePriority != out[j].RoutePriority {
			return out[i].RoutePriority < out[j].RoutePriority
		}
		return out[i].ID < out[j].ID
	})
	return out, nil
}

// declaredModes 返回候选 capability **显式声明**的 modes 列表；返回 nil/空 = **未声明**（无断言）。
//
// 未声明的三种情形必须由调用方一视同仁（都不据此剔除候选，见 ResolveFor）：
//   - capability 为空（该行没有 capability 数据）
//   - 解析失败或 capability 不是 JSON 对象（**fail-open**：数据坏了不等于"不支持"，
//     不拿坏数据去否定一个渠道的可用性）
//   - 没有 modes 键，或 modes 是空数组（"无依据留空"）
//
// 匹配为**完全相等**（大小写敏感、不 trim），与 DB/前端共用的词表口径一致。
func declaredModes(capability json.RawMessage) []string {
	if len(capability) == 0 {
		return nil
	}
	var declared struct {
		Modes []string `json:"modes"`
	}
	if err := json.Unmarshal(capability, &declared); err != nil {
		return nil
	}
	return declared.Modes
}
