package httpserver

import (
	"context"
	"errors"
	"io"
	"net/http"
)

// authorize 校验工作区上下文：转发到 workspace 的内部授权端点。
// 403 映射为 errAuthorizationDenied（明确拒绝），其它错误视为上游不可用。
func (s *server) authorize(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.workspaceURL+"/internal/v1/workspaces/"+s.devWorkspace+"/authorize?actor_id="+s.devActor, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+s.workspaceToken)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusForbidden {
		return errAuthorizationDenied
	}
	if resp.StatusCode >= 300 {
		return errors.New("workspace authorization upstream failure")
	}
	return nil
}

// check 探测上游 /ready 端点（BFF 就绪检查聚合）。
func (s *server) check(ctx context.Context, url, token string) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return io.EOF
	}
	return nil
}
