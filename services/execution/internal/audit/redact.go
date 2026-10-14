package audit

import (
	"encoding/json"
	"regexp"
)

// L0 脱敏：**密钥一类的值绝不落库**（D5a）。
//
// 依据：
//   - .agents/skills/audit-ledger/SKILL.md（密钥打码）：「禁止在代码、prompt、**日志**中写入真实密钥」
//     —— 审计表就是日志，故同样适用；
//   - 本项目已有先例：docs/how-to/observability.md 要求密钥打码为 <REDACTED>。
//
// 为什么放在 audit.Store 的写库入口（而不是各调用方）：
//   这是**唯一收口** —— Insert / UpdateResultByJobID 是仅有的两个写入口，
//   在此处脱敏意味着**任何现有或未来的调用方都不可能忘记**。
//
// 为什么按文本正则而不是 JSON 遍历：
//   需要覆盖嵌套结构；而行之有效的做法是直接对序列化后的文本套用
//   "密钥形状"的模式。<REDACTED> 不含引号与反斜杠 ⇒ **替换后 JSON 仍然合法**
//   （有单测锁定这一不变量）。
//
// 边界（刻意保守）：
//   只匹配**明确的密钥形状**，不做"长字符串一律打码"这类激进规则 ——
//   过度脱敏会毁掉排障所需的原文（那正是 L1 想保留的东西）。
//   本片只做 L0；L1（prompt/上游原文的出入策略）涉及产品决策，另片。

var l0Patterns = []struct {
	re   *regexp.Regexp
	repl string
}{
	// OpenAI 风格 sk- 密钥
	{regexp.MustCompile(`sk-[A-Za-z0-9_-]{12,}`), `<REDACTED>`},
	// Authorization: Bearer <token>
	{regexp.MustCompile(`(?i)(bearer\s+)[A-Za-z0-9._\-]{12,}`), `${1}<REDACTED>`},
	// 具名密钥字段：api_key / apikey / access_token / secret / password = <value>
	{regexp.MustCompile(`(?i)(api[_-]?key|apikey|access[_-]?token|auth[_-]?token|secret|password)(\s*["']?\s*[:=]\s*["']?)[A-Za-z0-9._\-]{12,}`), `${1}${2}<REDACTED>`},
	// 常见中转站前缀
	{regexp.MustCompile(`(?i)\b(sk|pk|rk)-[A-Za-z0-9]{16,}`), `<REDACTED>`},
}

// redactText 对一段文本做 L0 脱敏。
func redactText(s string) string {
	for _, p := range l0Patterns {
		s = p.re.ReplaceAllString(s, p.repl)
	}
	return s
}

// RedactJSON 对一段 JSON 做 L0 脱敏；nil/空原样返回。
// 不变量：只要入参是合法 JSON，出参**仍是合法 JSON**（见 redact_test.go）。
func RedactJSON(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return raw
	}
	out := redactText(string(raw))
	if out == string(raw) {
		return raw
	}
	return json.RawMessage(out)
}
