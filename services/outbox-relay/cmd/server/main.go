package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

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

func main() {
	dsn := os.Getenv("OUTBOX_DATABASE_URL")
	if dsn == "" {
		log.Fatal("OUTBOX_DATABASE_URL must be set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		log.Fatal(err)
	}
	r := &relay{pool: pool, client: &http.Client{Timeout: 15 * time.Second}, executionURL: env("OUTBOX_EXECUTION_URL", "http://execution:8085"), token: os.Getenv("OUTBOX_EXECUTION_TOKEN"), workerID: id(), batch: envInt("OUTBOX_BATCH_SIZE", 20), lease: time.Duration(envInt("OUTBOX_LEASE_SECONDS", 60)) * time.Second, maxAttempts: envInt("OUTBOX_MAX_ATTEMPTS", 20)}
	if r.token == "" {
		log.Fatal("OUTBOX_EXECUTION_TOKEN must be set")
	}
	interval := time.Duration(envInt("OUTBOX_POLL_SECONDS", 2)) * time.Second
	log.Printf("outbox relay %s -> %s", r.workerID, r.executionURL)
	for {
		ctx, cancel := context.WithTimeout(context.Background(), interval)
		if err := r.runOnce(ctx); err != nil {
			log.Printf("relay: %v", err)
		}
		cancel()
		time.Sleep(interval)
	}
}

func (r *relay) runOnce(ctx context.Context) error {
	events, err := r.claim(ctx)
	if err != nil {
		return err
	}
	for _, e := range events {
		if err := r.deliver(ctx, e); err != nil {
			log.Printf("event %d: %v", e.ID, err)
			if markErr := r.fail(ctx, e.ID, e.Attempts, err); markErr != nil {
				log.Printf("event %d mark failed: %v", e.ID, markErr)
			}
		} else if err := r.ack(ctx, e.ID, e.Workspace, e.Aggregate); err != nil {
			log.Printf("event %d ack: %v", e.ID, err)
		}
	}
	return nil
}

func (r *relay) claim(ctx context.Context) ([]event, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
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
	defer resp.Body.Close()
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
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `UPDATE outbox_events SET published_at=now(),locked_at=NULL,locked_by='',last_error='' WHERE id=$1 AND locked_by=$2`, id, r.workerID); err != nil {
		return err
	}
	if aggregate != "" {
		// intent 状态同步是尽力而为：失败不得阻塞 outbox ack（否则事件重投导致重复派发），但必须可见。
		if _, err = tx.Exec(ctx, `UPDATE generation_intents SET status='dispatched',updated_at=now() WHERE workspace_id=$2 AND id=$1 AND status='pending'`, aggregate, workspace); err != nil {
			log.Printf("event %d intent dispatched mark failed (ack proceeds): %v", id, err)
		}
	}
	return tx.Commit(ctx)
}

// backoffSeconds 计算重试退避：平方退避，夹在 [2, 300] 秒之间。
//
// 为什么抽成【纯函数】：这段夹取逻辑原先内联在 fail() 里，而 fail() 需要数据库
// ⇒ 300 秒上限与 2 秒下限**从未被任何测试验证过**（该服务覆盖率仅 14.6%）。
// 抽出来之后边界可被直接锁定，fail() 的行为不变。
func backoffSeconds(attempts int) int {
	backoff := attempts * attempts
	if backoff < 2 {
		backoff = 2
	}
	if backoff > 300 {
		backoff = 300
	}
	return backoff
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

func id() string { var b [8]byte; _, _ = rand.Read(b[:]); return "relay_" + hex.EncodeToString(b[:]) }
func env(k, fallback string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return fallback
}
func envInt(k string, fallback int) int {
	if v, err := strconv.Atoi(os.Getenv(k)); err == nil && v > 0 {
		return v
	}
	return fallback
}
