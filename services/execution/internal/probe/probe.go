// Package probe 是渠道连通性探测的**唯一实现**（TASK-INFRA-004）。
//
// 取代了此前并存的两套等价实现：production 的 internal/probe（跨库直读 workspace
// 的 channel_credentials，违反 AGENTS.md §3.1）与 web-bff 在边缘自己发起的探测
// （base URL 直接来自请求体，是 SSRF 面）。BFF 现在只做转发。
//
// 不变式：
//
//  1. 输入只有 workspaceID + actorID + channelID。base URL 一律取自服务端来源
//     （工作区用户渠道定义 / 工作区凭据行 / 平台目录），**永不取自请求体**。
//  2. 凭据只取「是否已配置 + 鉴权方式」，真实密钥不进入探测：请求里始终携带占位串
//     （既有设计，本片不改；真实鉴权只在 execution 的引擎路径解密执行）。
//  3. 出站请求走 netguard：私网 / 环回 / 云元数据等目标在**建立连接前**被拒绝。
//     被拒绝时结果如实标注为「策略拒绝」并给出放开方式，绝不伪装成普通网络不可达。
//  4. 返回结构与被替换的 probe.Result 逐字段一致（前端 ProbeResult 消费侧不变）。
package probe

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"shotdesigner/services/execution/internal/catalog"
	"shotdesigner/services/execution/internal/creds"
	"shotdesigner/shared/netguard"
)

// UserAgent 是探测请求的 User-Agent（沿用既有字面量，运维侧按此识别探活流量）。
const UserAgent = "JingxuStudio/probe"

// placeholderSecret 是探测请求携带的占位凭据。探测从不解密、也不发送真实密钥。
const placeholderSecret = "<REDACTED>"

// policyDeniedHint 说明「策略拒绝」不是网络故障，并给出放开方式（本片采选项 ③：
// 只做如实拒绝 + 可读 detail，不引入按渠道粒度的私网开关）。
const policyDeniedHint = "如需放开，请为 execution 设置 EXECUTION_ALLOW_PRIVATE_UPSTREAM=1 后重启"

// ErrChannelNotFound 表示该渠道在平台目录、工作区用户渠道、凭据行里都不存在。
var ErrChannelNotFound = errors.New("probe: channel not found")

// Result 与旧 probe.Result（production）字段逐一对应；前端 ProbeResult 依赖这些键名，
// 因此不得改名、不得新增必填字段。
type Result struct {
	ChannelID      string `json:"channelId"`
	Reachable      bool   `json:"reachable"`
	AuthConfigured bool   `json:"authConfigured"`
	AuthOK         *bool  `json:"authOk,omitempty"`
	StatusCode     int    `json:"statusCode,omitempty"`
	Detail         string `json:"detail"`
	ProbedAt       string `json:"probedAt"`
}

// Prober 执行一次真实的渠道探测。
type Prober struct {
	// Catalog 提供平台内置渠道的默认 base URL（production 目录）。
	Catalog *catalog.Client
	// Workspace 提供工作区用户渠道定义与凭据存在性（workspace；不涉及明文）。
	Workspace *creds.Client
	// Policy 决定哪些出站目标允许（netguard）。
	Policy netguard.Policy
	// Client 由 Policy 构造，带 SSRF 防护。
	Client *http.Client
}

// New 构造 Prober；timeout <= 0 时用默认的探测超时。
// Catalog / Workspace 允许为 nil（缺哪一个就少一个 base URL 来源），但两者都 nil 时
// Probe 会返回错误而不是假装探测。
func New(cat *catalog.Client, ws *creds.Client, policy netguard.Policy, timeout time.Duration) *Prober {
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	return &Prober{Catalog: cat, Workspace: ws, Policy: policy, Client: policy.NewClient(timeout)}
}

// Probe 对 channelID 做一次真实探测。
//
// 返回 error 只表示「探测无法执行」（渠道不存在、依赖服务不可用）；
// 网络层/策略层的失败一律是 Result 的一部分（reachable=false + 可读 detail），
// 与旧实现一致。
func (p *Prober) Probe(ctx context.Context, workspaceID, actorID, channelID string) (Result, error) {
	res := Result{ChannelID: channelID, ProbedAt: time.Now().UTC().Format(time.RFC3339)}
	if strings.TrimSpace(channelID) == "" {
		return res, ErrChannelNotFound
	}

	facts, err := p.resolve(ctx, workspaceID, actorID, channelID)
	if err != nil {
		return res, err
	}
	if !facts.found {
		return res, ErrChannelNotFound
	}
	res.AuthConfigured = facts.hasCredential && facts.hasKey

	if strings.TrimSpace(facts.baseURL) == "" {
		res.Detail = "未配置 Base URL，无法探测"
		return res, nil
	}
	probeURL, err := normalizeBaseURL(facts.baseURL)
	if err != nil {
		res.Detail = "Base URL 不是合法 http(s) 地址，无法探测"
		return res, nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, probeURL+"/", nil)
	if err != nil {
		res.Detail = fmt.Sprintf("请求构造失败：%v", err)
		return res, nil
	}
	req.Header.Set("User-Agent", UserAgent)
	if res.AuthConfigured {
		switch facts.authType {
		case "bearer":
			req.Header.Set("Authorization", "Bearer "+placeholderSecret)
		case "apikey":
			req.Header.Set("X-API-Key", placeholderSecret)
		case "sign":
			req.Header.Set("Authorization", "Sign "+placeholderSecret)
		}
	}

	// 发请求前先做可读的早期校验（真正的保证在 netguard 的 dial 阶段）：命中
	// 白名单/协议类拒绝时不必等到拨号。
	if err := p.Policy.CheckURL(probeURL + "/"); err != nil {
		return denyByPolicy(res, err), nil
	}
	if p.Client == nil {
		return res, errors.New("probe: http client is not configured")
	}
	resp, err := p.Client.Do(req)
	if err != nil {
		res.Reachable = false
		if isPolicyDenied(err) {
			return denyByPolicy(res, err), nil
		}
		res.Detail = fmt.Sprintf("网络不可达：%v", err)
		return res, nil
	}
	defer resp.Body.Close()
	res.Reachable = true
	res.StatusCode = resp.StatusCode
	if res.AuthConfigured {
		ok := resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusAccepted
		res.AuthOK = &ok
		switch resp.StatusCode {
		case http.StatusOK, http.StatusCreated, http.StatusAccepted:
			res.Detail = "网络可达，鉴权探测通过（占位凭据；正式调用由 provider 客户端解密执行）"
		case http.StatusUnauthorized:
			res.Detail = "网络可达，鉴权被拒（401：凭据无效或需正式签名）"
		case http.StatusForbidden:
			res.Detail = "网络可达，鉴权被拒（403：无权访问该端点）"
		default:
			res.Detail = fmt.Sprintf("网络可达，鉴权端点返回 %d（真实状态如实上报）", resp.StatusCode)
		}
		return res, nil
	}
	res.Detail = fmt.Sprintf("网络可达（HTTP %d）；未配置凭据，真实鉴权待配置 API Key", resp.StatusCode)
	return res, nil
}

// channelFacts 是解析出来的渠道事实（全部来自服务端来源）。
type channelFacts struct {
	baseURL       string
	authType      string
	found         bool
	hasCredential bool
	hasKey        bool
}

// resolve 解析渠道的 base URL / 鉴权方式 / 凭据存在性。
//
// 来源优先级（全部服务端侧；与前端「用户渠道覆盖平台目录」的合并语义一致，
// 见 apps/web/src/stores/useSettingsStore.ts 的 upsertChannel：用户对内置渠道的
// 修改同样写入 workspace 用户渠道域）：
//
//  1. 工作区用户渠道定义（用户实际看到、点「测试」时预期被探测的地址）
//  2. 工作区凭据行的 base URL（历史行为：只配置过凭据、没有渠道行的渠道）
//  3. 平台目录 model_channels（内置渠道的默认 base URL，仅在前面都为空时才查）
func (p *Prober) resolve(ctx context.Context, workspaceID, actorID, channelID string) (channelFacts, error) {
	var f channelFacts
	if p.Catalog == nil && p.Workspace == nil {
		return f, errors.New("probe: no channel source configured (catalog and workspace both unavailable)")
	}

	var userFound bool
	if p.Workspace != nil {
		channels, err := p.Workspace.ListUserChannels(ctx, workspaceID)
		if err != nil {
			return f, fmt.Errorf("probe: workspace channels unavailable: %w", err)
		}
		for _, c := range channels {
			if c.ID == channelID {
				userFound = true
				if strings.TrimSpace(c.BaseURL) != "" {
					f.baseURL = c.BaseURL
				}
				f.authType = c.AuthType
				break
			}
		}
		statuses, err := p.Workspace.ListCredentialStatus(ctx, workspaceID)
		if err != nil {
			return f, fmt.Errorf("probe: workspace credential status unavailable: %w", err)
		}
		for _, s := range statuses {
			if s.ChannelID == channelID {
				f.hasCredential, f.hasKey = true, s.HasKey
				if strings.TrimSpace(f.baseURL) == "" {
					f.baseURL = s.BaseURL
				}
				if f.authType == "" {
					f.authType = s.AuthType
				}
				break
			}
		}
	}

	var catalogFound bool
	if strings.TrimSpace(f.baseURL) == "" && p.Catalog != nil {
		dir, err := p.Catalog.Get(ctx, workspaceID, actorID)
		if err != nil {
			if userFound || f.hasCredential {
				// 渠道在 workspace 已有定义、只是没填地址：目录只是兜底来源，
				// 它不可用不该改变「渠道存在但未配置 Base URL」这一结论。
				f.found = true
				return f, nil
			}
			return f, fmt.Errorf("probe: catalog unavailable: %w", err)
		}
		for _, c := range dir.Channels {
			if c.ID == channelID {
				catalogFound = true
				f.baseURL = c.BaseURL
				break
			}
		}
	}

	f.found = userFound || f.hasCredential || catalogFound
	return f, nil
}

// normalizeBaseURL 归一化 base URL。
//
// 裸 host:port（本地 ComfyUI/Ollama）按既有行为补全 http:// 前缀
// （docs/product/design.md：探测/执行对裸 host:port 自动补全 http://）；
// 其它非 http(s) 协议一律拒绝。
func normalizeBaseURL(base string) (string, error) {
	u := strings.TrimRight(strings.TrimSpace(base), "/")
	if strings.HasPrefix(u, "http://") || strings.HasPrefix(u, "https://") {
		return u, nil
	}
	if strings.Contains(u, "://") {
		return "", fmt.Errorf("unsupported scheme: %q", base)
	}
	if u == "" {
		return "", errors.New("empty base url")
	}
	return "http://" + u, nil
}

// denyByPolicy 把策略拒绝如实写进 detail（选项 ③）：说明是「被策略拒绝」而不是
// 网络不可达，并给出放开方式。
func denyByPolicy(res Result, cause error) Result {
	res.Reachable = false
	res.StatusCode = 0
	res.AuthOK = nil
	res.Detail = fmt.Sprintf("目标被出站策略拒绝（未发起连接，非网络故障）：%v；%s", cause, policyDeniedHint)
	return res
}

// isPolicyDenied 判断错误是否来自 netguard 的策略拒绝。
//
// netguard 的拒绝发生在 net.Dialer.Control，错误经 *net.OpError / *url.Error
// 逐层包装后仍带 "netguard: " 前缀。本 Prober 的 client 由 netguard 构造，
// 是这条链路上唯一可能产生该前缀的来源；据此把「安全拒绝」与「普通网络故障」
// 分开，避免把策略拒绝伪装成不可达。
func isPolicyDenied(err error) bool {
	for err != nil {
		if strings.Contains(err.Error(), "netguard") {
			return true
		}
		err = errors.Unwrap(err)
	}
	return false
}
