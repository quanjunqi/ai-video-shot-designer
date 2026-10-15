package store

import (
	"context"
	"time"
)

// BudgetRule 是一条生效中的预算规则（租户级或工作区级 × 日/月）。
// 金额用 float64 承载（numeric(18,4) 扫描），禁止用 float64 做账务运算——
// 本表只做【比较】与【展示】，运算收敛在 execution 的 numeric 口径内。
type BudgetRule struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspaceId"` // scope=tenant 时为空串
	Scope       string    `json:"scope"`       // tenant | workspace
	Period      string    `json:"period"`      // day | month
	LimitAmount float64   `json:"limitAmount"` // CNY
	Action      string    `json:"action"`      // warn | block
	WarnAt      float64   `json:"warnAt"`      // 0-1 告警阈值比例
	Enabled     bool      `json:"enabled"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

const budgetRuleCols = `id, workspace_id, scope, period, limit_amount, action, warn_at, enabled, created_at, updated_at`

func scanBudgetRule(row interface {
	Scan(dest ...any) error
}, r *BudgetRule) error {
	return row.Scan(&r.ID, &r.WorkspaceID, &r.Scope, &r.Period, &r.LimitAmount, &r.Action, &r.WarnAt, &r.Enabled, &r.CreatedAt, &r.UpdatedAt)
}

// ListBudgetRules 返回某工作区的全部预算规则（含租户级 + 工作区级，按 scope/period 排序）。
// 唯一键 (workspace_id, scope, period)：租户级行 workspace_id=”，工作区级行 workspace_id=$1。
func (s Store) ListBudgetRules(ctx context.Context, workspace string) ([]BudgetRule, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT `+budgetRuleCols+` FROM budget_rules
		 WHERE (scope='tenant' AND workspace_id='') OR (scope='workspace' AND workspace_id=$1)
		 ORDER BY scope DESC, period ASC`, workspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]BudgetRule, 0)
	for rows.Next() {
		var r BudgetRule
		if err := scanBudgetRule(rows, &r); err != nil {
			return nil, err
		}
		items = append(items, r)
	}
	return items, rows.Err()
}

// EffectiveBudgetRules 返回某工作区【生效中】的规则（enabled=true），
// 供 execution 请求前校验读取。租户级在前、工作区级在后（后者覆盖前者同周期）。
func (s Store) EffectiveBudgetRules(ctx context.Context, workspace string) ([]BudgetRule, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT `+budgetRuleCols+` FROM budget_rules
		 WHERE enabled AND ((scope='tenant' AND workspace_id='') OR (scope='workspace' AND workspace_id=$1))
		 ORDER BY scope DESC, period ASC`, workspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]BudgetRule, 0)
	for rows.Next() {
		var r BudgetRule
		if err := scanBudgetRule(rows, &r); err != nil {
			return nil, err
		}
		items = append(items, r)
	}
	return items, rows.Err()
}

// UpsertBudgetRule 写入一条规则（按 租户/工作区+周期 唯一键 upsert）。
// scope=tenant 时 workspace 入参被忽略，落 ”；scope=workspace 时落具体工作区。
func (s Store) UpsertBudgetRule(ctx context.Context, workspace string, r BudgetRule) (BudgetRule, error) {
	ws := workspace
	if r.Scope == "tenant" {
		ws = ""
	}
	err := scanBudgetRule(s.Pool.QueryRow(ctx,
		`INSERT INTO budget_rules (id, workspace_id, scope, period, limit_amount, action, warn_at, enabled, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
		 ON CONFLICT (workspace_id, scope, period) DO UPDATE SET
		   limit_amount=EXCLUDED.limit_amount, action=EXCLUDED.action,
		   warn_at=EXCLUDED.warn_at, enabled=EXCLUDED.enabled, updated_at=now()
		 RETURNING `+budgetRuleCols,
		r.ID, ws, r.Scope, r.Period, r.LimitAmount, r.Action, r.WarnAt, r.Enabled), &r)
	return r, err
}

// DeleteBudgetRule 删除某工作区下指定周期的规则（工作区级）。租户级由 Owner 在租户维度管理。
func (s Store) DeleteBudgetRule(ctx context.Context, workspace, period string) error {
	_, err := s.Pool.Exec(ctx,
		`DELETE FROM budget_rules WHERE scope='workspace' AND workspace_id=$1 AND period=$2`, workspace, period)
	return err
}
