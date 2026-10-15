package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
)

// HeaderWorkspace / HeaderActor / HeaderRole 是 BFF 与上游之间传递可信身份的约定头。
// 前端只传 X-Workspace-Id / X-Actor-Id；X-Actor-Role 由 BFF 在鉴权通过后注入（下游不得自报）。
const (
	HeaderWorkspace = "X-Workspace-Id"
	HeaderActor     = "X-Actor-Id"
	HeaderRole      = "X-Actor-Role"
)

// ctxRoleKey 用于在请求 context 中携带已验证角色（供 requestIDTransport 统一注入下游）。
type ctxRoleKey struct{}

// withRole 把已验证角色写入 context。
func withRole(ctx context.Context, role string) context.Context {
	return context.WithValue(ctx, ctxRoleKey{}, role)
}

// roleFrom 取出 context 中的角色；未设置返回空串。
func roleFrom(ctx context.Context) string {
	if v, ok := ctx.Value(ctxRoleKey{}).(string); ok {
		return v
	}
	return ""
}

// authorize 校验工作区上下文 + 按权限矩阵裁定当前请求。
// 身份来源：请求头 X-Workspace-Id / X-Actor-Id（缺省回退 dev 装配值，供本地单栈/走查）。
// 流程：workspace 内部授权端点解析成员角色 → 矩阵裁定（authz.go）→
// 拒绝返回 errAuthorizationDenied（403），其它上游错误视为不可用（503）。
// 通过后返回角色，调用方应 withRole 写入 ctx 以便下游注入 X-Actor-Role。
func (s *server) authorize(r *http.Request) (string, error) {
	workspace := r.Header.Get(HeaderWorkspace)
	if workspace == "" {
		workspace = s.devWorkspace
	}
	actor := r.Header.Get(HeaderActor)
	if actor == "" {
		actor = s.devActor
	}
	role, err := s.resolveRole(r.Context(), workspace, actor)
	if err != nil {
		return "", err
	}
	if !authorizeRequest(role, r.Method, r.URL.Path) {
		return "", errAuthorizationDenied
	}
	return role, nil
}

// resolveRole 调 workspace 内部授权端点解析成员角色。
func (s *server) resolveRole(ctx context.Context, workspace, actor string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		s.workspaceURL+"/internal/v1/workspaces/"+workspace+"/authorize?actor_id="+actor, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+s.workspaceToken)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode == http.StatusForbidden {
		return "", errAuthorizationDenied
	}
	if resp.StatusCode >= 300 {
		return "", errors.New("workspace authorization upstream failure")
	}
	var m struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&m); err != nil {
		return "", errors.New("workspace authorization invalid response")
	}
	if m.Role == "" {
		return "", errors.New("workspace authorization missing role")
	}
	return m.Role, nil
}

// me 返回当前身份（workspace/actor/role），前端启动拉取以驱动角色控制（TASK-AUTH-001）。
func (s *server) me(w http.ResponseWriter, r *http.Request) {
	workspace := r.Header.Get(HeaderWorkspace)
	if workspace == "" {
		workspace = s.devWorkspace
	}
	actor := r.Header.Get(HeaderActor)
	if actor == "" {
		actor = s.devActor
	}
	role, err := s.authorize(r)
	if err != nil {
		if errors.Is(err, errAuthorizationDenied) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "workspace authorization failed")
		} else {
			writeError(w, http.StatusServiceUnavailable, "UPSTREAM_UNAVAILABLE", "workspace authorization unavailable")
		}
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"workspace_id": workspace,
		"actor_id":     actor,
		"role":         role,
	})
}

// check 探测上游 /ready 端点（BFF 就绪检查聚合）。
func (s *server) check(ctx context.Context, url, token string) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode >= 300 {
		return io.EOF
	}
	return nil
}
