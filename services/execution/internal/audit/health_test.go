package audit

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"testing"
	"time"
)

// randSuffix 生成随机字节后缀（保证多测试互不干扰）。
func randSuffix(t *testing.T) []byte {
	t.Helper()
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		t.Fatal(err)
	}
	return b
}

// 造一条审计行（status_code 走 017 新列；失败桶口径与 breaker 表 3-1 一致）。
func insertAuditRow(t *testing.T, ctx context.Context, st Store, ws, reqID, channel, model, status string, code *int, createdAt time.Time) {
	t.Helper()
	_, err := st.Pool.Exec(ctx, `
		INSERT INTO gateway_audit_logs
			(request_id, workspace_id, project_id, model_id, channel_id, provider_model, mode, status, status_code, created_at)
		VALUES ($1, $2, 'p', $3, $4, $5, 'text-chat', $6, $7, $8)`,
		reqID, ws, model, channel, model, status, code, createdAt)
	if err != nil {
		t.Fatalf("insert audit row: %v", err)
	}
}

func TestHealthByUnit(t *testing.T) {
	st := testStore(t)
	ctx := context.Background()
	ws := "ws-health-" + hex.EncodeToString(randSuffix(t))
	now := time.Now()
	code := func(c int) *int { return &c }

	// 单元 A（ch-a/gpt-4o）：4 次 = 2 成功 + 503 + network(0)
	for i, r := range []struct {
		status string
		code   *int
	}{
		{"success", code(200)},
		{"success", code(200)},
		{"failed", code(503)},
		{"failed", code(0)},
	} {
		insertAuditRow(t, ctx, st, ws, fmt.Sprintf("a-%d-%d", i, *r.code), "ch-a", "gpt-4o", r.status, r.code, now)
	}
	// 单元 B（ch-b/gpt-4o）：3 次 = 1 成功 + 429(soft_4xx) + 400(hard_4xx)
	for _, r := range []struct {
		status string
		code   *int
	}{
		{"success", code(200)},
		{"rate_limited", code(429)},
		{"failed", code(400)},
	} {
		insertAuditRow(t, ctx, st, ws, fmt.Sprintf("b-%s", r.status), "ch-b", "gpt-4o", r.status, r.code, now)
	}
	// 单元 C（ch-c/deepseek）：冷却中（cooldown_until 未来）
	insertAuditRow(t, ctx, st, ws, "c-1", "ch-c", "deepseek", "failed", code(503), now)
	if _, err := st.Pool.Exec(ctx, `
		INSERT INTO channel_health (channel_id, provider_model, fail_count, cooldown_until)
		VALUES ('ch-c', 'deepseek', 5, now() + interval '10 minutes')`); err != nil {
		t.Fatalf("seed cooling health: %v", err)
	}
	// 单元 D（ch-d/deepseek）：半开探活（cooldown_until 过去 + probe_owner 占位）
	insertAuditRow(t, ctx, st, ws, "d-1", "ch-d", "deepseek", "success", code(200), now)
	if _, err := st.Pool.Exec(ctx, `
		INSERT INTO channel_health (channel_id, provider_model, fail_count, cooldown_until, probe_owner)
		VALUES ('ch-d', 'deepseek', 2, now() - interval '5 minutes', 'probe-inst-1')`); err != nil {
		t.Fatalf("seed half-open health: %v", err)
	}
	// 单元 E（ch-e/deepseek）：正常（无健康行）
	insertAuditRow(t, ctx, st, ws, "e-1", "ch-e", "deepseek", "success", code(200), now)

	units, err := st.HealthByUnit(ctx, ws, nil, nil, 100)
	if err != nil {
		t.Fatalf("HealthByUnit: %v", err)
	}
	if len(units) != 5 {
		t.Fatalf("expected 5 units, got %d: %+v", len(units), units)
	}
	byKey := map[string]UnitHealth{}
	for _, u := range units {
		byKey[u.ChannelID+"/"+u.ProviderModel] = u
	}

	a := byKey["ch-a/gpt-4o"]
	if a.Calls != 4 || a.SuccessCalls != 2 || a.FailedCalls != 2 {
		t.Fatalf("unit A counts = %d/%d/%d, want 4/2/2", a.Calls, a.SuccessCalls, a.FailedCalls)
	}
	if a.ErrorCodes["server_5xx"] != 1 || a.ErrorCodes["network"] != 1 || a.ErrorCodes["other"] != 0 {
		t.Fatalf("unit A error codes = %v, want server_5xx=1 network=1", a.ErrorCodes)
	}
	if a.BreakerState != "normal" {
		t.Fatalf("unit A breaker state = %q, want normal", a.BreakerState)
	}

	b := byKey["ch-b/gpt-4o"]
	if b.Calls != 3 || b.SuccessCalls != 1 || b.FailedCalls != 2 {
		t.Fatalf("unit B counts = %d/%d/%d, want 3/1/2", b.Calls, b.SuccessCalls, b.FailedCalls)
	}
	if b.ErrorCodes["soft_4xx"] != 1 || b.ErrorCodes["hard_4xx"] != 1 {
		t.Fatalf("unit B error codes = %v, want soft_4xx=1 hard_4xx=1", b.ErrorCodes)
	}

	c := byKey["ch-c/deepseek"]
	if !c.Cooling || c.BreakerState != "cooling" || c.FailCount != 5 {
		t.Fatalf("unit C breaker = cooling=%v state=%q fail=%d, want cooling=true cooling/5",
			c.Cooling, c.BreakerState, c.FailCount)
	}

	d := byKey["ch-d/deepseek"]
	if d.BreakerState != "half_open" || d.ProbeOwner == nil || *d.ProbeOwner != "probe-inst-1" {
		t.Fatalf("unit D breaker = state=%q owner=%v, want half_open/probe-inst-1", d.BreakerState, d.ProbeOwner)
	}

	e := byKey["ch-e/deepseek"]
	if e.BreakerState != "normal" || e.FailCount != 0 {
		t.Fatalf("unit E breaker = state=%q fail=%d, want normal/0", e.BreakerState, e.FailCount)
	}

	// 排序断言：调用量降序（A=4 应排第一）
	if units[0].ChannelID != "ch-a" {
		t.Fatalf("expected ch-a first (most calls), got %s", units[0].ChannelID)
	}

	// 过滤断言：since=未来 → 空集（不报错）
	future := now.Add(time.Hour)
	empty, err := st.HealthByUnit(ctx, ws, &future, nil, 100)
	if err != nil {
		t.Fatalf("HealthByUnit future since: %v", err)
	}
	if len(empty) != 0 {
		t.Fatalf("expected empty for future since, got %d units", len(empty))
	}

	// 空 workspace → 空集
	emptyWS, err := st.HealthByUnit(ctx, "ws-nothing", nil, nil, 100)
	if err != nil {
		t.Fatalf("HealthByUnit empty ws: %v", err)
	}
	if len(emptyWS) != 0 {
		t.Fatalf("expected empty for unknown ws, got %d units", len(emptyWS))
	}
}
