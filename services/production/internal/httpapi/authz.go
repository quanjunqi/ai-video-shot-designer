package httpapi

import (
	"net/http"
	"strings"
)

// 角色等级（与 BFF authz.go 同构；editor 由 BFF 映射为 admin 后透传）。
// production 是内部服务，只信任 BFF 注入的 X-Actor-Role（纵深防御：禁止绕过 BFF 直连）。
const (
	roleMember = iota
	roleViewer
	roleAdmin
	roleOwner
)

// roleRank 将角色名映射为等级；未知角色按 member 处理（fail-safe 最低档）。
func roleRank(role string) int {
	switch role {
	case "owner":
		return roleOwner
	case "admin", "editor":
		return roleAdmin
	case "viewer":
		return roleViewer
	default:
		return roleMember
	}
}

// prodRule 描述一类路径所需最小角色：读请求看 read，写请求看 write；最长前缀匹配。
type prodRule struct {
	prefix      string
	read, write int
}

// prodMatrix 与 BFF 权限矩阵对齐（TASK-AUTH-001 设计稿 v2，Owner 评审定稿 2026-10-15）：
// 模型目录/逻辑模型/规则模板 = 读 viewer 写 admin；渠道同步 = admin；创作流 = member。
var prodMatrix = []prodRule{
	{prefix: "/internal/v1/catalog", read: roleViewer, write: roleAdmin},
	{prefix: "/internal/v1/logical-models", read: roleViewer, write: roleAdmin},
	{prefix: "/internal/v1/rule-templates", read: roleViewer, write: roleAdmin},
	{prefix: "/internal/v1/channels", read: roleAdmin, write: roleAdmin},
	{prefix: "/internal/v1/", read: roleMember, write: roleMember},
}

// prodRequire 返回 path 所需最小角色（读/写）。
func prodRequire(path string) (read, write int) {
	best := prodMatrix[len(prodMatrix)-1]
	bestLen := 0
	for _, r := range prodMatrix {
		if strings.HasPrefix(path, r.prefix) && len(r.prefix) > bestLen {
			best = r
			bestLen = len(r.prefix)
		}
	}
	return best.read, best.write
}

// authorizeRequest 裁定一次请求是否允许（读请求看 read，写请求看 write）。
func authorizeRequest(role, method, path string) bool {
	read, write := prodRequire(path)
	need := read
	if method != http.MethodGet && method != http.MethodHead {
		need = write
	}
	return roleRank(role) >= need
}

// authz 包裹内部路由：校验 BFF 注入的可信角色并按下发矩阵裁定。
// /live、/ready 是探活端点，不参与鉴权。
func (h Handler) authz(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/live" || r.URL.Path == "/ready" {
			next.ServeHTTP(w, r)
			return
		}
		role := r.Header.Get("X-Actor-Role")
		if role == "" {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "missing actor role")
			return
		}
		if !authorizeRequest(role, r.Method, r.URL.Path) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "role not permitted for resource")
			return
		}
		next.ServeHTTP(w, r)
	})
}
