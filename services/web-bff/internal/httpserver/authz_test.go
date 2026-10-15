package httpserver

import "testing"

func TestRoleRank(t *testing.T) {
	cases := []struct {
		role string
		want int
	}{
		{"owner", roleOwner},
		{"admin", roleAdmin},
		{"editor", roleAdmin}, // editor 并入 admin（评审定稿）
		{"viewer", roleViewer},
		{"unknown", roleMember}, // 未知角色 fail-safe 最低档
		{"", roleMember},
	}
	for _, c := range cases {
		if got := roleRank(c.role); got != c.want {
			t.Errorf("roleRank(%q) = %d, want %d", c.role, got, c.want)
		}
	}
}

func TestRequireForPathLongestPrefix(t *testing.T) {
	// 具体规则优先于默认规则
	r, w := requireForPath("/api/v1/audit/logs")
	if r != roleOwner || w != roleOwner {
		t.Errorf("audit/logs 应为 owner/owner，got %d/%d", r, w)
	}
	r, w = requireForPath("/api/v1/audit/stats/trend")
	if r != roleViewer || w != roleViewer {
		t.Errorf("audit/stats/trend 应为 viewer/viewer，got %d/%d", r, w)
	}
	// 无规则路径落到默认 member 档
	r, w = requireForPath("/api/v1/comic-projects")
	if r != roleMember || w != roleMember {
		t.Errorf("comic-projects 应为 member/member，got %d/%d", r, w)
	}
}

func TestAuthorizeRequestMatrix(t *testing.T) {
	cases := []struct {
		name   string
		role   string
		method string
		path   string
		want   bool
	}{
		// 审计明细/导出：仅 Owner
		{"owner 看审计", "owner", "GET", "/api/v1/audit/logs", true},
		{"admin 看审计被拒", "admin", "GET", "/api/v1/audit/logs", false},
		{"viewer 看审计被拒", "viewer", "GET", "/api/v1/audit/logs", false},
		{"owner 导出审计", "owner", "POST", "/api/v1/audit/export", true},
		{"admin 导出审计被拒", "admin", "POST", "/api/v1/audit/export", false},
		// 成本看板（聚合）：全角色
		{"viewer 看成本", "viewer", "GET", "/api/v1/audit/stats", true},
		// 健康/告警：读全角色，写 admin
		{"viewer 看健康", "viewer", "GET", "/api/v1/audit/health", true},
		{"viewer 配告警被拒", "viewer", "POST", "/api/v1/alerts/config", false},
		{"admin 配告警", "admin", "POST", "/api/v1/alerts/config", true},
		// 渠道/凭据：admin
		{"viewer 看渠道被拒", "viewer", "GET", "/api/v1/workspace/channels", false},
		{"admin 看渠道", "admin", "GET", "/api/v1/workspace/channels", true},
		{"viewer 看凭据被拒", "viewer", "GET", "/api/v1/workspace/credentials", false},
		// 模型目录/逻辑模型：读全角色，写 admin
		{"viewer 看目录", "viewer", "GET", "/api/v1/catalog", true},
		{"viewer 写目录被拒", "viewer", "POST", "/api/v1/catalog", false},
		{"admin 写目录", "admin", "POST", "/api/v1/catalog", true},
		// 预算：读全角色，写 admin
		{"viewer 看预算", "viewer", "GET", "/api/v1/workspace/budget", true},
		{"viewer 改预算被拒", "viewer", "POST", "/api/v1/workspace/budget/rules", false},
		// 默认（创作流）：成员可用
		{"viewer 创作", "viewer", "POST", "/api/v1/generation-intents", true},
	}
	for _, c := range cases {
		if got := authorizeRequest(c.role, c.method, c.path); got != c.want {
			t.Errorf("%s: authorizeRequest(%q, %s, %s) = %v, want %v", c.name, c.role, c.method, c.path, got, c.want)
		}
	}
}
