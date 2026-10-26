// Package relay 实现 outbox 事务消息投递：轮询 outbox 表 → 投递到
// execution 网关 → ack / fail（含退避与死信）。
//
// 高内聚：投递的全部业务逻辑收敛在本包；cmd/server 只做装配
// （BE-LAYER-002：cmd 只装配，不含业务）。
package relay

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"shotdesigner/shared/observability"

	"github.com/jackc/pgx/v5/pgxpool"
)

type event struct {
	ID                                     int64
	Workspace, Actor, Aggregate, EventType string
	Payload                                []byte
	Attempts                               int
}

type relay struct {
	pool                          *pgxpool.Pool
	client                        *http.Client
	executionURL, token, workerID string
	batch                         int
	lease                         time.Duration
	maxAttempts                   int
}

// Logger 是 outbox-relay 的统一结构化日志器（W5：可观测性深化）。
var Logger = observability.NewJSONLogger("outbox-relay")

// Config 是构造 Relay 的装配参数。默认值在 New 内收敛，cmd 只读环境变量。
type Config struct {
	Pool         *pgxpool.Pool
	Client       *http.Client
	ExecutionURL string
	Token        string
	WorkerID     string
	Batch        int
	Lease        time.Duration
	MaxAttempts  int
}

// New 构造 Relay。装配校验（依赖非空、默认值）收敛在构造函数内，
// cmd/main 只负责读环境变量并调用，不在装配层堆业务校验。
func New(cfg Config) (*relay, error) {
	if cfg.Pool == nil {
		return nil, errors.New("relay: pool is required")
	}
	if cfg.Token == "" {
		return nil, errors.New("relay: token is required")
	}
	if cfg.ExecutionURL == "" {
		return nil, errors.New("relay: execution url is required")
	}
	if cfg.Client == nil {
		cfg.Client = &http.Client{Timeout: 15 * time.Second}
	}
	if cfg.WorkerID == "" {
		cfg.WorkerID = id()
	}
	if cfg.Batch <= 0 {
		cfg.Batch = 20
	}
	if cfg.Lease <= 0 {
		cfg.Lease = 60 * time.Second
	}
	if cfg.MaxAttempts <= 0 {
		cfg.MaxAttempts = 20
	}
	return &relay{pool: cfg.Pool, client: cfg.Client, executionURL: cfg.ExecutionURL, token: cfg.Token, workerID: cfg.WorkerID, batch: cfg.Batch, lease: cfg.Lease, maxAttempts: cfg.MaxAttempts}, nil
}

// Run 是 relay 的主循环：轮询 outbox → 投递 → ack/fail，直到 ctx 取消。
// 每次轮询用独立的超时 ctx（不超过 interval），轮询之间等待可被 ctx 取消
// —— 旧实现对 ctx 完全不设防（gosec G118）：SIGTERM 后仍会跑完当前轮再空转等
// interval，停机被拖长到一整轮间隔。
func (r *relay) Run(ctx context.Context, interval time.Duration) {
	Logger.Info("outbox relay started", "worker_id", r.workerID, "execution_url", r.executionURL)
	for {
		runCtx, cancel := context.WithTimeout(ctx, interval)
		if err := r.runOnce(runCtx); err != nil {
			Logger.Warn("relay poll failed", slog.Any("err", err))
		}
		cancel()

		// 轮询与轮询之间的等待：ctx 取消立即返回，不必等满 interval
		timer := time.NewTimer(interval)
		select {
		case <-ctx.Done():
			timer.Stop()
			Logger.Info("outbox relay stopped", "worker_id", r.workerID)
			return
		case <-timer.C:
		}
	}
}

func (r *relay) runOnce(ctx context.Context) error {
	events, err := r.claim(ctx)
	if err != nil {
		return err
	}
	for _, e := range events {
		if err := r.deliver(ctx, e); err != nil {
			Logger.Warn("event delivery failed", "event_id", e.ID, slog.Any("err", err))
			if markErr := r.fail(ctx, e.ID, e.Attempts, err); markErr != nil {
				Logger.Warn("event mark failed", "event_id", e.ID, slog.Any("err", markErr))
			}
		} else if err := r.ack(ctx, e.ID, e.Workspace, e.Aggregate); err != nil {
			Logger.Warn("event ack failed", "event_id", e.ID, slog.Any("err", err))
		}
	}
	return nil
}

func (r *relay) claim(ctx context.Context) ([]event, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	rows, err := tx.Query(ctx, `WITH picked AS (
SELECT id FROM outbox_events
WHERE published_at IS NULL AND dead_lettered_at IS NULL AND available_at <= now()
  AND (locked_at IS NULL OR locked_at < now() - $1::interval)
ORDER BY id FOR UPDATE SKIP LOCKED LIMIT $2)
UPDATE outbox_events e SET locked_at=now(), locked_by=$3, attempts=e.attempts+1
FROM picked p WHERE e.id=p.id
RETURNING e.id,e.workspace_id,e.actor_id,e.aggregate_id,e.event_type,e.payload,e.attempts`, fmt.Sprintf("%d seconds", int(r.lease.Seconds())), r.batch, r.workerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []event
	for rows.Next() {
		var e event
		if err := rows.Scan(&e.ID, &e.Workspace, &e.Actor, &e.Aggregate, &e.EventType, &e.Payload, &e.Attempts); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return out, nil
}

func (r *relay) deliver(ctx context.Context, e event) error {
	if e.EventType != "generation.intent.created" {
		return fmt.Errorf("unsupported event type %q", e.EventType)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.executionURL+"/internal/v1/execution-intents", bytes.NewReader(e.Payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+r.token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Workspace-Id", e.Workspace)
	req.Header.Set("X-Actor-Id", e.Actor)
	resp, err := r.client.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	return fmt.Errorf("execution returned HTTP %d", resp.StatusCode)
}

func (r *relay) ack(ctx context.Context, id int64, workspace, aggregate string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err = tx.Exec(ctx, `UPDATE outbox_events SET published_at=now(),locked_at=NULL,locked_by='',last_error='' WHERE id=$1 AND locked_by=$2`, id, r.workerID); err != nil {
		return err
	}
	if aggregate != "" {
		// intent 状态同步是尽力而为：失败不得阻塞 outbox ack（否则事件重投导致重复派发），但必须可见。
		if _, err = tx.Exec(ctx, `UPDATE generation_intents SET status='dispatched',updated_at=now() WHERE workspace_id=$2 AND id=$1 AND status='pending'`, aggregate, workspace); err != nil {
			Logger.Warn("event intent dispatched mark failed (ack proceeds)", "event_id", id, slog.Any("err", err))
		}
	}
	return tx.Commit(ctx)
}

func (r *relay) fail(ctx context.Context, id int64, attempts int, cause error) error {
	backoff := backoffSeconds(attempts)
	if attempts >= r.maxAttempts {
		_, err := r.pool.Exec(ctx, `UPDATE outbox_events SET dead_lettered_at=now(),locked_at=NULL,locked_by='',last_error=$2 WHERE id=$1 AND locked_by=$3`, id, cause.Error(), r.workerID)
		return err
	}
	_, err := r.pool.Exec(ctx, `UPDATE outbox_events SET available_at=now()+($2::text || ' seconds')::interval,locked_at=NULL,locked_by='',last_error=$3 WHERE id=$1 AND locked_by=$4`, id, strconv.Itoa(backoff), cause.Error(), r.workerID)
	return err
}
