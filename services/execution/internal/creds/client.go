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

// Client resolves tenant channel credentials (decrypted base URL + API key)
// from the workspace credential store. Secrets are materialized only inside
// this process boundary and are never logged or returned to callers.
type Client struct {
	WorkspaceURL string
	Token        string
	http         *http.Client
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
