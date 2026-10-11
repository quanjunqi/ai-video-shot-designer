package catalog

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"shotdesigner/shared/netguard"
)

// ─────────────────────────────────────────────────────────────────────────────
// 上游清单的【抓取与解析】（ADR-004 §4 第①步：同步（自动））
//
// 为什么单独一个文件、而不塞进 pool.go：
//   pool.go 只管"怎么落库"（事务 / 缺失标记 / 价格变更），不含任何网络概念；
//   本文件只管"怎么拿到清单与密钥"—— 抓取、鉴权、解析、错误分类。
//   两者的接缝是 ApplySync 的入参 []UpstreamModel，因此可以各自演进、各自测试。
//
// ★ 出站必须走共享的 netguard（ADR-004 §5 风险表原话：「同步必须走 netguard」）：
//   上游 URL 由渠道配置决定，属用户可控 ⇒ 不打防护就是 SSRF 面。
// ─────────────────────────────────────────────────────────────────────────────

// ErrSyncNotConfigured：该渠道没配同步（sync_kind=none 或没给清单路径）。
// 这**不是**错误处理问题，而是"没配就别猜"——同步器不该替人决定去哪拉数据。
var ErrSyncNotConfigured = errors.New("catalog: channel sync is not configured (sync_kind/sync_models_path)")

// ErrChannelNotFound：渠道不存在。单独一个领域错误，是为了让 HTTP 层不必依赖 pgx
// （否则 handler 要去 import 驱动包才能把 ErrNoRows 映射成 404）。
var ErrChannelNotFound = errors.New("catalog: channel not found")

// SyncChannelConfig 是同步所需的最小渠道配置（全部来自 model_channels 一行）。
type SyncChannelConfig struct {
	ID              string
	Name            string
	BaseURL         string
	AuthType        string
	AuthHeader      string
	AuthPrefix      string
	SyncKind        string
	SyncModelsPath  string
	SyncPricingPath string
	TrustNote       string
}

// Credential 是上游鉴权所需的密钥（由 workspace 的 reveal 得到）。
type Credential struct {
	APIKey  string
	BaseURL string // 非空时**覆盖**渠道默认 base_url（与渠道探测的来源顺序一致）
}

// CredentialSource 抽象"去哪拿密钥"：生产实现走 workspace 内部 reveal 接口；
// 测试实现直接给值 —— 于是同步器的解析与落库逻辑都能在没有 workspace 的情况下被测。
type CredentialSource interface {
	Reveal(ctx context.Context, workspaceID, channelID string) (Credential, error)
}

// ModelLister 抽象"怎么抓并解析上游清单"：生产实现是 HTTP；测试实现给固定清单。
// 返回的 endpoints 是本次实际访问的上游地址映射（落进 channel_model_syncs.endpoints 供追溯）。
type ModelLister interface {
	List(ctx context.Context, cfg SyncChannelConfig, baseURL, apiKey string) (models []UpstreamModel, endpoints map[string]string, err error)
}

// Syncer 把"读配置 → 取密钥 → 抓取解析 → 落库 → 留痕"串起来。
type Syncer struct {
	Store       PostgresStore
	Credentials CredentialSource
	Lister      ModelLister
	// Channels 提供"某个工作区自己定义的渠道"（workspace 服务的 user_channels）。
	// 为什么需要：ADR-009 决定 2 —— 同步配置跟着渠道走；工作区自己的中转站配置只存在于工作区域。
	// 为 nil 时退回平台表（行为与引入工作区维度之前一致）。
	Channels UserChannelSource
	Now      func() time.Time
}

// UserChannelSource 读一个工作区自己的渠道定义（含同步配置）。
// found=false 表示该工作区没有这个渠道（而不是错误）。
type UserChannelSource interface {
	UserChannel(ctx context.Context, workspaceID, channelID string) (SyncChannelConfig, bool, error)
}

func (s Syncer) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

// LoadSyncConfig 读一个渠道的同步配置。
func (store PostgresStore) LoadSyncConfig(ctx context.Context, channelID string) (SyncChannelConfig, error) {
	var c SyncChannelConfig
	err := store.Pool.QueryRow(ctx, `
		SELECT id, name, COALESCE(base_url,''), COALESCE(auth_type,'none'),
		       COALESCE(auth_header,''), COALESCE(auth_prefix,''),
		       COALESCE(sync_kind,'none'), COALESCE(sync_models_path,''), COALESCE(sync_pricing_path,''),
		       COALESCE(trust_note,'')
		  FROM model_channels WHERE id = $1`, channelID).
		Scan(&c.ID, &c.Name, &c.BaseURL, &c.AuthType, &c.AuthHeader, &c.AuthPrefix,
			&c.SyncKind, &c.SyncModelsPath, &c.SyncPricingPath, &c.TrustNote)
	if err != nil {
		return SyncChannelConfig{}, err
	}
	return c, nil
}

// SyncChannel 同步一个渠道。
//
// 语义（逐条对应 ADR-004）：
//   - `sync_kind = none` 或清单路径为空 ⇒ **明确拒绝**（ErrSyncNotConfigured），不发任何请求
//   - base_url 的来源顺序与【渠道探测】一致：workspace reveal 的 baseUrl 优先，其次渠道行
//     （避免"探测走一个地址、同步走另一个地址"这种两套口径）
//   - **失败也留痕**：StartSync 之后无论成败都 FinishSync —— 同步记录是排障入口（§3.2）
//   - 成功时更新 last_sync_at（界面"上次同步时间"的来源）
//   - 落库复用 ApplySync：幂等 / 缺失只标记不删 / 绝不写 model_catalog
func (s Syncer) SyncChannel(ctx context.Context, workspaceID, channelID string) (SyncResult, error) {
	// 渠道配置的来源顺序（ADR-009 决定 2）：**工作区自己的渠道优先**，其次平台渠道。
	// 这也解开了 F3：工作区渠道的 id 就是它的 user_channels.id，不再要求"与平台 id 相同"。
	var cfg SyncChannelConfig
	found := false
	if s.Channels != nil {
		uc, ok, err := s.Channels.UserChannel(ctx, workspaceID, channelID)
		if err != nil {
			return SyncResult{}, fmt.Errorf("catalog: load workspace channel %s: %w", channelID, err)
		}
		if ok && uc.SyncKind != "" && uc.SyncKind != "none" {
			cfg, found = uc, true
		}
	}
	if !found {
		platformCfg, err := s.Store.LoadSyncConfig(ctx, channelID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return SyncResult{}, ErrChannelNotFound
			}
			return SyncResult{}, fmt.Errorf("catalog: load channel %s: %w", channelID, err)
		}
		cfg = platformCfg
	}
	if cfg.SyncKind == "" || cfg.SyncKind == "none" || strings.TrimSpace(cfg.SyncModelsPath) == "" {
		return SyncResult{}, ErrSyncNotConfigured
	}

	baseURL := strings.TrimSpace(cfg.BaseURL)
	apiKey := ""
	// auth_type=none 且没有自定义头 ⇒ 不需要密钥，也就不去打扰 workspace。
	needKey := !(cfg.AuthType == "none" && cfg.AuthHeader == "")
	if needKey {
		cred, err := s.Credentials.Reveal(ctx, workspaceID, channelID)
		if err != nil {
			return SyncResult{}, fmt.Errorf("catalog: reveal credentials for %s: %w", channelID, err)
		}
		apiKey = cred.APIKey
		if strings.TrimSpace(cred.BaseURL) != "" {
			baseURL = strings.TrimSpace(cred.BaseURL)
		}
	}
	if baseURL == "" {
		return SyncResult{}, fmt.Errorf("catalog: channel %s has no base_url (row or credentials)", channelID)
	}

	syncID, err := s.Store.StartSync(ctx, workspaceID, channelID)
	if err != nil {
		return SyncResult{}, fmt.Errorf("catalog: start sync record: %w", err)
	}

	var res SyncResult
	var endpointsJSON, diffJSON json.RawMessage
	models, endpoints, listErr := s.Lister.List(ctx, cfg, baseURL, apiKey)
	if listErr == nil {
		res, listErr = s.Store.ApplySync(ctx, workspaceID, channelID, models)
	}
	if b, mErr := json.Marshal(endpoints); mErr == nil {
		endpointsJSON = b
	}
	if b, mErr := json.Marshal(map[string]any{
		"raw_count": res.RawCount, "added": res.Added, "updated": res.Updated,
		"missing": res.Missing, "price_changed": res.PriceChanged,
	}); mErr == nil {
		diffJSON = b
	}
	if fErr := s.Store.FinishSync(ctx, syncID, res, endpointsJSON, diffJSON, listErr); fErr != nil {
		return res, fmt.Errorf("catalog: finish sync record: %w", fErr)
	}
	if listErr != nil {
		return res, listErr
	}
	if _, err := s.Store.Pool.Exec(ctx,
		`UPDATE model_channels SET last_sync_at = $2, updated_at = now() WHERE id = $1`, channelID, s.now()); err != nil {
		return res, fmt.Errorf("catalog: update last_sync_at: %w", err)
	}
	return res, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// 生产实现：HTTP 抓取（openai_compatible）
// ─────────────────────────────────────────────────────────────────────────────

// HTTPLister 按 openai_compatible 约定抓取上游清单。
//
// 约定（与 ADR-004 §3.3 的 sync_kind 对应）：
//   - 模型清单：`{base_url}{sync_models_path}` ⇒ `{"data":[{"id":"…"}]}`（OpenAI 兼容）
//   - 价格（可选）：`{base_url}{sync_pricing_path}` ⇒ `{"<model id>":{"amount":…,"unit":…}}`
//     价格**抓不到不算失败**：很多中转站不提供该接口，而模型清单仍然有价值；
//     失败原因写进 endpoints，便于排障（不是静默吞掉）。
type HTTPLister struct {
	Client *http.Client
	// Policy 显式持有：发请求前用它做一次【可读的】早校验（与 probe 同一写法）。
	// 不靠对 Transport 做类型断言 —— 那种写法一旦实现变化就会静默失效，
	// 而"防护静默失效"正是本仓库反复吃亏的模式。
	Policy netguard.Policy
}

// NewHTTPLister 用 netguard 策略造一个带 SSRF 防护的抓取器。
func NewHTTPLister(policy netguard.Policy, timeout time.Duration) *HTTPLister {
	return &HTTPLister{Client: policy.NewClient(timeout), Policy: policy}
}

func (l *HTTPLister) List(ctx context.Context, cfg SyncChannelConfig, baseURL, apiKey string) ([]UpstreamModel, map[string]string, error) {
	if l.Client == nil {
		return nil, nil, errors.New("catalog: lister has no http client (netguard policy not configured)")
	}
	modelsURL, err := joinURL(baseURL, cfg.SyncModelsPath)
	if err != nil {
		return nil, nil, err
	}
	endpoints := map[string]string{"models": modelsURL}

	// 发请求前的早校验：给出可读的错误（真正的保证在 netguard 的 dial 阶段）。
	if err := l.check(modelsURL); err != nil {
		return nil, endpoints, err
	}
	body, err := l.get(ctx, modelsURL, cfg, apiKey)
	if err != nil {
		return nil, endpoints, err
	}
	models, err := parseModels(body)
	if err != nil {
		return nil, endpoints, fmt.Errorf("catalog: parse models from %s: %w", modelsURL, err)
	}

	if strings.TrimSpace(cfg.SyncPricingPath) != "" {
		if pricingURL, err := joinURL(baseURL, cfg.SyncPricingPath); err == nil {
			endpoints["pricing"] = pricingURL
			if err := l.check(pricingURL); err != nil {
				endpoints["pricing_error"] = err.Error()
			} else if pb, err := l.get(ctx, pricingURL, cfg, apiKey); err != nil {
				endpoints["pricing_error"] = err.Error()
			} else if prices, err := parsePricingMap(pb); err != nil {
				endpoints["pricing_error"] = err.Error()
			} else {
				for i := range models {
					if raw, ok := prices[models[i].ProviderModel]; ok {
						models[i].Pricing = raw
					}
				}
			}
		}
	}
	return models, endpoints, nil
}

// check 是发请求前的早校验：把"被策略拒绝"变成一句可读的话。
// 真正的保证在 netguard 的 dial 阶段（连接建立前拒绝），这里是给人看的。
func (l *HTTPLister) check(raw string) error {
	return l.Policy.CheckURL(raw)
}

func (l *HTTPLister) get(ctx context.Context, raw string, cfg SyncChannelConfig, apiKey string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return nil, err
	}
	authHeader, authValue := authFor(cfg, apiKey)
	if authHeader != "" {
		req.Header.Set(authHeader, authValue)
	}
	req.Header.Set("Accept", "application/json")
	resp, err := l.Client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("catalog: GET %s: %w", raw, err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return nil, fmt.Errorf("catalog: GET %s: HTTP %d: %s", raw, resp.StatusCode, truncate(string(body), 200))
	}
	return body, nil
}

// authFor 与【引擎】的鉴权语义逐字一致（engine.go 的 data-driven 分支）：
//
//	AuthHeader 非空 ⇒ 写 `AuthHeader: AuthPrefix + APIKey`（AuthPrefix 可空 = 裸 token）
//	否则按 auth_type：bearer/apikey/sign ⇒ `Authorization: Bearer <key>`
//	                  token            ⇒ `Authorization: <key>`
//	                  其它/空           ⇒ Bearer（历史默认不得漂移）
//
// 「同一个渠道，探测 / 同步 / 实际调用必须用同一套鉴权」—— 否则会出现
// "探测通过但同步 401"这类极难排查的差异。
func authFor(cfg SyncChannelConfig, apiKey string) (string, string) {
	if cfg.AuthHeader != "" {
		return cfg.AuthHeader, cfg.AuthPrefix + apiKey
	}
	switch strings.ToLower(strings.TrimSpace(cfg.AuthType)) {
	case "token":
		return "Authorization", apiKey
	default: // bearer / apikey / sign / 空 / 未知
		return "Authorization", "Bearer " + apiKey
	}
}

func joinURL(base, path string) (string, error) {
	base = strings.TrimRight(strings.TrimSpace(base), "/")
	path = strings.TrimSpace(path)
	if base == "" {
		return "", errors.New("catalog: empty base url")
	}
	if path == "" {
		return "", errors.New("catalog: empty path")
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	u, err := url.Parse(base + path)
	if err != nil {
		return "", fmt.Errorf("catalog: invalid url %q: %w", base+path, err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", fmt.Errorf("catalog: unsupported scheme %q", u.Scheme)
	}
	return u.String(), nil
}

// parseModels 只认 OpenAI 兼容的 `{"data":[{"id":…}]}`（外加同形状的 `{"models":[…]}`）。
// 认不出就报错 —— 不猜上游格式（猜错会把垃圾写进供给池，比报错危险得多）。
func parseModels(body []byte) ([]UpstreamModel, error) {
	var env struct {
		Data   []json.RawMessage `json:"data"`
		Models []json.RawMessage `json:"models"`
	}
	if err := json.Unmarshal(body, &env); err != nil {
		return nil, fmt.Errorf("not a JSON object: %w", err)
	}
	items := env.Data
	if len(items) == 0 {
		items = env.Models
	}
	if items == nil {
		return nil, errors.New(`no "data" or "models" array`)
	}
	out := make([]UpstreamModel, 0, len(items))
	for _, raw := range items {
		var one struct {
			ID          string          `json:"id"`
			Name        string          `json:"name"`
			Type        string          `json:"type"`
			Object      string          `json:"object"`
			OwnedBy     string          `json:"owned_by"`
			Vendor      string          `json:"vendor"`
			Created     int64           `json:"created"`
			Pricing     json.RawMessage `json:"pricing"`
			Endpoints   json.RawMessage `json:"endpoints"`
			EndpointTyp json.RawMessage `json:"endpoint_types"`
			Tags        json.RawMessage `json:"tags"`
		}
		if err := json.Unmarshal(raw, &one); err != nil {
			return nil, fmt.Errorf("malformed entry: %w", err)
		}
		id := strings.TrimSpace(one.ID)
		if id == "" {
			return nil, errors.New("entry without id")
		}
		m := UpstreamModel{
			ProviderModel: id,
			DisplayName:   strings.TrimSpace(one.Name),
			ModelType:     strings.TrimSpace(one.Type),
			Vendor:        strings.TrimSpace(firstNonEmpty(one.Vendor, one.OwnedBy)),
			Raw:           raw,
		}
		if m.DisplayName == "" {
			m.DisplayName = id
		}
		if m.ModelType == "" {
			m.ModelType = strings.TrimSpace(one.Object) // 上游原样标签，不做约束（§3.1）
		}
		switch {
		case len(one.EndpointTyp) > 0:
			m.EndpointTypes = one.EndpointTyp
		case len(one.Endpoints) > 0:
			m.EndpointTypes = one.Endpoints
		}
		if len(one.Tags) > 0 {
			m.Tags = strings.Trim(string(one.Tags), `"`)
			if strings.HasPrefix(m.Tags, "[") {
				m.Tags = strings.Trim(m.Tags, "[]")
			}
		}
		if len(one.Pricing) > 0 {
			m.Pricing = one.Pricing
		}
		if one.Created > 0 {
			t := time.Unix(one.Created, 0).UTC()
			m.RemoteCreatedAt = &t
		}
		out = append(out, m)
	}
	return out, nil
}

// parsePricingMap 认 `{"<model id>": {"amount":…,"unit":…}}`；认不出就整体丢弃（不猜）。
func parsePricingMap(body []byte) (map[string]json.RawMessage, error) {
	var m map[string]json.RawMessage
	if err := json.Unmarshal(body, &m); err != nil {
		return nil, err
	}
	return m, nil
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
