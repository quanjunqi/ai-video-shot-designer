package engine

import (
	"net/http"
	"testing"
)

func TestApplyAuth_HeaderPerAuthType(t *testing.T) {
	cases := []struct {
		authType string
		key      string
		want     string // 期望的 Authorization 头；空表示不应设置
	}{
		{"bearer", "sk-1", "Bearer sk-1"},
		{"token", "sk-1", "sk-1"}, // ★ AutoDL ComfyUI 形态：无前缀
		{"", "sk-1", ""},
		{"none", "sk-1", ""},
		// 既有取值必须保持原行为（都走 Bearer），避免新增分支造成静默变更
		{"apikey", "sk-2", "Bearer sk-2"},
		{"sign", "sk-3", "Bearer sk-3"},
	}
	for _, c := range cases {
		req, _ := http.NewRequest(http.MethodPost, "https://example.com/x", nil)
		applyAuth(req, Credentials{AuthType: c.authType, APIKey: c.key})
		got := req.Header.Get("Authorization")
		if got != c.want {
			t.Errorf("auth_type=%q 期望 %q，实际 %q", c.authType, c.want, got)
		}
	}
}
