package catalog

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// ADR-004 §4「同步（自动）」的**存储层**；也是 §8 验证计划 1–4、6 中与库相关的部分。
//
// 边界（ADR-004 §9 第 4 项）：本文件只写【供给池】。供给池不被任何前端或执行路径读取；
// 只有经人工策展写入 model_catalog 后，模型才可能对外可见。
// 因此这里【绝不】触碰 model_catalog（§8.3 有专门断言）。

// UpstreamModel 是上游清单里的一条，字段一律**原样**保存。
type UpstreamModel struct {
	ProviderModel   string
	DisplayName     string
	ModelType       string // 上游原样标签（chat/image/video/audio…）：刻意不做约束
	Tags            string
	EndpointTypes   json.RawMessage
	Vendor          string
	Raw             json.RawMessage
	Pricing         json.RawMessage
	RemoteCreatedAt *time.Time
}

// SyncResult 是一次同步的计数，直接落 channel_model_syncs。
type SyncResult struct {
	RawCount     int
	Added        int
	Updated      int
	Missing      int
	PriceChanged int
}

// ApplySync 把一次上游清单落进供给池。**整体在一个事务里**：
// 任何一步失败 ⇒ 全部回滚 ⇒ 已有供给池数据完好（§8.4：失败隔离）。
//
// 语义（逐条对应 ADR §8）：
//   - 幂等（§8.1）：同一份清单重复应用 ⇒ 行数与内容不变；first_seen_at 不被刷新
//   - 缺失（§8.2）：本次未出现的行**置 missing_since**（已置位则保留原时刻），**从不删除**；
//     再次出现 ⇒ missing_since 置回 NULL
//   - 不越界（§8.3）：绝不写 model_catalog
//   - 可选描述字段（display_name/model_type/tags/vendor）：本次未提供时**保留旧值**
//     （用 COALESCE），避免"上游某次没带这个字段"把已有信息抹掉
func (store PostgresStore) ApplySync(ctx context.Context, channelID string, upstream []UpstreamModel) (SyncResult, error) {
	res := SyncResult{RawCount: len(upstream)}
	if channelID == "" {
		return res, errors.New("channel id is required")
	}
	// 注：上游端点映射表属于【同步记录】（ADR-004 §3.2 的 channel_model_syncs.endpoints），
	// 由 FinishSync 落库；本函数只负责供给池本身。

	tx, err := store.Pool.Begin(ctx)
	if err != nil {
		return res, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	seen := make([]string, 0, len(upstream))
	for _, u := range upstream {
		if u.ProviderModel == "" {
			return SyncResult{}, errors.New("provider_model is required")
		}
		seen = append(seen, u.ProviderModel)

		var inserted bool
		var priceChanged bool
		// xmax = 0 判定本次是 INSERT 还是 UPDATE（PostgreSQL 惯用法）
		// ★ 价格是否变化必须与【旧值】比较：RETURNING 看到的是更新后的行（恒等于新值），
		//   而 EXCLUDED 又不能出现在 RETURNING 里。故用 CTE 先取旧值 ——
		//   CTE 的快照是【语句开始时】的，所以 old 就是更新前的那一行。
		err := tx.QueryRow(ctx, `
			WITH old AS (
				SELECT pricing FROM channel_models
				WHERE channel_id = $1 AND provider_model = $2
			), up AS (
			INSERT INTO channel_models (channel_id, provider_model, display_name, model_type, tags,
				endpoint_types, vendor, raw, pricing, remote_created_at,
				first_seen_at, last_seen_at, missing_since)
			VALUES ($1,$2,NULLIF($3,''),NULLIF($4,''),NULLIF($5,''),
				COALESCE($6,'[]'::jsonb),NULLIF($7,''),COALESCE($8,'{}'::jsonb),
				COALESCE($9,'{}'::jsonb),$10, now(), now(), NULL)
			ON CONFLICT (channel_id, provider_model) DO UPDATE SET
				display_name      = COALESCE(EXCLUDED.display_name, channel_models.display_name),
				model_type        = COALESCE(EXCLUDED.model_type,   channel_models.model_type),
				tags              = COALESCE(EXCLUDED.tags,         channel_models.tags),
				vendor            = COALESCE(EXCLUDED.vendor,       channel_models.vendor),
				endpoint_types    = EXCLUDED.endpoint_types,
				raw               = EXCLUDED.raw,
				pricing           = EXCLUDED.pricing,
				remote_created_at = COALESCE(EXCLUDED.remote_created_at, channel_models.remote_created_at),
				last_seen_at      = now(),
				missing_since     = NULL
			RETURNING (xmax = 0) AS inserted, pricing
			)
			SELECT up.inserted, (old.pricing IS DISTINCT FROM up.pricing)
			FROM up LEFT JOIN old ON true`,
			channelID, u.ProviderModel, u.DisplayName, u.ModelType, u.Tags,
			u.EndpointTypes, u.Vendor, u.Raw, u.Pricing, u.RemoteCreatedAt).
			Scan(&inserted, &priceChanged)
		if err != nil {
			return SyncResult{}, err
		}
		if inserted {
			res.Added++
		} else {
			res.Updated++
		}
		if priceChanged && !inserted {
			res.PriceChanged++
		}
	}

	// 本次未出现的行：置 missing_since（已置位的保留原时刻），**不删除**
	tag, err := tx.Exec(ctx, `
		UPDATE channel_models SET missing_since = now()
		WHERE channel_id = $1 AND missing_since IS NULL AND NOT (provider_model = ANY($2::text[]))`,
		channelID, seen)
	if err != nil {
		return SyncResult{}, err
	}
	res.Missing = int(tag.RowsAffected())

	if err := tx.Commit(ctx); err != nil {
		return SyncResult{}, err
	}
	return res, nil
}

// StartSync 开一条 running 的同步记录，返回其 id。
func (store PostgresStore) StartSync(ctx context.Context, channelID string) (int64, error) {
	var id int64
	err := store.Pool.QueryRow(ctx,
		`INSERT INTO channel_model_syncs (channel_id, status) VALUES ($1, 'running') RETURNING id`,
		channelID).Scan(&id)
	return id, err
}

// FinishSync 收口一条同步记录。error 非空即视为 failed（§8.4：失败也要留痕）。
func (store PostgresStore) FinishSync(ctx context.Context, id int64, res SyncResult, endpoints, diff json.RawMessage, syncErr error) error {
	status := "succeeded"
	var errText *string
	if syncErr != nil {
		status = "failed"
		msg := syncErr.Error()
		errText = &msg
	}
	tag, err := store.Pool.Exec(ctx, `
		UPDATE channel_model_syncs SET
			finished_at = now(), status = $2,
			raw_count = $3, added = $4, updated = $5, missing = $6, price_changed = $7,
			endpoints = COALESCE($8, endpoints), diff = COALESCE($9, diff), error = $10
		WHERE id = $1`,
		id, status, res.RawCount, res.Added, res.Updated, res.Missing, res.PriceChanged,
		endpoints, diff, errText)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
