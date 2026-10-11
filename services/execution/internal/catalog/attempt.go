package catalog

import "fmt"

// ChannelAttempt 是"对某个候选尝试了一次"的事实记录（供审计与排障）。
type ChannelAttempt struct {
	ModelID   string `json:"modelId"`
	ChannelID string `json:"channelId"`
	Err       string `json:"error,omitempty"`
}

// AttemptEach 按候选顺序逐个尝试，直到某个候选成功（ADR-003 的失败切换）。
//
// 为什么顺序逻辑只保留这一份：两条执行路径（同步返回 / 异步 worker）必须用
// 【同一套顺序、同一套判定】。本项目已两次因"两处同形代码只改一处"出错
// （`/v1/generate` 接线漏改、渠道卡片合并丢字段），所以顺序逻辑不各写一遍。
//
// 语义：
//   - 候选为空 ⇒ 报错（不猜）
//   - try 返回 nil 即成功 ⇒ 立即返回该候选
//   - 全部失败 ⇒ 返回**最后一次**的错误（最贴近现状的原因），并把每次尝试都记进 attempts
func AttemptEach(cands []Model, try func(Model) error) (Model, []ChannelAttempt, error) {
	if len(cands) == 0 {
		return Model{}, nil, fmt.Errorf("catalog: no candidates to attempt")
	}
	attempts := make([]ChannelAttempt, 0, len(cands))
	for _, c := range cands {
		err := try(c)
		a := ChannelAttempt{ModelID: c.ID, ChannelID: c.ChannelID}
		if err != nil {
			a.Err = err.Error()
		}
		attempts = append(attempts, a)
		if err == nil {
			return c, attempts, nil
		}
	}
	return Model{}, attempts, fmt.Errorf("catalog: all %d candidates failed (last: %s)", len(cands), attempts[len(attempts)-1].Err)
}

// PickForAttempt 在【重试驱动】的执行路径上选择本次尝试的候选。
//
// 异步 worker 的失败重试由 job 的 attempt 机制驱动（failOrRetry + j.Attempt，已存在且会持久化）。
// 因此这里只需按尝试次数推进候选：第 1 次（attempt=1）用首选，之后依次用备用 —— 即
// "重试一次 = 换一个候选试"，无需在 worker 里再套一层循环（那会把长流程重构得更脆）。
//
// 具体行 id 命中时候选只有 1 个 ⇒ 本函数恒返回它（行为与改动前完全一致）。
func PickForAttempt(cands []Model, attempt int) Model {
	if len(cands) == 0 {
		return Model{}
	}
	idx := attempt - 1
	if idx < 0 {
		idx = 0
	}
	if idx > len(cands)-1 {
		idx = len(cands) - 1
	}
	return cands[idx]
}
