package catalog

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"
)

// ReconcileResult 是 POST /internal/v1/logical-models/reconcile 的响应：
//   - Created：本次新建的逻辑模型分组数
//   - Bound：本次绑定的候选行数（= 影响行数，并发抢占时按真实 RowsAffected 计）
//   - Skipped：读入但未归并的行数（缺 provider_model / 归并键为空）
//
// 已绑定（logical_model_id 非空）的行不进查询，不统计 —— 它们归手工管理。
type ReconcileResult struct {
	Created int `json:"created"`
	Bound   int `json:"bound"`
	Skipped int `json:"skipped"`
}

// ReconcileLogicalModels 对给定工作区未归并的入池模型执行自动归并（TASK-MODEL-007）。
//
// 语义（与 PlanReconcile 一致）：
//   - 只处理 workspace_id = $1 且 logical_model_id IS NULL 的 model_catalog 行
//   - 同名跨渠道合并、不同名独立、已有同名分组复用、只增不删、幂等
//   - 单事务：读（未归并行 + 现有分组）→ 规划 → 写（新建分组 + 绑定候选），原子提交
//   - 绑定 UPDATE 再次断言 logical_model_id IS NULL：并发抢占时不覆盖（真实影响行数计入 Bound）
func (store PostgresStore) ReconcileLogicalModels(ctx context.Context, workspaceID, actor string) (ReconcileResult, error) {
	tx, err := store.Pool.Begin(ctx)
	if err != nil {
		return ReconcileResult{}, fmt.Errorf("reconcile begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// 1. 待归并行：当前工作区、未绑定（含空 provider_model —— 交给 PlanReconcile 计 skipped）。
	rows, err := tx.Query(ctx, `SELECT id, channel_id, COALESCE(provider_model,''), COALESCE(name,''), COALESCE(family,''), COALESCE(type,'')
	    FROM model_catalog
	    WHERE workspace_id = $1 AND logical_model_id IS NULL
	    ORDER BY id`, workspaceID)
	if err != nil {
		return ReconcileResult{}, fmt.Errorf("reconcile read unbound: %w", err)
	}
	models := make([]ReconcileModel, 0, 64)
	for rows.Next() {
		var m ReconcileModel
		if err := rows.Scan(&m.ID, &m.ChannelID, &m.ProviderModel, &m.Name, &m.Family, &m.Type); err != nil {
			rows.Close()
			return ReconcileResult{}, fmt.Errorf("reconcile scan unbound: %w", err)
		}
		models = append(models, m)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return ReconcileResult{}, fmt.Errorf("reconcile unbound rows: %w", err)
	}

	// 2. 现有逻辑模型（用于复用与键占用判断）。
	existing, err := tx.Query(ctx, `SELECT id FROM logical_models ORDER BY id`)
	if err != nil {
		return ReconcileResult{}, fmt.Errorf("reconcile read logical models: %w", err)
	}
	existingModels := make([]LogicalModel, 0, 32)
	for existing.Next() {
		var m LogicalModel
		if err := existing.Scan(&m.ID); err != nil {
			existing.Close()
			return ReconcileResult{}, fmt.Errorf("reconcile scan logical model: %w", err)
		}
		existingModels = append(existingModels, m)
	}
	existing.Close()
	if err := existing.Err(); err != nil {
		return ReconcileResult{}, fmt.Errorf("reconcile logical model rows: %w", err)
	}

	// 3. 规划（纯函数）。
	plan := PlanReconcile(models, existingModels, nil)

	// 4. 写：新建分组。
	for _, create := range plan.Create {
		if _, err := tx.Exec(ctx, `INSERT INTO logical_models (id, label, type, capability, status, sort, note, created_by)
		    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			create.ID, create.Label, create.Type, nullableString(create.Capability),
			create.Status, derefInt(create.Sort), create.Note, actor); err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				// 并发下另一事务已建同名分组：跳过建组（不覆盖），绑定仍在下一轮断言中处理。
				continue
			}
			return ReconcileResult{}, fmt.Errorf("reconcile create logical model %s: %w", create.ID, err)
		}
	}

	// 5. 写：绑定候选（WHERE 再断言未绑定，防并发抢占；真实影响行数计入 Bound）。
	bound := 0
	for _, b := range plan.Bind {
		commandTag, err := tx.Exec(ctx, `UPDATE model_catalog
		    SET logical_model_id = $2, route_priority = $3, version = version + 1, updated_at = now()
		    WHERE id = $1 AND workspace_id = $4 AND logical_model_id IS NULL`,
			b.ModelID, b.LogicalModelID, b.RoutePriority, workspaceID)
		if err != nil {
			return ReconcileResult{}, fmt.Errorf("reconcile bind %s → %s: %w", b.ModelID, b.LogicalModelID, err)
		}
		bound += int(commandTag.RowsAffected())
	}

	if err := tx.Commit(ctx); err != nil {
		return ReconcileResult{}, fmt.Errorf("reconcile commit: %w", err)
	}
	return ReconcileResult{Created: len(plan.Create), Bound: bound, Skipped: plan.Skipped}, nil
}

// derefInt 解引用 int 指针；nil 时返回默认排序值（与 CreateLogicalModel 行为一致）。
func derefInt(v *int) int {
	if v == nil {
		return defaultLogicalModelSort
	}
	return *v
}
