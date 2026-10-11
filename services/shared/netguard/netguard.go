// Package netguard 为「面向用户可控 URL 的出站请求」提供 SSRF 防护。
//
// 威胁模型
//
//	渠道凭据里的 base_url 来自 workspace（用户可写）。execution 的模型网关会
//	按该 URL 发起请求，并把**响应体返回给调用方、同时写入审计日志**。
//	若不做校验，任何能写渠道凭据的人都可以让网关去请求：
//	  · 云元数据服务（169.254.169.254）→ 窃取实例凭据
//	  · 内网服务（postgres:5432、k8s API、内部管理端口）→ 探测与越权
//	  · 环回地址 → 访问仅本机可达的服务
//	且响应内容会经审计日志与 API 返回体外泄，构成完整的数据外泄通道。
//
// 设计要点
//
//  1. 校验发生在 net.Dialer.Control —— 它在 **DNS 解析之后、建立连接之前**执行，
//     拿到的是**即将拨号的真实 IP**。因此对 DNS rebinding（先解析到公网、再解析到
//     内网）免疫：不存在「校验时是公网、连接时是内网」的时间窗。
//  2. 同时覆盖重定向：http.Client 跟随 302 时复用同一 Transport → 仍走 Control。
//  3. 默认**拒绝**私网；本地开发需要访问 localhost 时用
//     EXECUTION_ALLOW_PRIVATE_UPSTREAM=1 显式开启（安全默认 + 明确 opt-in）。
//  4. 只应用于**用户可控 URL** 的 client。内部服务调用（production/workspace 的
//     http://production:8081 之类）目标是私网地址，绝不能套用本包，否则会自断链路。
package netguard

import (
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"syscall"
	"time"
)

// Policy 决定哪些出站目标是允许的。
type Policy struct {
	// AllowPrivate 放开私网/环回/链路本地地址。仅供本地开发（如本机 ComfyUI）。
	AllowPrivate bool
	// AllowedHosts 非空时，仅允许这些主机名（精确匹配或子域后缀匹配）。
	AllowedHosts []string
}

// FromEnv 按环境变量构造 Policy。
//
//	EXECUTION_ALLOW_PRIVATE_UPSTREAM=1     放开私网（本地开发）
//	EXECUTION_ALLOWED_UPSTREAM_HOSTS=a,b   仅允许这些主机（可选）
//
// FromEnv 保持【原名与原有语义】（EXECUTION_ 前缀）：execution 侧零改动。
func FromEnv(getenv func(string) string) Policy { return FromEnvWithPrefix("EXECUTION", getenv) }

// FromEnvWithPrefix 是同一策略的【可复用】形式：环境变量前缀由调用方给。
//
// 为什么需要它：本包已从 execution 内部搬到共享模块（`shotdesigner/shared/netguard`），
// production 的供给池同步器也要用它。若共用同一组变量名，两个服务会互相干扰
// （execution 的私网开关会顺带打开 production 的）。故各自一组：
//
//	execution  → EXECUTION_ALLOW_PRIVATE_UPSTREAM  / EXECUTION_ALLOWED_UPSTREAM_HOSTS
//	production → PRODUCTION_ALLOW_PRIVATE_UPSTREAM / PRODUCTION_ALLOWED_UPSTREAM_HOSTS
func FromEnvWithPrefix(prefix string, getenv func(string) string) Policy {
	p := Policy{AllowPrivate: getenv(prefix+"_ALLOW_PRIVATE_UPSTREAM") == "1"}
	for _, h := range strings.Split(getenv(prefix+"_ALLOWED_UPSTREAM_HOSTS"), ",") {
		if h = strings.ToLower(strings.TrimSpace(h)); h != "" {
			p.AllowedHosts = append(p.AllowedHosts, h)
		}
	}
	return p
}

// hostAllowed 判断主机名是否满足白名单（空名单视为不限制）。
func (p Policy) hostAllowed(host string) bool {
	if len(p.AllowedHosts) == 0 {
		return true
	}
	h := strings.ToLower(strings.TrimSuffix(host, "."))
	for _, allowed := range p.AllowedHosts {
		if h == allowed || strings.HasSuffix(h, "."+allowed) {
			return true
		}
	}
	return false
}

// CheckURL 在发请求前做早期校验，给出可读错误（真正的保证在 Control）。
func (p Policy) CheckURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("netguard: 无法解析 upstream URL: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("netguard: 仅允许 http/https，实际为 %q", u.Scheme)
	}
	if u.Hostname() == "" {
		return fmt.Errorf("netguard: upstream URL 缺少主机名")
	}
	if !p.hostAllowed(u.Hostname()) {
		return fmt.Errorf("netguard: 主机 %q 不在 EXECUTION_ALLOWED_UPSTREAM_HOSTS 白名单内", u.Hostname())
	}
	return nil
}

// CheckIP 判断某个**已解析的真实 IP** 是否允许连接。
func (p Policy) CheckIP(ip net.IP) error {
	if ip == nil {
		return fmt.Errorf("netguard: 无法解析目标 IP")
	}
	// IPv4-mapped IPv6（::ffff:10.0.0.1）必须还原为 IPv4 再判断，
	// 否则会绕过私网检查。
	if v4 := ip.To4(); v4 != nil {
		ip = v4
	}
	// 第一类：**任何情况都拒绝** —— 链路本地（含云元数据 169.254.169.254）、
	// 未指定、组播、保留网段。本地开发也不需要这些。
	if isAlwaysBlocked(ip) {
		return fmt.Errorf("netguard: 目标地址 %s 属禁止类别（链路本地/云元数据/未指定/组播/保留）", ip)
	}
	// 第二类：默认拒绝环回与私网；AllowPrivate 显式放开，
	// 因为该开关的用途正是「本地开发访问本机/内网 provider」。
	if !p.AllowPrivate && (ip.IsLoopback() || isPrivate(ip)) {
		return fmt.Errorf("netguard: 目标地址 %s 属环回/私网，已拒绝（如为本地开发请设置 EXECUTION_ALLOW_PRIVATE_UPSTREAM=1）", ip)
	}
	return nil
}

func isAlwaysBlocked(ip net.IP) bool {
	return ip.IsLinkLocalUnicast() || // 169.254.0.0/16、fe80::/10 —— 含云元数据 169.254.169.254
		ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() ||
		ip.IsMulticast() ||
		ip.IsUnspecified() || // 0.0.0.0、::
		isReservedOrSpecial(ip)
}

// isPrivate 覆盖 RFC1918、IPv6 ULA、以及运营商级 NAT。
func isPrivate(ip net.IP) bool {
	if ip.IsPrivate() { // 10/8、172.16/12、192.168/16、fc00::/7
		return true
	}
	if v4 := ip.To4(); v4 != nil {
		switch {
		case v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127: // 100.64.0.0/10 CGNAT
			return true
		}
	}
	return false
}

// isReservedOrSpecial 覆盖若干保留/特殊网段（含基准测试网段与 IPv4 广播）。
func isReservedOrSpecial(ip net.IP) bool {
	if v4 := ip.To4(); v4 != nil {
		switch {
		case v4[0] == 0: // 0.0.0.0/8
			return true
		case v4[0] == 192 && v4[1] == 0 && v4[2] == 0: // 192.0.0.0/24
			return true
		case v4[0] == 198 && (v4[1] == 18 || v4[1] == 19): // 198.18.0.0/15 基准测试
			return true
		case v4[0] >= 240: // 240.0.0.0/4 保留 + 255.255.255.255 广播
			return true
		}
	}
	return false
}

// Control 是注入 net.Dialer 的钩子：在解析后、连接前校验真实 IP。
func (p Policy) Control(_ string, address string, _ syscall.RawConn) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return fmt.Errorf("netguard: 无法解析拨号地址 %q: %w", address, err)
	}
	ip := net.ParseIP(host)
	if ip == nil {
		// Dialer 通常传入已解析的 IP；出现非 IP 说明形态异常，保守拒绝。
		return fmt.Errorf("netguard: 拨号地址 %q 不是 IP，已拒绝", host)
	}
	return p.CheckIP(ip)
}

// NewTransport 返回带 SSRF 防护的 Transport。
func (p Policy) NewTransport() *http.Transport {
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.DialContext = (&net.Dialer{
		Timeout:   30 * time.Second,
		KeepAlive: 30 * time.Second,
		Control:   p.Control,
	}).DialContext
	return t
}

// NewClient 返回带 SSRF 防护的 http.Client。
func (p Policy) NewClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout:   timeout,
		Transport: p.NewTransport(),
		// 重定向同样经 Transport 拨号，故仍受 Control 约束。
		// 这里额外限制跳数，避免被恶意上游拖入长重定向链。
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return fmt.Errorf("netguard: 重定向次数过多（>=5）")
			}
			return p.CheckURL(req.URL.String())
		},
	}
}
