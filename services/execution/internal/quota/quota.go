// Package quota 为模型网关提供「按 workspace 的限流与成本上限」。
//
// 为什么需要它（能力体检实测）：全仓库 ratelimit/quota/budget/throttle 零命中，
// gateway_audit_logs.cost_amount 只被写入、**从未被用于拦截**。
// 后果：单个用户或一次脚本错误即可无限刷上游付费模型，账单无上限 ——
// 这是「能上线但会烧钱」的组合。
//
// 设计：
//   - QPS 用**令牌桶**（按 workspace 分桶），允许突发但不允许持续高速；
//   - 成本用**日/月累计上限**，从 gateway_audit_logs 聚合，带短 TTL 缓存
//     （否则每个请求都要扫一次审计表）；
//   - 超限**拒绝**并返回可读原因，调用方据此写审计 —— 让「被限流/超预算」可查；
//   - 默认值保守：QPS 有一个宽松默认（挡失控循环），成本上限默认**不限制**
//     （额度属业务决策，需显式配置）。
package quota

import (
	"context"
	"fmt"
	"math"
	"strconv"
	"sync"
	"time"
)

// SpendProvider 提供某 workspace 的当日/当月累计花费。
type SpendProvider interface {
	Spend(ctx context.Context, workspace string) (day float64, month float64, err error)
}

// Config 是限流与成本上限配置。
type Config struct {
	QPS              float64       // 每秒补充令牌；<=0 表示不限流
	Burst            int           // 桶容量；<=0 时取 max(1, QPS)
	DailyCostLimit   float64       // <=0 表示不限制
	MonthlyCostLimit float64       // <=0 表示不限制
	SpendCacheTTL    time.Duration // 花费聚合缓存；<=0 取 30s
}

// DefaultConfig 返回保守默认：宽松 QPS、不设成本上限。
func DefaultConfig() Config {
	return Config{QPS: 50, Burst: 100, SpendCacheTTL: 30 * time.Second}
}

// Decision 是一次配额判定的结果。
type Decision struct {
	Allowed bool
	Reason  string // 人类可读；用于审计与 429 响应
	Status  string // 审计用的状态标记
}

type bucket struct {
	tokens float64
	last   time.Time
}

type spendEntry struct {
	day, month float64
	at         time.Time
	err        error
}

// Limiter 是并发安全的限流 + 成本上限判定器。
type Limiter struct {
	cfg   Config
	spend SpendProvider
	now   func() time.Time

	mu      sync.Mutex
	buckets map[string]*bucket
	cache   map[string]spendEntry
}

// New 构造 Limiter。spend 可为 nil（表示不做成本检查）。
func New(cfg Config, spend SpendProvider) *Limiter {
	d := DefaultConfig()
	if cfg.SpendCacheTTL <= 0 {
		cfg.SpendCacheTTL = d.SpendCacheTTL
	}
	if cfg.Burst <= 0 && cfg.QPS > 0 {
		cfg.Burst = int(math.Max(1, cfg.QPS))
	}
	return &Limiter{
		cfg:     cfg,
		spend:   spend,
		now:     time.Now,
		buckets: make(map[string]*bucket),
		cache:   make(map[string]spendEntry),
	}
}

// SetClock 仅用于测试注入时钟。
func (l *Limiter) SetClock(f func() time.Time) { l.now = f }

// Limits 返回当前生效的配置（供启动日志与运维确认）。
func (l *Limiter) Limits() Config { return l.cfg }

// Check 依次做限流与成本判定；返回第一个不通过的原因。
func (l *Limiter) Check(ctx context.Context, workspace string) Decision {
	if d := l.allowQPS(workspace); !d.Allowed {
		return d
	}
	return l.checkCost(ctx, workspace)
}

func (l *Limiter) allowQPS(workspace string) Decision {
	if l.cfg.QPS <= 0 || l.cfg.Burst <= 0 {
		return Decision{Allowed: true}
	}
	now := l.now()
	l.mu.Lock()
	defer l.mu.Unlock()
	b, ok := l.buckets[workspace]
	if !ok {
		b = &bucket{tokens: float64(l.cfg.Burst), last: now}
		l.buckets[workspace] = b
	}
	// 按经过时间补充令牌
	if elapsed := now.Sub(b.last).Seconds(); elapsed > 0 {
		b.tokens = math.Min(float64(l.cfg.Burst), b.tokens+elapsed*l.cfg.QPS)
		b.last = now
	}
	if b.tokens < 1 {
		return Decision{
			Allowed: false,
			Status:  "rate_limited",
			Reason:  fmt.Sprintf("超出速率限制（%.1f QPS，桶容量 %d），请稍后重试", l.cfg.QPS, l.cfg.Burst),
		}
	}
	b.tokens--
	return Decision{Allowed: true}
}

func (l *Limiter) checkCost(ctx context.Context, workspace string) Decision {
	needDay := l.cfg.DailyCostLimit > 0
	needMonth := l.cfg.MonthlyCostLimit > 0
	if l.spend == nil || (!needDay && !needMonth) {
		return Decision{Allowed: true}
	}
	day, month, err := l.cachedSpend(ctx, workspace)
	if err != nil {
		// 查不到花费时**放行**（fail-open）：拒绝全部请求的代价大于超支风险。
		// 但错误会由调用方记录，便于发现聚合异常。
		return Decision{Allowed: true}
	}
	if needDay && day >= l.cfg.DailyCostLimit {
		return Decision{
			Allowed: false, Status: "quota_exceeded",
			Reason: fmt.Sprintf("已达当日成本上限（已用 %.2f / 上限 %.2f）", day, l.cfg.DailyCostLimit),
		}
	}
	if needMonth && month >= l.cfg.MonthlyCostLimit {
		return Decision{
			Allowed: false, Status: "quota_exceeded",
			Reason: fmt.Sprintf("已达当月成本上限（已用 %.2f / 上限 %.2f）", month, l.cfg.MonthlyCostLimit),
		}
	}
	return Decision{Allowed: true}
}

func (l *Limiter) cachedSpend(ctx context.Context, workspace string) (float64, float64, error) {
	now := l.now()
	l.mu.Lock()
	if e, ok := l.cache[workspace]; ok && now.Sub(e.at) < l.cfg.SpendCacheTTL {
		l.mu.Unlock()
		return e.day, e.month, e.err
	}
	l.mu.Unlock()

	day, month, err := l.spend.Spend(ctx, workspace)

	l.mu.Lock()
	l.cache[workspace] = spendEntry{day: day, month: month, at: now, err: err}
	l.mu.Unlock()
	return day, month, err
}

// FromEnv 读取配置。空值=保持默认；显式 "0" 表示关闭该项限制。
func FromEnv(getenv func(string) string) Config {
	c := DefaultConfig()
	if raw := getenv("EXECUTION_RATE_LIMIT_QPS"); raw != "" {
		if v, err := strconv.ParseFloat(raw, 64); err == nil {
			c.QPS = v // 显式 0 即关闭限流
		}
	}
	if raw := getenv("EXECUTION_RATE_LIMIT_BURST"); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 {
			c.Burst = v
		}
	}
	if v, err := strconv.ParseFloat(getenv("EXECUTION_DAILY_COST_LIMIT"), 64); err == nil {
		c.DailyCostLimit = v
	}
	if v, err := strconv.ParseFloat(getenv("EXECUTION_MONTHLY_COST_LIMIT"), 64); err == nil {
		c.MonthlyCostLimit = v
	}
	return c
}
