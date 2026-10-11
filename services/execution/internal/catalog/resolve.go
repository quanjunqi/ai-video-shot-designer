package catalog

import (
	"errors"
	"sort"
)

// ErrModelNotResolved：既不是具体的 model_catalog 行 id，也不是一个有可用候选的逻辑模型 id。
var ErrModelNotResolved = errors.New("catalog: model not found (neither a catalog model id nor a logical model with enabled candidates)")

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
func Resolve(dir Directory, modelID string) ([]Model, error) {
	if modelID == "" {
		return nil, ErrModelNotResolved
	}
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
		return nil, ErrModelNotResolved
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].RoutePriority != out[j].RoutePriority {
			return out[i].RoutePriority < out[j].RoutePriority
		}
		return out[i].ID < out[j].ID
	})
	return out, nil
}
