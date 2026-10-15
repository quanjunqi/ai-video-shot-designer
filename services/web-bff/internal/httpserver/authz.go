package httpserver

import (
	"net/http"
	"strings"
)

// 角色等级（等级越高权限越大）。对应 workspace_members.role：
// editor 已在权限体系内并入 admin（TASK-AUTH-001 评审定稿）。
const (
	roleMember = iota // 0：仅成员（创作流等无需分级路径的默认档）
	roleViewer        // 1：只读
	roleAdmin         // 2：全量配置（含渠道/凭据/模型/预算/告警）
	roleOwner         // 3：模型中心全量 + 审计监督（审计仅 Owner，评审定稿）
)

// roleRank 将 workspace 角色名映射为等级；未知角色按 member 处理（fail-safe 最低档）。
func roleRank(role string) int {
	switch role {
	case "owner":
		return roleOwner
	case "admin", "editor": // editor 并入 admin（评审定稿）
		return roleAdmin
	case "viewer":
		return roleViewer
	default:
		return roleMember
	}
}

// rule 描述一类路径所需的最小角色：读操作（GET/HEAD）看 read，写操作看 write。
// prefix 越长越具体；匹配时取最长前缀命中（Go 1.22 ServeMux 同款语义）。
type rule struct {
	prefix      string
	read, write int
}

// matrix 是模型中心权限矩阵（TASK-AUTH-001 设计稿 v2，Owner 评审定稿 2026-10-15）。
// 顺序无要求（按最长前缀匹配），但保持可读分组。
var matrix = []rule{
	// 审计明细与导出：仅 Owner（评审定稿：Admin/Viewer 入口隐藏 + 后端 403）
	{prefix: "/api/v1/audit/logs", read: roleOwner, write: roleOwner},
	{prefix: "/api/v1/audit/export", read: roleOwner, write: roleOwner},
	// 成本看板（审计聚合用量）：全角色可看（设计稿"成本与用量"行）
	{prefix: "/api/v1/audit/stats", read: roleViewer, write: roleViewer},
	{prefix: "/api/v1/audit/stats/trend", read: roleViewer, write: roleViewer},
	// 健康面板：读全角色；告警配置属写操作 → admin
	{prefix: "/api/v1/audit/health", read: roleViewer, write: roleAdmin},
	{prefix: "/api/v1/alerts/config", read: roleViewer, write: roleAdmin},
	// 渠道与凭据：admin（Viewer 不可见；凭据敏感）
	{prefix: "/api/v1/channels/", read: roleAdmin, write: roleAdmin},
	{prefix: "/api/v1/workspace/channels", read: roleAdmin, write: roleAdmin},
	{prefix: "/api/v1/workspace/credentials", read: roleAdmin, write: roleAdmin},
	// 模型目录 / 逻辑模型 / 规则模板：读全角色；写 admin
	{prefix: "/api/v1/catalog", read: roleViewer, write: roleAdmin},
	{prefix: "/api/v1/logical-models", read: roleViewer, write: roleAdmin},
	{prefix: "/api/v1/rule-templates", read: roleViewer, write: roleAdmin},
	// 预算规则（成本预算配置）：读全角色；写 admin
	{prefix: "/api/v1/workspace/budget", read: roleViewer, write: roleAdmin},
	// 其余（创作流/任务/资产/生成等，任务卡非范围）：成员可用
	{prefix: "/", read: roleMember, write: roleMember},
}

// requireForPath 返回 path 在矩阵中的最小角色（读/写分开）。
func requireForPath(path string) (read, write int) {
	best := matrix[len(matrix)-1] // 默认规则兜底
	bestLen := 0
	for _, r := range matrix {
		if strings.HasPrefix(path, r.prefix) && len(r.prefix) > bestLen {
			best = r
			bestLen = len(r.prefix)
		}
	}
	return best.read, best.write
}

// authorizeRequest 裁定一次请求是否允许：读请求看 read，写请求看 write。
func authorizeRequest(role string, method, path string) bool {
	read, write := requireForPath(path)
	need := read
	if method != http.MethodGet && method != http.MethodHead {
		need = write
	}
	return roleRank(role) >= need
}
