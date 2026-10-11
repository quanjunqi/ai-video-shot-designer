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
func (c *Client) Get(ctx context.Context, workspaceID, actorID string) (Directory, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.ProductionURL+"/internal/v1/catalog", nil)
	if err != nil {
		return Directory{}, err
	}
	req.Header.Set("Authorization", "Bearer "+c.Token)
	req.Header.Set("X-Workspace-Id", workspaceID)
	req.Header.Set("X-Actor-Id", actorID)
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
