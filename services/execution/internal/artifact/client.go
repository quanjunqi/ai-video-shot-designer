package artifact

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Client 把上游产物 URL 转存到 asset 服务（MinIO）。
type Client struct {
	// AssetBaseURL 是 asset 服务地址（内网），如 http://asset:18084。
	// 调用 asset 内部 API 用普通 client（内网目标，不套 SSRF 防护）。
	AssetBaseURL string
	// Token 是 asset 内部认证 token（Authorization: Bearer）。
	Token string
	// AssetHTTP 调 asset 内部 API 用的 client。
	AssetHTTP *http.Client
	// Downloader 下载上游 URL 用的 client（必须带 netguard SSRF 防护）。
	Downloader *http.Client
	// CheckURL 是下载前的早期校验（netguard.Policy.CheckURL）。
	// 为 nil 时仅做 http(s) 语法校验（依赖 Downloader 的 Dialer 层保证）。
	CheckURL func(string) error
	// MaxBytes 下载内容大小上限（与 asset 的 MaxBytes 一致，默认 50MB）。
	MaxBytes int64
}

// DefaultMaxBytes 与 asset 服务上传上限保持一致的数量级（asset 默认 50MB）。
const DefaultMaxBytes int64 = 50 << 20

// PersistOptions 是转存请求的上下文。WorkspaceID/ActorID 透传给 asset
// （asset 用它们记录 created_by 与 workspace 归属）。
type PersistOptions struct {
	WorkspaceID string
	ActorID     string
	ProjectID   string
	EpisodeID   string
	Kind        string // image / video / other
	Name        string // 落盘文件名（无扩展名则按 Content-Type 推断）
	URL         string // 上游产物 URL
}

// PersistResult 是转存成功的稳定标识。
type PersistResult struct {
	AssetID   string
	ObjectKey string
	AssetURL  string // {AssetBaseURL}/internal/v1/assets/{id}/content
	ByteSize  int64
}

// uploadInput 与 asset.UploadInput 的 wire 格式一致。
type uploadInput struct {
	ProjectID string `json:"project_id"`
	EpisodeID string `json:"episode_id"`
	Kind      string `json:"kind"`
	Scope     string `json:"scope"`
	Name      string `json:"name"`
	Prompt    string `json:"prompt"`
	SHA256    string `json:"sha256"`
}

type uploadOut struct {
	ID        string `json:"id"`
	ObjectKey string `json:"object_key"`
	Status    string `json:"status"`
}

type assetOut struct {
	ID        string `json:"id"`
	ObjectKey string `json:"object_key"`
	ByteSize  int64  `json:"byte_size"`
	Status    string `json:"status"`
}

// Persist 执行：SSRF 校验 → 下载上游 URL → create upload → put content → commit。
//
// 任何一步失败都返回 error，由调用方决定 best-effort 处理（不得阻塞任务成功）。
// 调用方应保证 opts.URL 已通过 ExtractURL（http(s)）。
func (c *Client) Persist(ctx context.Context, opts PersistOptions) (PersistResult, error) {
	if c.AssetBaseURL == "" || c.Token == "" {
		return PersistResult{}, fmt.Errorf("artifact: asset client not configured (base_url/token empty)")
	}
	if c.AssetHTTP == nil || c.Downloader == nil {
		return PersistResult{}, fmt.Errorf("artifact: asset/download http clients not configured")
	}
	max := c.MaxBytes
	if max <= 0 {
		max = DefaultMaxBytes
	}
	raw := strings.TrimSpace(opts.URL)
	if raw == "" {
		return PersistResult{}, fmt.Errorf("artifact: empty source URL")
	}
	if c.CheckURL != nil {
		if err := c.CheckURL(raw); err != nil {
			return PersistResult{}, fmt.Errorf("artifact: SSRF check rejected: %w", err)
		}
	} else if u, err := url.Parse(raw); err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return PersistResult{}, fmt.Errorf("artifact: source URL must be http(s)")
	}

	// 1. 下载上游产物（限流：最多读 MaxBytes+1 字节，超限即拒绝）。
	body, contentType, size, err := c.download(ctx, raw, max)
	if err != nil {
		return PersistResult{}, err
	}
	if size > max {
		return PersistResult{}, fmt.Errorf("artifact: source exceeds %d bytes", max)
	}

	// 2. 创建上传会话。
	kind := strings.TrimSpace(opts.Kind)
	if kind == "" {
		kind = "other"
	}
	name := strings.TrimSpace(opts.Name)
	if name == "" {
		name = "artifact-" + time.Now().Format("20060102-150405")
	}
	up, err := c.createUpload(ctx, uploadInput{
		ProjectID: opts.ProjectID,
		EpisodeID: opts.EpisodeID,
		Kind:      kind,
		Scope:     "project",
		Name:      name,
		Prompt:    "",
		SHA256:    "",
	}, opts.WorkspaceID, opts.ActorID)
	if err != nil {
		return PersistResult{}, fmt.Errorf("artifact: create upload: %w", err)
	}

	// 3. 上传内容。
	if err := c.putContent(ctx, up.ID, body, contentType, opts.WorkspaceID); err != nil {
		return PersistResult{}, fmt.Errorf("artifact: put content: %w", err)
	}

	// 4. 提交（asset 校验哈希、落库、建 MinIO 对象）。
	as, err := c.commit(ctx, up.ID, opts.WorkspaceID)
	if err != nil {
		return PersistResult{}, fmt.Errorf("artifact: commit: %w", err)
	}

	return PersistResult{
		AssetID:   as.ID,
		ObjectKey: as.ObjectKey,
		AssetURL:  strings.TrimSuffix(c.AssetBaseURL, "/") + "/internal/v1/assets/" + as.ID + "/content",
		ByteSize:  as.ByteSize,
	}, nil
}

func (c *Client) download(ctx context.Context, raw string, max int64) ([]byte, string, int64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return nil, "", 0, fmt.Errorf("artifact: build download request: %w", err)
	}
	resp, err := c.Downloader.Do(req)
	if err != nil {
		return nil, "", 0, fmt.Errorf("artifact: download %s: %w", raw, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 300))
		return nil, "", 0, fmt.Errorf("artifact: download %s: upstream %d: %s", raw, resp.StatusCode, strings.TrimSpace(string(msg)))
	}
	buf, err := io.ReadAll(io.LimitReader(resp.Body, max+1))
	if err != nil {
		return nil, "", 0, fmt.Errorf("artifact: read download body: %w", err)
	}
	ct := resp.Header.Get("Content-Type")
	if ct == "" {
		ct = "application/octet-stream"
	}
	return buf, ct, int64(len(buf)), nil
}

func (c *Client) createUpload(ctx context.Context, in uploadInput, ws, actor string) (uploadOut, error) {
	body, _ := json.Marshal(in)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimSuffix(c.AssetBaseURL, "/")+"/internal/v1/assets/uploads", bytes.NewReader(body))
	if err != nil {
		return uploadOut{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	c.authHeaders(req, ws, actor)
	var out uploadOut
	if err := c.doJSON(req, &out); err != nil {
		return uploadOut{}, err
	}
	if out.ID == "" {
		return uploadOut{}, fmt.Errorf("asset returned empty upload id")
	}
	return out, nil
}

func (c *Client) putContent(ctx context.Context, uploadID string, content []byte, contentType, ws string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPut,
		strings.TrimSuffix(c.AssetBaseURL, "/")+"/internal/v1/assets/uploads/"+uploadID+"/content",
		bytes.NewReader(content))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("X-Workspace-Id", ws)
	req.Header.Set("Authorization", "Bearer "+c.Token)
	resp, err := c.AssetHTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 300))
		return fmt.Errorf("asset put: %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
	}
	return nil
}

func (c *Client) commit(ctx context.Context, uploadID, ws string) (assetOut, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimSuffix(c.AssetBaseURL, "/")+"/internal/v1/assets/uploads/"+uploadID+"/commit", nil)
	if err != nil {
		return assetOut{}, err
	}
	req.Header.Set("X-Workspace-Id", ws)
	req.Header.Set("Authorization", "Bearer "+c.Token)
	var out assetOut
	if err := c.doJSON(req, &out); err != nil {
		return assetOut{}, err
	}
	if out.ID == "" {
		return assetOut{}, fmt.Errorf("asset returned empty asset id")
	}
	return out, nil
}

func (c *Client) authHeaders(req *http.Request, ws, actor string) {
	req.Header.Set("Authorization", "Bearer "+c.Token)
	req.Header.Set("X-Workspace-Id", ws)
	req.Header.Set("X-Actor-Id", actor)
}

func (c *Client) doJSON(req *http.Request, out any) error {
	resp, err := c.AssetHTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 300))
		return fmt.Errorf("asset %s %s: %d: %s", req.Method, req.URL.Path, resp.StatusCode, strings.TrimSpace(string(msg)))
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(out); err != nil {
		return fmt.Errorf("asset %s %s: decode response: %w", req.Method, req.URL.Path, err)
	}
	return nil
}
