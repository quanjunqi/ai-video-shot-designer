package budget

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// WorkspaceClient 是 execution 侧读取预算规则的 workspace 内部 API 客户端。
// 与 creds.Client 同一模式：内网目标、Bearer 内部令牌、不套 SSRF 防护。
type WorkspaceClient struct {
	WorkspaceURL string
	Token        string
	http         *http.Client
}

func NewWorkspaceClient(workspaceURL, token string) *WorkspaceClient {
	return &WorkspaceClient{
		WorkspaceURL: strings.TrimRight(workspaceURL, "/"),
		Token:        token,
		http:         &http.Client{Timeout: 5 * time.Second},
	}
}

// EffectiveRules 从 workspace 读取某工作区的【生效】预算规则。
// 响应体 {items:[...]}；字段与 store.BudgetRule 的 JSON 对齐。
func (c *WorkspaceClient) EffectiveRules(ctx context.Context, workspace string) ([]Rule, error) {
	url := fmt.Sprintf("%s/internal/v1/workspaces/%s/budget/rules", c.WorkspaceURL, workspace)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.Token)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("budget: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("budget: upstream %d: %s", resp.StatusCode, truncate(body, 200))
	}
	var out struct {
		Items []struct {
			Scope       string  `json:"scope"`
			Period      string  `json:"period"`
			LimitAmount float64 `json:"limitAmount"`
			Action      string  `json:"action"`
			WarnAt      float64 `json:"warnAt"`
		} `json:"items"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("budget: decode rules: %w", err)
	}
	rules := make([]Rule, 0, len(out.Items))
	for _, it := range out.Items {
		rules = append(rules, Rule{
			Scope: it.Scope, Period: it.Period,
			LimitAmount: it.LimitAmount, Action: it.Action, WarnAt: it.WarnAt,
		})
	}
	return rules, nil
}

func truncate(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}
