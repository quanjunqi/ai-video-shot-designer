package httpapi

import (
	"context"
	"encoding/hex"
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
