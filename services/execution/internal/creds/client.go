package creds

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"shotdesigner/services/execution/internal/engine"
)

// Client 是 execution 侧访问 workspace 服务的客户端：解析租户渠道凭据（Reveal），
// 并读取渠道探测所需的**非明文**事实（用户渠道定义 + 凭据存在性）。
// Secrets are materialized only inside this process boundary and are never logged
// or returned to callers.
type Client struct {
	WorkspaceURL string
	Token        string
	http         *http.Client
}

// UserChannel 是工作区用户渠道定义中探测需要的字段。
// 用户对**内置渠道**的覆盖同样写在这张表（apps/web 的 upsertChannel），
// 因此它优先于平台目录的默认 base URL。
type UserChannel struct {
	ID       string `json:"id"`
	Kind     string `json:"kind"`
	BaseURL  string `json:"baseUrl"`
	AuthType string `json:"authType"`
}

// CredentialStatus 是凭据存在性投影：只有「是否已存密钥 + 鉴权方式 + base URL」，
// 不含任何明文（探测不发真实密钥，因此这里刻意不走 reveal）。
type CredentialStatus struct {
	ChannelID string `json:"channelId"`
	BaseURL   string `json:"baseUrl"`
	AuthType  string `json:"authType"`
	HasKey    bool   `json:"hasKey"`
}

// ListUserChannels 读取工作区的用户渠道定义（base URL 的服务端来源之一）。
func (c *Client) ListUserChannels(ctx context.Context, workspaceID string) ([]UserChannel, error) {
	var out struct {
		Items []UserChannel `json:"items"`
	}
	if err := c.getJSON(ctx, fmt.Sprintf("%s/internal/v1/workspaces/%s/channels", c.WorkspaceURL, workspaceID), &out); err != nil {
		return nil, err
	}
	return out.Items, nil
}

// ListCredentialStatus 读取工作区的凭据存在性（绝不触发 reveal，不接触明文）。
func (c *Client) ListCredentialStatus(ctx context.Context, workspaceID string) ([]CredentialStatus, error) {
	var out struct {
		Items []CredentialStatus `json:"items"`
	}
	if err := c.getJSON(ctx, fmt.Sprintf("%s/internal/v1/workspaces/%s/credentials", c.WorkspaceURL, workspaceID), &out); err != nil {
		return nil, err
	}
	return out.Items, nil
}

// getJSON 是带内部令牌的 GET + JSON 解码（workspace 内部端点）。
func (c *Client) getJSON(ctx context.Context, url string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.Token)
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("creds: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("creds: upstream %d: %s", resp.StatusCode, truncate(body, 200))
	}
	return json.Unmarshal(body, out)
}

func NewClient(workspaceURL, token string) *Client {
	return &Client{WorkspaceURL: strings.TrimRight(workspaceURL, "/"), Token: token, http: &http.Client{Timeout: 10 * time.Second}}
}

// Reveal returns the decrypted credentials for a channel in a workspace.
func (c *Client) Reveal(ctx context.Context, workspaceID, channelID string) (engine.Credentials, error) {
	url := fmt.Sprintf("%s/internal/v1/workspaces/%s/credentials/%s/reveal", c.WorkspaceURL, workspaceID, channelID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return engine.Credentials{}, err
	}
	req.Header.Set("Authorization", "Bearer "+c.Token)
	resp, err := c.http.Do(req)
	if err != nil {
		return engine.Credentials{}, fmt.Errorf("creds: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if resp.StatusCode == http.StatusNotFound {
		return engine.Credentials{}, fmt.Errorf("%w: channel=%q", engine.ErrNoCredentials, channelID)
	}
	if resp.StatusCode != http.StatusOK {
		return engine.Credentials{}, fmt.Errorf("creds: upstream %d: %s", resp.StatusCode, truncate(body, 200))
	}
	var out struct {
		ChannelID  string `json:"channelId"`
		BaseURL    string `json:"baseUrl"`
		AuthType   string `json:"authType"`
		AuthHeader string `json:"authHeader"`
		AuthPrefix string `json:"authPrefix"`
		APIKey     string `json:"apiKey"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return engine.Credentials{}, err
	}
	// authHeader/authPrefix are data-driven auth knobs (ADR-007 D2). The store
	// keeps them nullable; the workspace reveal endpoint flattens NULL to "",
	// which is exactly what the engine needs ("" = not configured → fall back).
	return engine.Credentials{
		BaseURL:    out.BaseURL,
		AuthType:   out.AuthType,
		AuthHeader: out.AuthHeader,
		AuthPrefix: out.AuthPrefix,
		APIKey:     out.APIKey,
	}, nil
}

func truncate(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}
