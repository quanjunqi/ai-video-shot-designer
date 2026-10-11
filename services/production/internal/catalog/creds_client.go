package catalog

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// WorkspaceCredentials 通过 workspace 的内部 reveal 端点取渠道密钥。
//
// 为什么由 production 去 reveal：AGENTS §3.1 规定密钥由 workspace 拥有、其他服务**运行时 reveal**。
// 同步器要访问上游，必须有同一把钥匙 —— 这个端点与响应形状与 execution 的
// `creds/client.go` **完全一致**，避免"同一个渠道两套取密钥口径"。
//
// 端点：GET {WorkspaceURL}/internal/v1/workspaces/{workspaceID}/credentials/{channelID}/reveal
// 响应：{channelId, baseUrl, authType, authHeader, authPrefix, apiKey}
type WorkspaceCredentials struct {
	WorkspaceURL string
	Token        string
	Client       *http.Client
}

// NewWorkspaceCredentials 造一个带内部令牌与超时的凭据来源。
func NewWorkspaceCredentials(workspaceURL, token string, timeout time.Duration) *WorkspaceCredentials {
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	return &WorkspaceCredentials{
		WorkspaceURL: strings.TrimRight(workspaceURL, "/"),
		Token:        token,
		Client:       &http.Client{Timeout: timeout},
	}
}

// Reveal 取一个渠道在某个工作区下的密钥与（可能的）base URL 覆盖。
func (c *WorkspaceCredentials) Reveal(ctx context.Context, workspaceID, channelID string) (Credential, error) {
	if c == nil || c.Client == nil || c.WorkspaceURL == "" {
		return Credential{}, fmt.Errorf("catalog: workspace credentials client is not configured")
	}
	raw := fmt.Sprintf("%s/internal/v1/workspaces/%s/credentials/%s/reveal",
		c.WorkspaceURL, url.PathEscape(workspaceID), url.PathEscape(channelID))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return Credential{}, err
	}
	req.Header.Set("Authorization", "Bearer "+c.Token)
	resp, err := c.Client.Do(req)
	if err != nil {
		return Credential{}, fmt.Errorf("catalog: reveal %s: %w", channelID, err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if resp.StatusCode == http.StatusNotFound {
		return Credential{}, fmt.Errorf("catalog: no credentials for channel %q in workspace %q", channelID, workspaceID)
	}
	if resp.StatusCode != http.StatusOK {
		return Credential{}, fmt.Errorf("catalog: reveal %s: HTTP %d: %s", channelID, resp.StatusCode, truncate(string(body), 200))
	}
	var out struct {
		BaseURL  string `json:"baseUrl"`
		APIKey   string `json:"apiKey"`
		AuthType string `json:"authType"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return Credential{}, fmt.Errorf("catalog: reveal %s: bad json: %w", channelID, err)
	}
	return Credential{APIKey: out.APIKey, BaseURL: out.BaseURL}, nil
}
