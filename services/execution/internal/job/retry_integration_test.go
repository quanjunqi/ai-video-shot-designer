package job

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// 需要真实 PostgreSQL（与会话验证一致的做法）：
//
//	EXECUTION_TEST_DATABASE_URL=postgres://... go test ./internal/job/ -run Integration -v
//
// 未设置时整组跳过，因此 CI 无需数据库也能通过。
func newTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("EXECUTION_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("未设置 EXECUTION_TEST_DATABASE_URL，跳过集成测试")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("连接测试库失败: %v", err)
	}
	return pool
}

func TestIntegration_FailOrRetryThenDeadLetter(t *testing.T) {
	pool := newTestPool(t)
	defer pool.Close()
	ctx := context.Background()
	s := Store{Pool: pool}

	if _, err := pool.Exec(ctx, `DELETE FROM job_attempts WHERE job_id LIKE 'it-retry-%'`); err != nil {
		t.Fatalf("清理 attempts: %v", err)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM jobs WHERE id LIKE 'it-retry-%'`); err != nil {
		t.Fatalf("清理 jobs: %v", err)
	}
	_, err := pool.Exec(ctx, `INSERT INTO jobs (workspace_id,id,idempotency_key,request_hash,kind,label,created_by,status,max_attempts,attempt)
		VALUES ('ws-it','it-retry-1','k-it-1','h1','image','集成测试','tester','queued',3,1)`)
	if err != nil {
		t.Fatalf("插入 job: %v", err)
	}
	_, err = pool.Exec(ctx, `INSERT INTO job_attempts (workspace_id,job_id,attempt,status) VALUES ('ws-it','it-retry-1',1,'queued')`)
	if err != nil {
		t.Fatalf("插入 attempt: %v", err)
	}

	// 认领（queued -> running）
	if err := s.Advance(ctx, 10); err != nil {
		t.Fatalf("Advance: %v", err)
	}
	var status string
	var attempt int
	if err := pool.QueryRow(ctx, `SELECT status,attempt FROM jobs WHERE id='it-retry-1'`).Scan(&status, &attempt); err != nil {
		t.Fatalf("查询: %v", err)
	}
	if status != "running" || attempt != 1 {
		t.Fatalf("认领后应为 running/attempt=1，实际 %s/%d", status, attempt)
	}

	// 第 1 次失败 → 应重排为 queued 且 attempt=2，并写入错误原因
	retried, err := s.FailOrRetry(ctx, "it-retry-1", "上游 503", 1.0)
	if err != nil {
		t.Fatalf("FailOrRetry#1: %v", err)
	}
	if !retried {
		t.Fatal("第 1 次失败应重试")
	}
	var nextAttempt time.Time
	var dead *time.Time
	if err := pool.QueryRow(ctx, `SELECT status,attempt,error,next_attempt_at,dead_lettered_at FROM jobs WHERE id='it-retry-1'`).
		Scan(&status, &attempt, new(string), &nextAttempt, &dead); err != nil {
		t.Fatalf("查询: %v", err)
	}
	if status != "queued" || attempt != 2 {
		t.Fatalf("重试后应为 queued/attempt=2，实际 %s/%d", status, attempt)
	}
	if dead != nil {
		t.Fatal("重试时不应进死信")
	}
	var errMsg string
	_ = pool.QueryRow(ctx, `SELECT error FROM jobs WHERE id='it-retry-1'`).Scan(&errMsg)
	if errMsg != "上游 503" {
		t.Fatalf("失败原因应可查，实际 %q", errMsg)
	}
	// 退避窗口内不应被再次认领
	if err := s.Advance(ctx, 10); err != nil {
		t.Fatalf("Advance: %v", err)
	}
	if err := pool.QueryRow(ctx, `SELECT status FROM jobs WHERE id='it-retry-1'`).Scan(&status); err != nil {
		t.Fatalf("查询: %v", err)
	}
	if status != "queued" {
		t.Fatalf("退避期内不应被认领，实际 %s", status)
	}
	// 把退避时间提前到过去，模拟等待结束
	if _, err := pool.Exec(ctx, `UPDATE jobs SET next_attempt_at=now()-interval '1 second' WHERE id='it-retry-1'`); err != nil {
		t.Fatalf("调整退避: %v", err)
	}
	if err := s.Advance(ctx, 10); err != nil {
		t.Fatalf("Advance: %v", err)
	}
	// 第 2、3 次失败
	for i := 2; i <= 3; i++ {
		if _, err := s.FailOrRetry(ctx, "it-retry-1", "上游仍 503", 0.01); err != nil {
			t.Fatalf("FailOrRetry#%d: %v", i, err)
		}
		if i < 3 {
			if _, err := pool.Exec(ctx, `UPDATE jobs SET next_attempt_at=now()-interval '1 second' WHERE id='it-retry-1'`); err != nil {
				t.Fatalf("调整退避: %v", err)
			}
			if err := s.Advance(ctx, 10); err != nil {
				t.Fatalf("Advance: %v", err)
			}
		}
	}
	// 第 3 次（= max_attempts）后应失败并进死信
	if err := pool.QueryRow(ctx, `SELECT status,attempt,dead_lettered_at FROM jobs WHERE id='it-retry-1'`).Scan(&status, &attempt, &dead); err != nil {
		t.Fatalf("查询: %v", err)
	}
	if status != "failed" {
		t.Fatalf("耗尽重试后应为 failed，实际 %s", status)
	}
	if attempt != 3 {
		t.Fatalf("attempt 应为 3，实际 %d", attempt)
	}
	if dead == nil {
		t.Fatal("耗尽早应写入 dead_lettered_at")
	}
	// 非 running 状态再调用应返回 ErrNotRunning（而非静默成功）
	if _, err := s.FailOrRetry(ctx, "it-retry-1", "x", 1); !errors.Is(err, ErrNotRunning) {
		t.Fatalf("非 running 应返回 ErrNotRunning，实际 %v", err)
	}
	// 重试历史可查：应有 attempt 1/2 的 failed 记录 + 1 条 running/queued 记录
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM job_attempts WHERE job_id='it-retry-1' AND status='failed'`).Scan(&n); err != nil {
		t.Fatalf("查询 attempts: %v", err)
	}
	if n < 2 {
		t.Fatalf("应至少有 2 条失败尝试记录，实际 %d", n)
	}
}
