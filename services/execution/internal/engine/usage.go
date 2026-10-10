package engine

import "encoding/json"

// UsageFromExtracted 从抽取结果里读 token 用量（D4a/D4c 共用）。
//
// 为什么放在 engine 包：它是**唯一**知道"响应参数如何映射进 Extracted"的地方
// （见 engine.go 的 out.Extracted[p.Key] = v），因此也是"键名约定"的天然归属。
// D4a 时它被写在 httpapi 包内（package-private）⇒ worker（package main）无法复用，
// 结果**异步路径的 token 恒为 0**；提出来之后同步与异步同一份实现。
//
// 为什么按"约定键名"而不是按声明读：
//
//	protocol_templates.response_params 只声明 key/type/value，
//	【没有】"这个参数是 token 数"的语义标记 ⇒ 目前只能按约定识别。
//	键名依据（判据：SQL 查 protocol_templates.response_params）：
//	pt_builtin_openai 含 usage.prompt_tokens / usage.completion_tokens / usage.total_tokens，
//	抽取结果 map 的键就是这些点路径原文。
//	后续若给 response_params 加角色标记，本函数是唯一需要替换处。
func UsageFromExtracted(ex map[string]any) (in, out, cached int) {
	if ex == nil {
		return 0, 0, 0
	}
	pick := func(keys ...string) int {
		for _, k := range keys {
			v, ok := ex[k]
			if !ok {
				continue
			}
			switch n := v.(type) {
			case float64:
				return int(n)
			case int:
				return n
			case json.Number:
				if i, err := n.Int64(); err == nil {
					return int(i)
				}
			}
		}
		return 0
	}
	in = pick("usage.prompt_tokens", "prompt_tokens", "usage.input_tokens", "input_tokens")
	out = pick("usage.completion_tokens", "completion_tokens", "usage.output_tokens", "output_tokens")
	cached = pick("usage.prompt_tokens_details.cached_tokens", "usage.cached_tokens", "cached_tokens")
	return in, out, cached
}
