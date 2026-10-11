package store

import (
	"context"
	"time"
)

// UserChannel is a tenant-scoped channel definition created by the user
// (custom aggregator gateways etc). Builtin channels are NOT stored here.
//
// AuthHeader/AuthPrefix are the data-driven auth knobs (ADR-007 D2); they may
// be nil when the channel relies on the auth_type fallback mapping.
type UserChannel struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	Kind       string    `json:"kind"`
	Protocol   string    `json:"protocol"`
	BaseURL    string    `json:"baseUrl"`
	AuthType   string    `json:"authType"`
	AuthHeader *string   `json:"authHeader"`
	AuthPrefix *string   `json:"authPrefix"`
	Enabled    bool      `json:"enabled"`
	Note       string    `json:"note"`
	Sort       int       `json:"sort"`
	UpdatedAt  time.Time `json:"updatedAt"`
	// 同步配置（ADR-009 决定 2：跟着渠道走）。路径可空 ⇒ 用 *string（与 auth_header 同一处理）。
	SyncKind        string  `json:"syncKind"`
	SyncModelsPath  *string `json:"syncModelsPath"`
	SyncPricingPath *string `json:"syncPricingPath"`
	TrustNote       *string `json:"trustNote"`
}

const userChannelCols = `id, name, kind, protocol, base_url, auth_type, auth_header, auth_prefix, enabled, note, sort, updated_at, ` +
	`COALESCE(sync_kind, 'none'), sync_models_path, sync_pricing_path, trust_note`

// scanUserChannel scans the column list above. auth_header/auth_prefix are
// nullable text, so they must land in *string (pgx rejects NULL into string).
func scanUserChannel(row interface {
	Scan(dest ...any) error
}, c *UserChannel) error {
	return row.Scan(&c.ID, &c.Name, &c.Kind, &c.Protocol, &c.BaseURL, &c.AuthType, &c.AuthHeader, &c.AuthPrefix, &c.Enabled, &c.Note, &c.Sort, &c.UpdatedAt,
		&c.SyncKind, &c.SyncModelsPath, &c.SyncPricingPath, &c.TrustNote)
}

func (s Store) ListUserChannels(ctx context.Context, workspace string) ([]UserChannel, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT `+userChannelCols+` FROM user_channels WHERE workspace_id=$1 ORDER BY sort ASC, updated_at DESC`, workspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]UserChannel, 0)
	for rows.Next() {
		var c UserChannel
		if err := scanUserChannel(rows, &c); err != nil {
			return nil, err
		}
		items = append(items, c)
	}
	return items, rows.Err()
}

func (s Store) GetUserChannel(ctx context.Context, workspace, id string) (UserChannel, error) {
	var c UserChannel
	err := scanUserChannel(s.Pool.QueryRow(ctx,
		`SELECT `+userChannelCols+` FROM user_channels WHERE workspace_id=$1 AND id=$2`, workspace, id), &c)
	return c, err
}

func (s Store) UpsertUserChannel(ctx context.Context, workspace string, c UserChannel) (UserChannel, error) {
	err := scanUserChannel(s.Pool.QueryRow(ctx,
		`INSERT INTO user_channels (workspace_id, id, name, kind, protocol, base_url, auth_type, auth_header, auth_prefix, enabled, note, sort,
		    sync_kind, sync_models_path, sync_pricing_path, trust_note, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now())
		 ON CONFLICT (workspace_id, id) DO UPDATE SET
		   name=EXCLUDED.name, kind=EXCLUDED.kind, protocol=EXCLUDED.protocol,
		   base_url=EXCLUDED.base_url,
		   auth_type=EXCLUDED.auth_type,
		   auth_header=EXCLUDED.auth_header, auth_prefix=EXCLUDED.auth_prefix,
		   enabled=EXCLUDED.enabled, note=EXCLUDED.note,
		   sort=EXCLUDED.sort,
		   -- 同步配置随渠道一起整存（PUT 是整替换语义）⇒ 明确写，避免"忘了更新"静默保留旧值
		   sync_kind=EXCLUDED.sync_kind, sync_models_path=EXCLUDED.sync_models_path,
		   sync_pricing_path=EXCLUDED.sync_pricing_path, trust_note=EXCLUDED.trust_note,
		   updated_at=now()
		 RETURNING `+userChannelCols,
		workspace, c.ID, c.Name, c.Kind, c.Protocol, c.BaseURL, c.AuthType, c.AuthHeader, c.AuthPrefix, c.Enabled, c.Note, c.Sort,
		c.SyncKind, c.SyncModelsPath, c.SyncPricingPath, c.TrustNote), &c)
	return c, err
}

func (s Store) DeleteUserChannel(ctx context.Context, workspace, id string) error {
	_, err := s.Pool.Exec(ctx, `DELETE FROM user_channels WHERE workspace_id=$1 AND id=$2`, workspace, id)
	return err
}
