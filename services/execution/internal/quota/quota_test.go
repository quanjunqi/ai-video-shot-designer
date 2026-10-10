package quota

import (
	"context"
	"errors"
	"testing"
	"time"
)

type fakeSpend struct {
	day, month float64
	err        error
	calls      int
}

func (f *fakeSpend) Spend(context.Context, string) (float64, float64, error) {
	f.calls++
	return f.day, f.month, f.err
}

// 固定时钟，便于确定性验证令牌桶补充。
type clock struct{ t time.Time }

func (c *clock) now() time.Time      { return c.t }
func (c *clock) adv(d time.Duration) { c.t = c.t.Add(d) }

func TestAllowQPS_TokenBucketRefillAndBurst(t *testing.T) {
	c := &clock{t: time.Unix(0, 0)}
	l := New(Config{QPS: 2, Burst: 3}, nil)
	l.SetClock(c.now)

	// 桶容量 3：前 3 次放行，第 4 次拒绝
	for i := 1; i <= 3; i++ {
		if d := l.Check(context.Background(), "ws1"); !d.Allowed {
			t.Fatalf("第 %d 次应放行，实际被拒: %s", i, d.Reason)
		}
	}
	d := l.Check(context.Background(), "ws1")
	if d.Allowed {
		t.Fatal("桶耗尽后应拒绝")
	}
	if d.Status != "rate_limited" {
		t.Fatalf("状态应为 rate_limited，实际 %q", d.Status)
	}
	// 0.5s × 2 QPS = 补 1 个令牌
	c.adv(500 * time.Millisecond)
	if d := l.Check(context.Background(), "ws1"); !d.Allowed {
		t.Fatalf("补充 1 个令牌后应放行: %s", d.Reason)
	}
	if d := l.Check(context.Background(), "ws1"); d.Allowed {
		t.Fatal("补充的令牌已被用掉，应再次拒绝")
	}
	// 长时间后不应超过桶容量
	c.adv(time.Hour)
	for i := 0; i < 3; i++ {
		if d := l.Check(context.Background(), "ws1"); !d.Allowed {
			t.Fatalf("长时间后第 %d 次应放行", i+1)
		}
	}
	if d := l.Check(context.Background(), "ws1"); d.Allowed {
		t.Fatal("不应超过桶容量 Burst=3")
	}
}

func TestAllowQPS_PerWorkspaceIsolation(t *testing.T) {
	c := &clock{t: time.Unix(0, 0)}
	l := New(Config{QPS: 1, Burst: 1}, nil)
	l.SetClock(c.now)
	if d := l.Check(context.Background(), "wsA"); !d.Allowed {
		t.Fatal("wsA 首次应放行")
	}
	if d := l.Check(context.Background(), "wsA"); d.Allowed {
		t.Fatal("wsA 第二次应拒绝")
	}
	// 另一个租户不受影响 —— 限流必须按租户隔离
	if d := l.Check(context.Background(), "wsB"); !d.Allowed {
		t.Fatal("wsB 不应受影响")
	}
}

func TestQPS_DisabledWhenZeroOrNegative(t *testing.T) {
	for _, q := range []float64{0, -1} {
		l := New(Config{QPS: q, Burst: 1}, nil)
		for i := 0; i < 100; i++ {
			if d := l.Check(context.Background(), "ws"); !d.Allowed {
				t.Fatalf("QPS=%v 应不限流，第 %d 次被拒", q, i+1)
			}
		}
	}
}

func TestCheckCost_DailyLimit(t *testing.T) {
	l := New(Config{DailyCostLimit: 10}, &fakeSpend{day: 9.99, month: 9.99})
	if d := l.Check(context.Background(), "ws"); !d.Allowed {
		t.Fatalf("未达上限应放行: %s", d.Reason)
	}
	l2 := New(Config{DailyCostLimit: 10}, &fakeSpend{day: 10, month: 10})
	d := l2.Check(context.Background(), "ws")
	if d.Allowed {
		t.Fatal("达到当日上限应拒绝")
	}
	if d.Status != "quota_exceeded" {
		t.Fatalf("状态应为 quota_exceeded，实际 %q", d.Status)
	}
}

func TestCheckCost_MonthlyLimit(t *testing.T) {
	l := New(Config{MonthlyCostLimit: 100}, &fakeSpend{day: 1, month: 100})
	if d := l.Check(context.Background(), "ws"); d.Allowed {
		t.Fatal("达到当月上限应拒绝")
	}
}

func TestCheckCost_NoLimitConfiguredSkipsProvider(t *testing.T) {
	f := &fakeSpend{day: 1e9, month: 1e9}
	l := New(Config{}, f) // 不设任何成本上限
	if d := l.Check(context.Background(), "ws"); !d.Allowed {
		t.Fatal("未配置上限时不应拦截")
	}
	if f.calls != 0 {
		t.Fatalf("未配置上限时不应查询花费，实际查询 %d 次", f.calls)
	}
}

func TestCheckCost_FailsOpenOnProviderError(t *testing.T) {
	l := New(Config{DailyCostLimit: 1}, &fakeSpend{err: errors.New("db down")})
	if d := l.Check(context.Background(), "ws"); !d.Allowed {
		t.Fatal("聚合失败时应 fail-open（放行），避免因监控故障拒绝全部请求")
	}
}

func TestCheckCost_SpendCacheAvoidsRepeatedQueries(t *testing.T) {
	c := &clock{t: time.Unix(0, 0)}
	f := &fakeSpend{day: 1}
	l := New(Config{DailyCostLimit: 100, SpendCacheTTL: 30 * time.Second}, f)
	l.SetClock(c.now)
	for i := 0; i < 5; i++ {
		l.Check(context.Background(), "ws")
	}
	if f.calls != 1 {
		t.Fatalf("TTL 内应只查询 1 次，实际 %d 次", f.calls)
	}
	c.adv(31 * time.Second)
	l.Check(context.Background(), "ws")
	if f.calls != 2 {
		t.Fatalf("TTL 过后应重新查询，实际 %d 次", f.calls)
	}
}

func TestCheck_QPSBeforeCost(t *testing.T) {
	c := &clock{t: time.Unix(0, 0)}
	f := &fakeSpend{day: 0} // 低于上限，确保第一次不是被成本拒绝
	l := New(Config{QPS: 1, Burst: 1, DailyCostLimit: 1}, f)
	l.SetClock(c.now)
	if d := l.Check(context.Background(), "ws"); !d.Allowed {
		t.Fatalf("第一次应放行，实际被拒: %s", d.Reason)
	}
	f.calls = 0 // 只观察「被限流的那一次」是否还去查花费
	d := l.Check(context.Background(), "ws")
	if d.Status != "rate_limited" {
		t.Fatalf("应先命中限流，实际 %q", d.Status)
	}
	if f.calls != 0 {
		t.Fatalf("限流命中时不应再查花费（限流应先于成本判定），实际 %d 次", f.calls)
	}
}

func TestFromEnv(t *testing.T) {
	env := map[string]string{
		"EXECUTION_RATE_LIMIT_QPS":     "5",
		"EXECUTION_RATE_LIMIT_BURST":   "20",
		"EXECUTION_DAILY_COST_LIMIT":   "100.5",
		"EXECUTION_MONTHLY_COST_LIMIT": "2000",
	}
	c := FromEnv(func(k string) string { return env[k] })
	if c.QPS != 5 || c.Burst != 20 || c.DailyCostLimit != 100.5 || c.MonthlyCostLimit != 2000 {
		t.Fatalf("解析异常: %+v", c)
	}
	// 显式 0 关闭限流
	c0 := FromEnv(func(k string) string {
		if k == "EXECUTION_RATE_LIMIT_QPS" {
			return "0"
		}
		return ""
	})
	if c0.QPS != 0 {
		t.Fatalf("显式 0 应关闭限流，实际 QPS=%v", c0.QPS)
	}
	// 空环境取默认（宽松 QPS、不限制成本）
	cd := FromEnv(func(string) string { return "" })
	if cd.QPS != DefaultConfig().QPS || cd.DailyCostLimit != 0 {
		t.Fatalf("默认值异常: %+v", cd)
	}
}
