package engine

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"shotdesigner/shared/netguard"
)

const testAPIKey = "test-key"

// TestNewExecutorFactory 校验 ExecutorFactory 按渠道类型分发：
// api 返回可用执行器；ComfyUI 两类尚未实现；未知类型报错。
func TestNewExecutorFactory(t *testing.T) {
	cases := []struct {
		name     string
		typ      ExecutorType
		wantType ExecutorType
		wantErr  error
	}{
		{"api 已实现", ExecutorTypeAPI, ExecutorTypeAPI, nil},
		{"comfyui-local 待实现", ExecutorTypeComfyUILocal, "", ErrExecutorNotImplemented},
		{"comfyui-cloud 待实现", ExecutorTypeComfyUICloud, "", ErrExecutorNotImplemented},
		{"未知类型", ExecutorType("no-such-backend"), "", ErrUnknownExecutorType},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			exec, err := NewExecutor(ExecutorConfig{Type: tc.typ})
			if tc.wantErr != nil {
				if !errors.Is(err, tc.wantErr) {
					t.Fatalf("err = %v, want %v", err, tc.wantErr)
				}
				if exec != nil {
					t.Fatalf("executor = %v, want nil", exec)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected err: %v", err)
			}
			if exec.Type() != tc.wantType {
				t.Fatalf("type = %v, want %v", exec.Type(), tc.wantType)
			}
		})
	}
}

// TestNewAPIConnectorNilClient 校验未注入 HTTPClient 时回落到默认客户端而非 panic。
func TestNewAPIConnectorNilClient(t *testing.T) {
	c := NewAPIConnector(ExecutorConfig{Type: ExecutorTypeAPI})
	if c == nil {
		t.Fatal("nil connector")
	}
	conn, ok := c.(*apiConnector)
	if !ok {
		t.Fatalf("type = %T, want *apiConnector", c)
	}
	if conn.client == nil {
		t.Fatal("http client should fall back to default, got nil")
	}
	if conn.Type() != ExecutorTypeAPI {
		t.Fatalf("type = %v, want api", conn.Type())
	}
}

// TestBuildRunRequest 校验 ExecutorRequest → RunRequest 的翻译规则：
// Input 与 Parameters 合并进 Runtime，ModelRequestPath 注入 __request_path。
func TestBuildRunRequest(t *testing.T) {
	got := buildRunRequest(ExecutorRequest{
		ChannelID:        "ch-1",
		ProviderModel:    "provider-model-1",
		ModelRequestPath: "/v1/models/x/generate",
		Input:            map[string]any{"prompt": "一只猫", "reference_images": []any{"u"}},
		Parameters:       map[string]any{"aspect_ratio": "9:16"},
		ModelParams:      []Param{{Key: "seed", Value: "7"}},
	})
	if got.ChannelID != "ch-1" || got.ProviderModel != "provider-model-1" {
		t.Fatalf("identity fields not mapped: %+v", got)
	}
	if got.ModelRequestPath != "/v1/models/x/generate" {
		t.Fatalf("ModelRequestPath = %q", got.ModelRequestPath)
	}
	if got.Runtime["prompt"] != "一只猫" {
		t.Fatalf("Input not merged into Runtime: %v", got.Runtime)
	}
	if got.Runtime["aspect_ratio"] != "9:16" {
		t.Fatalf("Parameters not merged into Runtime: %v", got.Runtime)
	}
	if got.Runtime["__request_path"] != "/v1/models/x/generate" {
		t.Fatalf("__request_path not injected: %v", got.Runtime)
	}
	if len(got.ModelParams) != 1 || got.ModelParams[0].Key != "seed" {
		t.Fatalf("ModelParams not mapped: %+v", got.ModelParams)
	}
}

// TestBuildRunRequestNoPath 校验未声明路径时不写入 __request_path（沿用模板默认）。
func TestBuildRunRequestNoPath(t *testing.T) {
	got := buildRunRequest(ExecutorRequest{Input: map[string]any{"prompt": "x"}})
	if _, has := got.Runtime["__request_path"]; has {
		t.Fatalf("__request_path should be absent: %v", got.Runtime)
	}
}

// TestExtractTaskID 校验任务 ID 提取遵循模板声明，缺省回落到 task_id。
func TestExtractTaskID(t *testing.T) {
	cases := []struct {
		name      string
		extracted map[string]any
		async     string
		want      string
	}{
		{"模板声明字段", map[string]any{"jobId": "j-9"}, `{"taskIdField":"jobId"}`, "j-9"},
		{"缺省 task_id", map[string]any{"task_id": "t-9"}, `{"enabled":true}`, "t-9"},
		{"无 async 配置", map[string]any{"task_id": "t-8"}, "", "t-8"},
		{"字段缺失", map[string]any{"other": "x"}, `{"taskIdField":"jobId"}`, ""},
		{"非字符串值", map[string]any{"task_id": 42}, `{"taskIdField":"task_id"}`, ""},
		{"nil 提取结果", nil, `{"taskIdField":"task_id"}`, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tmpl := Template{}
			if tc.async != "" {
				tmpl.Async = json.RawMessage(tc.async)
			}
			if got := extractTaskID(tc.extracted, tmpl); got != tc.want {
				t.Fatalf("extractTaskID = %q, want %q", got, tc.want)
			}
		})
	}
}

// TestSubmit_SSRFGuardBlocksLoopbackUpstream 证明 SSRF 防护作用于**真实调用路径**：
// 渠道凭据里的 base_url 指向环回地址时，请求在建立连接之前被拦下，
// 上游（用 httptest 模拟内网服务）**根本收不到请求**。
//
// 这比只测 netguard.CheckIP 更有价值：它证明防护确实挂在了引擎的出站 client 上，
// 而不是一个没人调用的工具函数。
func TestSubmit_SSRFGuardBlocksLoopbackUpstream(t *testing.T) {
	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&hits, 1)
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"leaked"}}]}`))
	}))
	defer srv.Close()

	execReq := ExecutorRequest{
		ProviderModel: "provider-model-1",
		Input:         map[string]any{"prompt": "x"},
		ProtocolTemplate: Template{
			Label:       "ssrf-probe",
			Method:      http.MethodPost,
			RequestPath: "/v1/chat/completions",
			Params: []Param{
				{Key: "model", Role: "model"},
				{Key: "prompt", Role: "runtime"},
			},
			ResponseParams: []Param{{Key: "choices.0.message.content", Type: "string"}},
		},
	}
	cfg := ExecutorConfig{
		Type:        ExecutorTypeAPI,
		Credentials: Credentials{BaseURL: srv.URL, AuthType: "bearer", APIKey: testAPIKey},
	}

	// ① 默认策略（拒绝私网/环回）：必须被拦下，且上游零命中
	cfg.HTTPClient = netguard.Policy{}.NewClient(5 * time.Second)
	if _, err := NewAPIConnector(cfg).Submit(context.Background(), execReq); err == nil {
		t.Fatal("默认策略下对环回上游的调用应被拒绝，但成功了")
	} else if !strings.Contains(err.Error(), "netguard") {
		t.Fatalf("错误应来自 netguard，实际: %v", err)
	}
	if n := atomic.LoadInt32(&hits); n != 0 {
		t.Fatalf("上游不应被访问，但命中了 %d 次", n)
	}

	// ② 显式放开私网（本地开发场景）：同一调用必须成功 —— 证明防护不误伤本地 provider
	cfg.HTTPClient = netguard.Policy{AllowPrivate: true}.NewClient(5 * time.Second)
	res, err := NewAPIConnector(cfg).Submit(context.Background(), execReq)
	if err != nil {
		t.Fatalf("AllowPrivate 下应成功，实际: %v", err)
	}
	if res.Status != TaskStatusSucceeded {
		t.Fatalf("status = %v, want succeeded", res.Status)
	}
	if got := res.Extracted["choices.0.message.content"]; got != "leaked" {
		t.Fatalf("提取结果异常: %v", got)
	}
	if n := atomic.LoadInt32(&hits); n != 1 {
		t.Fatalf("上游应被访问 1 次，实际 %d 次", n)
	}
}
