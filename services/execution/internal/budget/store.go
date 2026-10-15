package budget

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Store 是 budget_holds 表的 pgx 实现。所有写操作原子化：
//   - Hold     : INSERT ... ON CONFLICT (job_id) DO NOTHING（幂等），
//     冲突时回读已有行 —— 并发同任务双提交只落一行。
//   - Settle   : UPDATE ... WHERE status='pending'（原子：非 pending 不动作）。
//   - Release  : UPDATE ... WHERE status='pending'（原子）。
//
// 金额用 numeric(18,4)；读出 float64 仅用于比较/展示，运算收敛在 numeric 口径（BE-DATA-001）。
type Store struct {
	Pool *pgxpool.Pool
}

const holdCols = `id, job_id, workspace_id, period, status, hold_amount, actual_amount, refund_amount, fail_open`

func scanHold(row interface {
	Scan(dest ...any) error
}, h *HoldRecord) error {
	return row.Scan(&h.ID, &h.JobID, &h.WorkspaceID, &h.Period, &h.Status,
		&h.HoldAmount, &h.ActualAmount, &h.RefundAmount, &h.FailOpen)
}

// Hold 写入一个预扣行（pending）。job_id 唯一：重复 Hold 幂等返回已有行。
func (s *Store) Hold(ctx context.Context, h HoldRecord) (HoldRecord, error) {
	id := h.ID
	if id == "" {
		id = holdID()
	}
	err := scanHold(s.Pool.QueryRow(ctx,
		`INSERT INTO budget_holds (id, job_id, workspace_id, period, status, hold_amount, actual_amount, refund_amount, fail_open, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,0,0,$7, now(), now())
		 ON CONFLICT (job_id) DO UPDATE SET updated_at=now()
		 RETURNING `+holdCols,
		id, h.JobID, h.WorkspaceID, h.Period, StatusPending, h.HoldAmount, h.FailOpen), &h)
	// 幂等路径：ON CONFLICT 后 RETURNING 返回的是更新后的行 —— 已存在时 hold_amount
	// 仍是旧值，但 status 可能已非 pending。为避免"拿到旧预扣当新预扣"，冲突时回读。
	if errors.Is(err, pgx.ErrNoRows) {
		return h, nil
	}
	if err != nil {
		return HoldRecord{}, err
	}
	return h, nil
}

// Settle 结算：仅当 status=pending 时原子更新为 settled，退还 预扣-实际 差额。
// 返回是否发生更新（false = 行不存在或已非 pending，幂等）。
func (s *Store) Settle(ctx context.Context, id string, actual float64) (bool, error) {
	tag, err := s.Pool.Exec(ctx,
		`UPDATE budget_holds SET status=$2, actual_amount=$3, refund_amount=hold_amount-$3,
		        settled_at=now(), updated_at=now()
		 WHERE id=$1 AND status='pending'`,
		id, StatusSettled, actual)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// Release 退扣：仅当 status=pending 时原子更新为 released（全部退还）。
// 返回是否发生更新（false = 行不存在或已非 pending，幂等）。
func (s *Store) Release(ctx context.Context, id string) (bool, error) {
	tag, err := s.Pool.Exec(ctx,
		`UPDATE budget_holds SET status=$2, refund_amount=hold_amount,
		        settled_at=now(), updated_at=now()
		 WHERE id=$1 AND status='pending'`,
		id, StatusReleased)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// holdID 生成预扣行主键（crypto/rand 十六进制；非安全场景的记录主键）。
func holdID() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "hold_0000000000000000"
	}
	return "hold_" + hex.EncodeToString(b[:])
}

// Outstanding 返回某工作区【未结算预扣】的日/月合计（预扣即封顶，供校验叠加）。
// 周期归属按 created_at 落在当日/当月（与 audit.Spend 同口径）。
func (s *Store) Outstanding(ctx context.Context, workspace string) (day float64, month float64, err error) {
	err = s.Pool.QueryRow(ctx, `
		SELECT
			COALESCE(SUM(hold_amount) FILTER (WHERE created_at >= date_trunc('day', now())), 0),
			COALESCE(SUM(hold_amount) FILTER (WHERE created_at >= date_trunc('month', now())), 0)
		FROM budget_holds
		WHERE workspace_id = $1 AND status = 'pending'
	`, workspace).Scan(&day, &month)
	return day, month, err
}
