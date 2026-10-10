package job

import (
	"math/rand"
	"testing"
	"time"
)

func TestBackoff_ExponentialAndCapped(t *testing.T) {
	c := RetryConfig{Base: 5 * time.Second, Max: 5 * time.Minute}
	// 无抖动下应为 5s,10s,20s,40s,80s,160s,300s(封顶),300s...
	want := []time.Duration{5, 10, 20, 40, 80, 160, 300, 300, 300}
	for i, w := range want {
		got := c.Backoff(i+1, nil) // attempt 从 1 开始
		if got != w*time.Second {
			t.Errorf("attempt=%d Backoff=%v, want %v", i+1, got, w*time.Second)
		}
	}
}

func TestBackoff_NeverBelowZeroAndNeverAboveMax(t *testing.T) {
	c := DefaultRetryConfig()
	rnd := rand.New(rand.NewSource(42))
	for attempt := 1; attempt <= 50; attempt++ {
		got := c.Backoff(attempt, rnd)
		if got < 0 {
			t.Fatalf("attempt=%d 出现负退避: %v", attempt, got)
		}
		// 抖动为 ±20%，故上限为 Max*1.2
		if got > time.Duration(float64(c.Max)*1.21) {
			t.Fatalf("attempt=%d 超出上限: %v", attempt, got)
		}
	}
}

func TestBackoff_JitterActuallyVaries(t *testing.T) {
	c := RetryConfig{Base: time.Minute, Max: time.Hour, Jitter: 0.5}
	rnd := rand.New(rand.NewSource(7))
	seen := map[time.Duration]bool{}
	for i := 0; i < 20; i++ {
		seen[c.Backoff(1, rnd)] = true
	}
	if len(seen) < 5 {
		t.Fatalf("抖动应产生多个不同取值，实际只有 %d 个", len(seen))
	}
}

func TestBackoff_AttemptBelowOneTreatedAsFirst(t *testing.T) {
	c := RetryConfig{Base: 3 * time.Second, Max: time.Minute}
	if got := c.Backoff(0, nil); got != 3*time.Second {
		t.Errorf("attempt=0 应按首次计算，实际 %v", got)
	}
	if got := c.Backoff(-5, nil); got != 3*time.Second {
		t.Errorf("attempt<0 应按首次计算，实际 %v", got)
	}
}

func TestSemaphore_LimitsConcurrency(t *testing.T) {
	s := NewSemaphore(3)
	if s.Cap() != 3 {
		t.Fatalf("Cap=%d", s.Cap())
	}
	for i := 0; i < 3; i++ {
		if !s.TryAcquire() {
			t.Fatalf("第 %d 次获取应成功", i+1)
		}
	}
	if s.TryAcquire() {
		t.Fatal("超过容量仍获取成功 —— 闸门失效")
	}
	if s.InFlight() != 3 {
		t.Fatalf("InFlight=%d, want 3", s.InFlight())
	}
	s.Release()
	if !s.TryAcquire() {
		t.Fatal("释放后应可再次获取")
	}
}

func TestSemaphore_DefaultCapacityWhenNonPositive(t *testing.T) {
	for _, n := range []int{0, -1} {
		if got := NewSemaphore(n).Cap(); got != 8 {
			t.Errorf("NewSemaphore(%d).Cap()=%d, want 8", n, got)
		}
	}
}

// 验证闸门在「并发上限」语义下不会超发：模拟 worker 派发循环。
func TestSemaphore_CapsDispatchedGoroutines(t *testing.T) {
	const cap = 4
	s := NewSemaphore(cap)
	const total = 50
	dispatched, skipped := 0, 0
	for i := 0; i < total; i++ {
		if s.TryAcquire() {
			dispatched++
			// 模拟任务完成后释放（此处不真正并发，只验证计数语义）
			s.Release()
		} else {
			skipped++
		}
	}
	if dispatched != total || skipped != 0 {
		t.Fatalf("逐个完成场景下应全部派发: dispatched=%d skipped=%d", dispatched, skipped)
	}
	// 占满后必须拒绝
	for i := 0; i < cap; i++ {
		s.TryAcquire()
	}
	if s.TryAcquire() {
		t.Fatal("占满后应拒绝")
	}
}
