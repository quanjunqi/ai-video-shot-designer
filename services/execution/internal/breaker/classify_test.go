package breaker

import "testing"

// 表 3-1 逐码断言：硬 4xx 直返（ClassHard4xx）、软 4xx 计入失败（ClassSoft4xx）、
// 5xx 切换（ClassServerError）、内容安全不切换（ClassContentSafety）、2xx 成功。
func TestClassifyTable31(t *testing.T) {
	cases := []struct {
		name          string
		status        int
		contentSafety bool
		want          Class
	}{
		{"200 成功", 200, false, ClassSuccess},
		{"204 成功", 204, false, ClassSuccess},
		{"304 成功（未修改）", 304, false, ClassSuccess},
		{"400 硬 4xx", 400, false, ClassHard4xx},
		{"401 硬 4xx", 401, false, ClassHard4xx},
		{"403 硬 4xx", 403, false, ClassHard4xx},
		{"404 硬 4xx", 404, false, ClassHard4xx},
		{"422 硬 4xx", 422, false, ClassHard4xx},
		{"408 软 4xx", 408, false, ClassSoft4xx},
		{"409 软 4xx", 409, false, ClassSoft4xx},
		{"425 软 4xx", 425, false, ClassSoft4xx},
		{"429 软 4xx（评审澄清点）", 429, false, ClassSoft4xx},
		{"500 服务端错误", 500, false, ClassServerError},
		{"502 服务端错误", 502, false, ClassServerError},
		{"503 服务端错误", 503, false, ClassServerError},
		{"504 服务端错误", 504, false, ClassServerError},
		{"0 网络层失败", 0, false, ClassNetwork},
		{"400+安全标记 内容安全拒绝", 400, true, ClassContentSafety},
		{"未列出的 4xx 保守软 4xx（405）", 405, false, ClassSoft4xx},
		{"未列出的 4xx 保守软 4xx（413）", 413, false, ClassSoft4xx},
	}
	for _, c := range cases {
		if got := Classify(c.status, c.contentSafety); got != c.want {
			t.Fatalf("%s: Classify(%d,%v)=%v want %v", c.name, c.status, c.contentSafety, got, c.want)
		}
	}
}

// 429 必须归软 4xx（评审指出的歧义点：不得以"4xx 一律不重试"一刀切）
func TestClassify429IsSoft(t *testing.T) {
	if got := Classify(429, false); got != ClassSoft4xx {
		t.Fatalf("429 应归软 4xx（可重试可切换），实际 %v", got)
	}
}

// 单元描述格式
func TestUnitString(t *testing.T) {
	u := Unit{ChannelID: "ch_a", ProviderModel: "gpt-4o"}
	if u.String() != "ch_a/gpt-4o" {
		t.Fatalf("Unit.String 应为 ch_a/gpt-4o，实际 %q", u.String())
	}
	if FormatUnit("ch_b", "sd3") != "ch_b/sd3" {
		t.Fatalf("FormatUnit 应为 ch_b/sd3，实际 %q", FormatUnit("ch_b", "sd3"))
	}
}
