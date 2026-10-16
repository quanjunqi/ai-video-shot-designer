package httpapi

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"shotdesigner/services/execution/internal/audit"
	"shotdesigner/services/execution/internal/catalog"
	"shotdesigner/services/execution/internal/creds"
)

// TestGenerateUnknownModelWritesAuditRow 锁定 TASK-AUDIT-001 D1 判据①：
// 造一个未知 modelId 的 /v1/generate 请求 → 审计行 +1（改动前该失败分支不写审计，增量为 0）。
// 顺带断言失败行的内容：status=failed、error_message 含 "model not found"、request_id 非空。
func TestGenerateUnknownModelWritesAuditRow(t *testing.T) {
	pool := healthTestPool(t) // EXECUTION_TEST_DATABASE_URL 未设置时 Skip
	ctx := context.Background()

	// 模拟 production 目录服务：空目录 ⇒ catalog.Resolve 必失败（MODEL_NOT_FOUND）。
	dirSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/internal/v1/catalog" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"models":[],"templates":[],"channels":[]}`))
	}))
	t.Cleanup(dirSrv.Close)

	h := Handler{
		Token:        "test-token",
		Catalog:      catalog.NewClient(dirSrv.URL, "test-token"),
		Creds:        &creds.Client{},
		EngineClient: &http.Client{Timeout: 5 * time.Second},
		AuditStore:   &audit.Store{Pool: pool},
	}

	ws := "ws-d1-" + hex.EncodeToString(randBytesH(t))
	req := httptest.NewRequest(http.MethodPost, "/v1/generate",
		strings.NewReader(`{"modelId":"no-such-model","parameters":{}}`))
	req.Header.Set("Authorization", "Bearer test-token")
	req.Header.Set("X-Workspace-Id", ws)
	req.Header.Set("X-Actor-Id", "actor-d1")
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404 MODEL_NOT_FOUND, got %d body=%s", rec.Code, rec.Body.String())
	}

	var n int
	if err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM gateway_audit_logs WHERE workspace_id=$1`, ws).Scan(&n); err != nil {
		t.Fatalf("count audit rows: %v", err)
	}
	if n != 1 {
		t.Fatalf("D1判据①: 未知 modelId 应写 1 条审计（改动前 +0），got %d", n)
	}

	var status, errMsg, requestID string
	if err := pool.QueryRow(ctx,
		`SELECT status, error_message, request_id FROM gateway_audit_logs WHERE workspace_id=$1`, ws).
		Scan(&status, &errMsg, &requestID); err != nil {
		t.Fatalf("read audit row: %v", err)
	}
	if status != "failed" || !strings.Contains(errMsg, "model not found") || requestID == "" {
		t.Fatalf("失败审计行内容不符: status=%q errMsg=%q requestID=%q", status, errMsg, requestID)
	}
}

// TestGenerateModeCapabilityFilter 锁定 TASK-MODEL-006 判据 6 的**接线层面**断言
// （解析器本身的过滤语义在 internal/catalog/resolve_mode_test.go）：
// /v1/generate 必须把请求的 mode 真的传进 catalog.ResolveFor。
//
// 两个子用例用**同一份目录**（唯一候选显式声明 capability.modes=["first-frame"]），
// 靠结果区分"过滤真的发生了"：
//   - mode=text-to-video（声明里没有）⇒ 候选被剔除 ⇒ 422 INVALID_GENERATE，message 带该 mode
//   - mode=first-frame（声明里有）  ⇒ 候选保留 ⇒ 继续走 ⇒ 422 MODEL_NO_PROTOCOL（该候选没有协议模板）
//
// 为什么拿 MODEL_NO_PROTOCOL 当"通过过滤"的信号：它只可能在候选**存活**之后出现，
// 且不需要 engine/creds 参与 —— 不会把与本卡无关的链路牵进来。
func TestGenerateModeCapabilityFilter(t *testing.T) {
	pool := healthTestPool(t) // EXECUTION_TEST_DATABASE_URL 未设置时 Skip
	ctx := context.Background()

	dirSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/internal/v1/catalog" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"models":[{"id":"cand-a","channelId":"ch1","logicalModelId":"lm-mode-gate",` +
			`"status":"enabled","routePriority":10,"capability":{"modes":["first-frame"]}}],"templates":[],"channels":[]}`))
	}))
	t.Cleanup(dirSrv.Close)

	h := Handler{
		Token:        "test-token",
		Catalog:      catalog.NewClient(dirSrv.URL, "test-token"),
		Creds:        &creds.Client{},
		EngineClient: &http.Client{Timeout: 5 * time.Second},
		AuditStore:   &audit.Store{Pool: pool},
	}

	cases := []struct {
		name     string
		mode     string
		wantCode string
	}{
		{"候选未声明该 mode ⇒ 被剔除", "text-to-video", "INVALID_GENERATE"},
		{"候选声明了该 mode ⇒ 保留（继续走到模板检查）", "first-frame", "MODEL_NO_PROTOCOL"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ws := "ws-mode-" + hex.EncodeToString(randBytesH(t))
			body := fmt.Sprintf(`{"modelId":"lm-mode-gate","mode":%q,"parameters":{}}`, tc.mode)
			req := httptest.NewRequest(http.MethodPost, "/v1/generate", strings.NewReader(body))
			req.Header.Set("Authorization", "Bearer test-token")
			req.Header.Set("X-Workspace-Id", ws)
			req.Header.Set("X-Actor-Id", "actor-mode")
			rec := httptest.NewRecorder()
			h.Routes().ServeHTTP(rec, req)

			if rec.Code != http.StatusUnprocessableEntity {
				t.Fatalf("want 422, got %d body=%s", rec.Code, rec.Body.String())
			}
			var got map[string]string
			if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
				t.Fatalf("响应体不是 {code,message}: %v (%s)", err, rec.Body.String())
			}
			if got["code"] != tc.wantCode {
				t.Fatalf("want code %s, got %q (body=%s)", tc.wantCode, got["code"], rec.Body.String())
			}
			// "没有候选支持该 mode"必须自己说清楚是哪个 mode（排障不必回放请求）
			if tc.wantCode == "INVALID_GENERATE" && !strings.Contains(got["message"], tc.mode) {
				t.Fatalf("错误信息必须带请求的 mode，实际 %q", got["message"])
			}
			// D1：失败分支必须留痕（含 mode），且只写 1 行
			var n int
			if err := pool.QueryRow(ctx,
				`SELECT COUNT(*) FROM gateway_audit_logs WHERE workspace_id=$1`, ws).Scan(&n); err != nil {
				t.Fatalf("count audit rows: %v", err)
			}
			if n != 1 {
				t.Fatalf("该失败分支应写 1 条审计，got %d", n)
			}
			var auditedMode string
			if err := pool.QueryRow(ctx,
				`SELECT mode FROM gateway_audit_logs WHERE workspace_id=$1`, ws).Scan(&auditedMode); err != nil {
				t.Fatalf("read audit mode: %v", err)
			}
			if auditedMode != tc.mode {
				t.Fatalf("审计行必须记录请求的 mode：want %q got %q", tc.mode, auditedMode)
			}
		})
	}
}
