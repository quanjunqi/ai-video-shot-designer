package audit

import (
	"encoding/json"
	"strings"
	"testing"
)

// D5a：L0 脱敏。本包此前【没有任何测试】—— 这里是第一个。
// 这些是纯函数测试，不需要数据库（AuditStore 是具体 *Store，无法伪造；
// 而把脱敏做成纯函数恰好绕开了那个限制）。

func TestRedactJSONMasksKeyShapes(t *testing.T) {
	cases := []struct {
		name, in, mustNotContain string
	}{
		{"openai sk- 密钥", `{"prompt":"use sk-abcdefghij1234567890 now"}`, "sk-abcdefghij1234567890"},
		{"Authorization Bearer", `{"h":"Bearer abcdefghijklmnop1234"}`, "abcdefghijklmnop1234"},
		{"具名 api_key", `{"api_key":"abcdefghijklmnop1234"}`, "abcdefghijklmnop1234"},
		{"具名 password", `{"db":{"password":"hunter2hunter2hunter2"}}`, "hunter2hunter2hunter2"},
		{"中转站前缀 pk-", `{"x":"pk-ABCDEFGHIJKLMNOPQRST"}`, "pk-ABCDEFGHIJKLMNOPQRST"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := string(RedactJSON(json.RawMessage(c.in)))
			if strings.Contains(got, c.mustNotContain) {
				t.Fatalf("密钥未被脱敏：%s", got)
			}
			if !strings.Contains(got, "<REDACTED>") {
				t.Fatalf("未出现 <REDACTED>：%s", got)
			}
			// 不变量：脱敏后仍是合法 JSON
			var v any
			if err := json.Unmarshal([]byte(got), &v); err != nil {
				t.Fatalf("脱敏后 JSON 非法：%v —— %s", err, got)
			}
		})
	}
}

// 保守性：正常内容不得被改动（过度脱敏会毁掉排障所需的原文）
func TestRedactJSONKeepsBenignContentIntact(t *testing.T) {
	for _, in := range []string{
		`{"prompt":"一个关于猫的普通提示词","parameters":{"size":"1024x1024"}}`,
		`{"messages":[{"role":"user","content":"你好"}]}`,
		`{"usage.prompt_tokens":35,"usage.completion_tokens":38}`,
	} {
		if got := string(RedactJSON(json.RawMessage(in))); got != in {
			t.Fatalf("正常内容被改动：\n in=%s\nout=%s", in, got)
		}
	}
}

func TestRedactJSONHandlesEmpty(t *testing.T) {
	if got := RedactJSON(nil); got != nil {
		t.Fatalf("nil 应原样返回，得到 %v", got)
	}
	if got := RedactJSON(json.RawMessage("")); len(got) != 0 {
		t.Fatalf("空应原样返回，得到 %v", got)
	}
}
