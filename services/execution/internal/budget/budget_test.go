package budget

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"testing"
)

type fakeRules struct {
	rules []Rule
	err   error
}

func (f fakeRules) EffectiveRules(context.Context, string) ([]Rule, error) { return f.rules, f.err }

type fakeSpend struct {
	day, month float64
	err        error
}

func (f fakeSpend) Spend(context.Context, string) (float64, float64, error) {
	return f.day, f.month, f.err
}

func newTestChecker(rules []Rule, day, month float64, rulesErr, spendErr error) *Checker {
	return NewChecker(fakeRules{rules: rules, err: rulesErr}, fakeSpend{day: day, month: month, err: spendErr}, slog.New(slog.NewTextHandler(discard{}, nil)))
}

type discard struct{}

func (discard) Write(p []byte) (int, error) { return len(p), nil }

func TestCheck_NoRules_Allow(t *testing.T) {
	c := newTestChecker(nil, 0, 0, nil, nil)
	d := c.Check(context.Background(), "ws1", Used{})
	if !d.Allowed || d.Status != "budget_ok" {
		t.Fatalf("无规则应放行，实际 %+v", d)
	}
}

func TestCheck_BlockOverLimit_Day(t *testing.T) {
	rules := []Rule{{Scope: "workspace", Period: "day", LimitAmount: 100, Action: "block", WarnAt: 0.8}}
	c := newTestChecker(rules, 110, 110, nil, nil) // 已用 110 > 上限 100
	d := c.Check(context.Background(), "ws1", Used{})
	if d.Allowed {
		t.Fatal("超日预算应拦截")
	}
	if d.Status != "budget_blocked" {
		t.Fatalf("状态应为 budget_blocked，实际 %q", d.Status)
	}
	if d.WarnLevel != "" {
		t.Fatalf("超限拦截不应带 warn 级别，实际 %q", d.WarnLevel)
	}
}

func TestCheck_ThresholdWarn_80(t *testing.T) {
	rules := []Rule{{Scope: "workspace", Period: "day", LimitAmount: 100, Action: "block", WarnAt: 0.8}}
	c := newTestChecker(rules, 85, 85, nil, nil) // 85% ≥ 80% 但 <100%
	d := c.Check(context.Background(), "ws1", Used{})
	if !d.Allowed {
		t.Fatalf("未超限应放行，实际 %+v", d)
	}
	if d.Status != "budget_warn" || d.WarnLevel != "warn" {
		t.Fatalf("达 80%% 应常规告警，实际 status=%q warn=%q", d.Status, d.WarnLevel)
	}
}

func TestCheck_ThresholdWarn_95(t *testing.T) {
	rules := []Rule{{Scope: "workspace", Period: "month", LimitAmount: 1000, Action: "warn", WarnAt: 0.8}}
	c := newTestChecker(rules, 0, 960, nil, nil) // 96% ≥ 95%
	d := c.Check(context.Background(), "ws1", Used{})
	if !d.Allowed {
		t.Fatalf("warn 动作不拦截，实际 %+v", d)
	}
	if d.Status != "budget_warn_critical" || d.WarnLevel != "critical" {
		t.Fatalf("达 95%% 应严重告警，实际 status=%q warn=%q", d.Status, d.WarnLevel)
	}
}

func TestCheck_WorkspaceOverridesTenant(t *testing.T) {
	// 租户级 day 上限 100（block），工作区级 day 上限 1000（warn）→ 工作区级优先，不拦截
	rules := []Rule{
		{Scope: "tenant", Period: "day", LimitAmount: 100, Action: "block", WarnAt: 0.8},
		{Scope: "workspace", Period: "day", LimitAmount: 1000, Action: "warn", WarnAt: 0.8},
	}
	c := newTestChecker(rules, 300, 300, nil, nil)
	d := c.Check(context.Background(), "ws1", Used{})
	if !d.Allowed {
		t.Fatalf("工作区级 warn 优先应放行，实际 %+v", d)
	}
}

func TestCheck_UsedIncludesHolds(t *testing.T) {
	// 已用 90 + 预扣 20 = 110 > 100 → 拦截（预扣即封顶）
	rules := []Rule{{Scope: "workspace", Period: "day", LimitAmount: 100, Action: "block", WarnAt: 0.8}}
	c := newTestChecker(rules, 90, 90, nil, nil)
	d := c.Check(context.Background(), "ws1", Used{Day: 20, Month: 20})
	if d.Allowed {
		t.Fatalf("预扣叠加后超限应拦截，实际 %+v", d)
	}
}

func TestCheck_FailOpen_OnRulesError(t *testing.T) {
	c := newTestChecker(nil, 0, 0, errors.New("db down"), nil)
	d := c.Check(context.Background(), "ws1", Used{})
	if !d.Allowed || !d.FailOpen || d.Status != "budget_unchecked" {
		t.Fatalf("规则读取故障应 fail-open 放行并标记，实际 %+v", d)
	}
}

func TestCheck_FailOpen_OnSpendError(t *testing.T) {
	rules := []Rule{{Scope: "workspace", Period: "day", LimitAmount: 100, Action: "block", WarnAt: 0.8}}
	c := newTestChecker(rules, 0, 0, nil, errors.New("spend agg down"))
	d := c.Check(context.Background(), "ws1", Used{})
	if !d.Allowed || !d.FailOpen {
		t.Fatalf("花费聚合故障应 fail-open 放行并标记，实际 %+v", d)
	}
}

// fakeHolds 是 HoldsStore 的内存实现，用于状态机三态断言。
type fakeHolds struct {
	mu   sync.Mutex
	rows map[string]HoldRecord
}

func newFakeHolds() *fakeHolds { return &fakeHolds{rows: map[string]HoldRecord{}} }

func (f *fakeHolds) Hold(_ context.Context, h HoldRecord) (HoldRecord, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if existing, ok := f.rows[h.JobID]; ok {
		return existing, nil // 幂等
	}
	if h.ID == "" {
		h.ID = "h_" + h.JobID
	}
	h.Status = StatusPending
	f.rows[h.JobID] = h
	return h, nil
}

func (f *fakeHolds) Settle(_ context.Context, id string, actual float64) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for jobID, r := range f.rows {
		if r.ID == id && r.Status == StatusPending {
			r.Status = StatusSettled
			r.ActualAmount = actual
			r.RefundAmount = r.HoldAmount - actual
			f.rows[jobID] = r
			return true, nil
		}
	}
	return false, nil
}

func (f *fakeHolds) Release(_ context.Context, id string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for jobID, r := range f.rows {
		if r.ID == id && r.Status == StatusPending {
			r.Status = StatusReleased
			r.RefundAmount = r.HoldAmount
			f.rows[jobID] = r
			return true, nil
		}
	}
	return false, nil
}

func (f *fakeHolds) Outstanding(_ context.Context, _ string) (float64, float64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var day, month float64
	for _, r := range f.rows {
		if r.Status == StatusPending {
			day += r.HoldAmount
			month += r.HoldAmount
		}
	}
	return day, month, nil
}

func (f *fakeHolds) get(jobID string) (HoldRecord, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	r, ok := f.rows[jobID]
	return r, ok
}

// TestHoldSettleRelease_StateMachine 三态断言：预扣 → 结算退差额 / 退扣。
func TestHoldSettleRelease_StateMachine(t *testing.T) {
	f := newFakeHolds()
	ctx := context.Background()

	// 预扣（估算上限 10）
	h, err := f.Hold(ctx, HoldRecord{JobID: "job1", WorkspaceID: "ws1", Period: "day", HoldAmount: 10})
	if err != nil {
		t.Fatal(err)
	}
	if h.Status != StatusPending {
		t.Fatalf("预扣后应为 pending，实际 %q", h.Status)
	}

	// 成功结算：实际 4，退差额 6
	updated, err := f.Settle(ctx, h.ID, 4)
	if err != nil || !updated {
		t.Fatalf("结算应成功，updated=%v err=%v", updated, err)
	}
	got, _ := f.get("job1")
	if got.Status != StatusSettled || got.ActualAmount != 4 || got.RefundAmount != 6 {
		t.Fatalf("结算状态错误: %+v", got)
	}

	// 重复结算幂等（已非 pending，不再更新）
	updated2, _ := f.Settle(ctx, h.ID, 99)
	if updated2 {
		t.Fatal("已结算行不应再次更新")
	}

	// 第二个任务：预扣 5 → 退扣全部
	h2, _ := f.Hold(ctx, HoldRecord{JobID: "job2", WorkspaceID: "ws1", Period: "day", HoldAmount: 5})
	released, err := f.Release(ctx, h2.ID)
	if err != nil || !released {
		t.Fatalf("退扣应成功，released=%v err=%v", released, err)
	}
	got2, _ := f.get("job2")
	if got2.Status != StatusReleased || got2.RefundAmount != 5 {
		t.Fatalf("退扣状态错误: %+v", got2)
	}

	// 退扣后 Outstanding 不再计入
	day, month, _ := f.Outstanding(ctx, "ws1")
	if day != 0 || month != 0 {
		t.Fatalf("结算+退扣后无未结算预扣，实际 day=%v month=%v", day, month)
	}
}

// TestHold_IdempotentOnSameJob 同任务重复预扣幂等（唯一键 job_id）。
func TestHold_IdempotentOnSameJob(t *testing.T) {
	f := newFakeHolds()
	ctx := context.Background()
	h1, _ := f.Hold(ctx, HoldRecord{JobID: "job1", WorkspaceID: "ws1", Period: "day", HoldAmount: 10})
	h2, _ := f.Hold(ctx, HoldRecord{JobID: "job1", WorkspaceID: "ws1", Period: "day", HoldAmount: 99})
	if h1.ID != h2.ID {
		t.Fatalf("同任务预扣应幂等返回同一行，实际 %s vs %s", h1.ID, h2.ID)
	}
	got, _ := f.get("job1")
	if got.HoldAmount != 10 {
		t.Fatalf("幂等不应覆盖原预扣金额，实际 %v", got.HoldAmount)
	}
}
