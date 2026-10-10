package job

import (
	"errors"
	"math"
	"math/rand"
	"time"
)

// ErrNotRunning 表示任务当前不是 running 状态，无法判定重试/失败。
var ErrNotRunning = errors.New("job is not running")

// RetryConfig 控制退避重试策略。
type RetryConfig struct {
	Base time.Duration // 首次退避基数
	Max  time.Duration // 退避上限
	// Jitter 为抖动比例（0~1）。加抖动是为了避免多个任务在同一时刻
	// 同时重试形成「惊群」，把刚恢复的上游再次打垮。
	Jitter float64
}

// DefaultRetryConfig 返回默认退避策略：5s 起、上限 5min、20% 抖动。
func DefaultRetryConfig() RetryConfig {
	return RetryConfig{Base: 5 * time.Second, Max: 5 * time.Minute, Jitter: 0.2}
}

// Backoff 返回第 attempt 次失败后应等待的时长（attempt 从 1 开始计）。
//
// 采用指数退避：base * 2^(attempt-1)，封顶 Max，再叠加 ±Jitter 的随机抖动。
// 指数退避让上游有恢复时间；抖动避免惊群。
func (c RetryConfig) Backoff(attempt int, rnd *rand.Rand) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	base := c.Base
	if base <= 0 {
		base = DefaultRetryConfig().Base
	}
	max := c.Max
	if max <= 0 {
		max = DefaultRetryConfig().Max
	}
	// 用浮点计算避免 2^n 溢出（attempt 很大时直接封顶）
	d := float64(base) * math.Pow(2, float64(attempt-1))
	if d > float64(max) || math.IsInf(d, 0) {
		d = float64(max)
	}
	if c.Jitter > 0 && rnd != nil {
		// [-Jitter, +Jitter]
		delta := (rnd.Float64()*2 - 1) * c.Jitter * d
		d += delta
	}
	if d < 0 {
		d = 0
	}
	if d > float64(max) {
		d = float64(max)
	}
	return time.Duration(d)
}

// Semaphore 是带缓冲的并发闸门。
//
// 为什么需要它：worker 原先对每个任务直接 `go func(){...}()`，
// **没有任何并发上限** —— 一次批量提交就会同时向上游发起 N 个请求，
// 既可能击穿上游配额，也会耗尽本进程的连接与内存。
type Semaphore struct {
	ch chan struct{}
}

// NewSemaphore 创建容量为 n 的闸门；n<=0 时退化为默认 8。
func NewSemaphore(n int) *Semaphore {
	if n <= 0 {
		n = 8
	}
	return &Semaphore{ch: make(chan struct{}, n)}
}

// Cap 返回闸门容量。
func (s *Semaphore) Cap() int { return cap(s.ch) }

// TryAcquire 非阻塞获取；成功返回 true。
func (s *Semaphore) TryAcquire() bool {
	select {
	case s.ch <- struct{}{}:
		return true
	default:
		return false
	}
}

// Release 归还一个名额。多还（无对应 Acquire）会 panic，属调用方 bug。
func (s *Semaphore) Release() { <-s.ch }

// InFlight 返回当前占用数（用于观测与测试）。
func (s *Semaphore) InFlight() int { return len(s.ch) }
