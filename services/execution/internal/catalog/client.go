package catalog

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

// Client fetches the platform model directory (channels + models + protocol
// templates) from the production catalog service.
type Client struct {
	ProductionURL string
	Token         string
	http          *http.Client
}

func NewClient(productionURL, token string) *Client {
	return &Client{ProductionURL: strings.TrimRight(productionURL, "/"), Token: token, http: &http.Client{Timeout: 10 * time.Second}}
}

// Directory is the catalog projection the executor needs.
type Directory struct {
	Models    []Model    `json:"models"`
	Templates []Template `json:"templates"`
	Channels  []Channel  `json:"channels"`
}

type Channel struct {
	ID      string `json:"id"`
	Kind    string `json:"kind"`
	BaseURL string `json:"baseUrl"`
}

type Model struct {
	ID                 string          `json:"id"`
	ChannelID          string          `json:"channelId"`
	Type               string          `json:"type"`
	Name               string          `json:"name"`
	ProviderModel      string          `json:"providerModel"`
	ProtocolTemplateID string          `json:"protocolTemplateId"`
	RequestPath        string          `json:"requestPath"`
	Method             string          `json:"method"`
	Params             []engine.Param  `json:"params"`
	Capability         json.RawMessage `json:"capability"`
	// 路由字段（ADR-003 §3.1）：logicalModelId 相同的一组行 = 该逻辑模型的候选渠道，
	// routePriority 小者优先；status 用于跳过被停用的候选。详见 resolve.go 的 Resolve。
	LogicalModelID string `json:"logicalModelId"`
	RoutePriority  int    `json:"routePriority"`
	Status         string `json:"status"`
	// 权威成本价（T0 价格校准，契约来自 production 目录投影）：
	// CostAmount 非 nil = 该模型有已校准成本（model_catalog.cost_amount），审计回写用它；
	// CostUnit 跟随 cost_unit（per_call/per_second/per_mtok_input/per_mtok_output）；
	// PriceSource=manual|synced 标记来源，PriceSyncedAt 记录同步时间。
	CostAmount    *float64  `json:"costAmount,omitempty"`
	CostUnit      string    `json:"costUnit,omitempty"`
	PriceSource   string    `json:"priceSource,omitempty"`
	PriceSyncedAt time.Time `json:"priceSyncedAt,omitempty"`
}

type Template struct {
	ID             string          `json:"id"`
	Label          string          `json:"label"`
	Method         string          `json:"method"`
	RequestPath    string          `json:"requestPath"`
	Params         []engine.Param  `json:"params"`
	ResponseParams []engine.Param  `json:"responseParams"`
	Async          json.RawMessage `json:"async"`
	Capabilities   json.RawMessage `json:"capabilities"`
	// RequestTemplate 是 ADR-007 D3 的请求模板（production 迁移 028）。空 = 沿用 params[]。
	RequestTemplate string `json:"requestTemplate"`
}

// Get fetches the directory for a tenant context.
// role 是 BFF 经 authorize 验证后注入的可信角色（X-Actor-Role 透传）；production 内部中间件
// 校验该头（纵深防御：禁止绕过 BFF 直连）。role 为空时按原样不带头——上游 403 如实上报，
// execution 不自行伪造角色。
func (c *Client) Get(ctx context.Context, workspaceID, actorID, role string) (Directory, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.ProductionURL+"/internal/v1/catalog", nil)
	if err != nil {
		return Directory{}, err
	}
	req.Header.Set("Authorization", "Bearer "+c.Token)
	req.Header.Set("X-Workspace-Id", workspaceID)
	req.Header.Set("X-Actor-Id", actorID)
	if role != "" {
		req.Header.Set("X-Actor-Role", role)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return Directory{}, fmt.Errorf("catalog: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return Directory{}, fmt.Errorf("catalog: upstream %d: %s", resp.StatusCode, truncate(body, 300))
	}
	var dir struct {
		Models    []Model    `json:"models"`
		Templates []Template `json:"templates"`
		Channels  []Channel  `json:"channels"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&dir); err != nil {
		return Directory{}, err
	}
	return Directory{Models: dir.Models, Templates: dir.Templates, Channels: dir.Channels}, nil
}

func truncate(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}
