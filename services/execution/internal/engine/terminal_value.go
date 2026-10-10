package engine

import "strings"

// matchesTerminalValue 判断轮询返回的状态值是否命中协议模板声明的终态字面量。
//
// 语义（终态匹配的唯一入口，见 engine.go 的异步轮询）：
//   - spec 是**逗号分隔的候选值列表**，按 "," 切分后逐项 TrimSpace，空项忽略；
//   - 与 status（同样 TrimSpace）逐项做**大小写不敏感**比较，任一命中即 true；
//   - spec 为空串（或只含分隔符/空白）时返回 false。
//
// 为什么需要容错而不是单一精确比较：
//  1. 各上游的状态词表大小写风格本就不同 —— 本项目两个内置模板就是两种风格
//     （即梦 SUCCESS/FAILED，MiniMax Success/Failed）。状态枚举里 Success 与 SUCCESS
//     不可能是「不同含义」的两个状态，大小写不敏感因此是安全的，同时消除了
//     上游改大小写就静默空转到超时的风险。
//  2. 同一枚举可能存在多个同义拼写（例如失败态 Failed / Fail）。在 spec 中
//     **同时列出候选值**，可以在字面量无法从官方文档确认时两种写法都成立：
//     多列一个上游从不返回的值无害；少列一个则会让失败任务被当成未完成，
//     空转到超时，并使重试机制失效（超时与失败在语义与重试策略上不同）。
//
// 向后兼容：单个候选值（如 "SUCCESS"）的行为与改动前的 strings 精确比较一致，
// 唯一放宽之处是现在也接受大小写变体。
func matchesTerminalValue(status string, spec string) bool {
	status = strings.TrimSpace(status)
	for _, candidate := range strings.Split(spec, ",") {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			continue
		}
		if strings.EqualFold(status, candidate) {
			return true
		}
	}
	return false
}
