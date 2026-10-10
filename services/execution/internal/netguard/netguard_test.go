package netguard

import (
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestCheckIP_DefaultPolicyBlocksInternalRanges(t *testing.T) {
	p := Policy{} // 默认：拒绝私网
	blocked := []string{
		"127.0.0.1",        // 环回
		"::1",              // 环回 v6
		"10.0.0.5",         // RFC1918
		"172.16.0.1",       // RFC1918
		"172.31.255.254",   // RFC1918 上界
		"192.168.1.1",      // RFC1918
		"169.254.169.254",  // ★ 云元数据（链路本地）—— 任何情况都拒绝
		"fe80::1",          // 链路本地 v6
		"fd00::1",          // IPv6 ULA
		"100.64.0.1",       // CGNAT
		"0.0.0.0",          // 未指定
		"::",               // 未指定 v6
		"224.0.0.1",        // 组播
		"198.18.0.1",       // 基准测试网段
		"240.0.0.1",        // 保留
		"255.255.255.255",  // 广播
		"::ffff:10.0.0.1",  // ★ IPv4-mapped：必须还原后判断，否则绕过
		"::ffff:127.0.0.1", // ★ IPv4-mapped 环回
	}
	for _, s := range blocked {
		if err := p.CheckIP(net.ParseIP(s)); err == nil {
			t.Errorf("默认策略下 %s 应被拒绝，但通过了", s)
		}
	}
}

func TestCheckIP_DefaultPolicyAllowsPublic(t *testing.T) {
	p := Policy{}
	for _, s := range []string{"8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"} {
		if err := p.CheckIP(net.ParseIP(s)); err != nil {
			t.Errorf("公网地址 %s 应被允许，但被拒: %v", s, err)
		}
	}
}

func TestCheckIP_AllowPrivateOpensLoopbackAndPrivateButNotMetadata(t *testing.T) {
	p := Policy{AllowPrivate: true}
	for _, s := range []string{"127.0.0.1", "10.0.0.5", "192.168.1.1", "::1", "fd00::1"} {
		if err := p.CheckIP(net.ParseIP(s)); err != nil {
			t.Errorf("AllowPrivate 下 %s 应被允许，但被拒: %v", s, err)
		}
	}
	// 云元数据与保留网段即便放开私网也必须拒绝 ——
	// 否则「本地开发开关」会变成「读取云实例凭据的开关」。
	for _, s := range []string{"169.254.169.254", "fe80::1", "0.0.0.0", "224.0.0.1", "255.255.255.255"} {
		if err := p.CheckIP(net.ParseIP(s)); err == nil {
			t.Errorf("AllowPrivate 下 %s 仍必须被拒绝，但通过了", s)
		}
	}
}

func TestCheckURL(t *testing.T) {
	p := Policy{}
	if err := p.CheckURL("https://api.openai.com/v1/chat"); err != nil {
		t.Errorf("https 公网应通过: %v", err)
	}
	for _, bad := range []string{
		"ftp://example.com/x",
		"file:///etc/passwd",
		"not-a-url",
		"https://",
	} {
		if err := p.CheckURL(bad); err == nil {
			t.Errorf("%q 应被拒绝", bad)
		}
	}
}

func TestCheckURL_Allowlist(t *testing.T) {
	p := Policy{AllowedHosts: []string{"api.openai.com", "gateway.example.com"}}
	allow := []string{
		"https://api.openai.com/v1/x",
		"https://sub.api.openai.com/v1/x", // 子域允许
		"https://gateway.example.com/x",
	}
	for _, u := range allow {
		if err := p.CheckURL(u); err != nil {
			t.Errorf("白名单内 %s 应通过: %v", u, err)
		}
	}
	for _, u := range []string{
		"https://evil.com/x",
		"https://api.openai.com.evil.com/x", // 后缀伪装必须拒绝
		"https://notapi.openai.com/x",
	} {
		if err := p.CheckURL(u); err == nil {
			t.Errorf("白名单外 %q 应被拒绝", u)
		}
	}
}

// 集成验证 1：默认策略下，请求环回地址必须在**连接前**被拦下。
func TestClient_BlocksLoopbackByDefault(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "SHOULD-NOT-BE-REACHED")
	}))
	defer srv.Close()

	client := Policy{}.NewClient(5 * time.Second)
	_, err := client.Get(srv.URL)
	if err == nil {
		t.Fatal("默认策略应拦截对环回地址的请求，但请求成功了")
	}
	if !strings.Contains(err.Error(), "netguard") {
		t.Fatalf("错误应来自 netguard，实际为: %v", err)
	}
}

// 集成验证 2：AllowPrivate 下同一请求必须成功 ——
// 证明防护不会破坏「本地开发访问本机 provider」。
func TestClient_AllowPrivatePermitsLocalProvider(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "OK")
	}))
	defer srv.Close()

	client := Policy{AllowPrivate: true}.NewClient(5 * time.Second)
	resp, err := client.Get(srv.URL)
	if err != nil {
		t.Fatalf("AllowPrivate 下本地请求应成功，实际: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "OK" {
		t.Fatalf("响应体异常: %q", body)
	}
}

// 集成验证 3：允许的初始主机若 302 到被禁地址，必须在重定向时被拒。
func TestClient_RevalidatesRedirectTarget(t *testing.T) {
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "http://169.254.169.254/latest/meta-data/", http.StatusFound)
	}))
	defer srv.Close()

	// 让初始主机（环回）在私网放开 + 白名单内通过，但重定向目标不在白名单
	p := Policy{AllowPrivate: true, AllowedHosts: []string{"127.0.0.1"}}
	client := p.NewClient(5 * time.Second)
	if _, err := client.Get(srv.URL); err == nil {
		t.Fatal("重定向到云元数据地址必须被拒绝，但通过了")
	} else if !strings.Contains(err.Error(), "netguard") {
		t.Fatalf("错误应来自 netguard，实际: %v", err)
	}
}

// 集成验证 4：重定向跳数上限。
func TestClient_RedirectHopLimit(t *testing.T) {
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, srv.URL+r.URL.Path+"x", http.StatusFound)
	}))
	defer srv.Close()

	client := Policy{AllowPrivate: true}.NewClient(5 * time.Second)
	if _, err := client.Get(srv.URL); err == nil {
		t.Fatal("超过 5 跳应报错")
	} else if !strings.Contains(err.Error(), "重定向次数过多") {
		t.Fatalf("应命中跳数上限，实际: %v", err)
	}
}

// 集成验证 5：真正走通一次「受控 client + 上下文」的请求路径。
func TestClient_RequestWithContext(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "pong")
	}))
	defer srv.Close()

	client := Policy{AllowPrivate: true}.NewClient(5 * time.Second)
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, srv.URL, nil)
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("请求失败: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("状态码 %d", resp.StatusCode)
	}
}

func TestFromEnv(t *testing.T) {
	env := map[string]string{
		"EXECUTION_ALLOW_PRIVATE_UPSTREAM": "1",
		"EXECUTION_ALLOWED_UPSTREAM_HOSTS": " A.com , b.com ,, ",
	}
	p := FromEnv(func(k string) string { return env[k] })
	if !p.AllowPrivate {
		t.Error("AllowPrivate 应为 true")
	}
	if len(p.AllowedHosts) != 2 || p.AllowedHosts[0] != "a.com" || p.AllowedHosts[1] != "b.com" {
		t.Errorf("白名单解析异常: %#v", p.AllowedHosts)
	}
	if p := FromEnv(func(string) string { return "" }); p.AllowPrivate || len(p.AllowedHosts) != 0 {
		t.Error("无环境变量时应为安全默认（拒绝私网、无白名单）")
	}
}
