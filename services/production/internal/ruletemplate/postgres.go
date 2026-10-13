package ruletemplate

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct {
	Pool *pgxpool.Pool
}

// List 列出所有规则模板（可按 kind 过滤）
func (store PostgresStore) List(ctx context.Context, workspace, kind string) ([]RuleTemplate, error) {
	var rows pgx.Rows
	var err error
	if kind != "" {
		rows, err = store.Pool.Query(ctx, `SELECT
			workspace_id, id, kind, name, description, stage, content, config,
			version, version_history, builtin, enabled, created_at, updated_at
			FROM rule_templates WHERE workspace_id = $1 AND kind = $2
			ORDER BY builtin DESC, created_at`, workspace, kind)
	} else {
		rows, err = store.Pool.Query(ctx, `SELECT
			workspace_id, id, kind, name, description, stage, content, config,
			version, version_history, builtin, enabled, created_at, updated_at
			FROM rule_templates WHERE workspace_id = $1
			ORDER BY kind, builtin DESC, created_at`, workspace)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var templates []RuleTemplate
	for rows.Next() {
		t, err := scanTemplate(rows)
		if err != nil {
			return nil, err
		}
		templates = append(templates, t)
	}
	return templates, rows.Err()
}

// Get 获取单个规则模板
func (store PostgresStore) Get(ctx context.Context, workspace, id string) (RuleTemplate, error) {
	row := store.Pool.QueryRow(ctx, `SELECT
		workspace_id, id, kind, name, description, stage, content, config,
		version, version_history, builtin, enabled, created_at, updated_at
		FROM rule_templates WHERE workspace_id = $1 AND id = $2`, workspace, id)
	t, err := scanTemplate(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return RuleTemplate{}, ErrNotFound
	}
	return t, err
}

// Create 创建规则模板
func (store PostgresStore) Create(ctx context.Context, workspace string, input CreateInput) (RuleTemplate, error) {
	if err := input.Validate(); err != nil {
		return RuleTemplate{}, err
	}
	config := input.Config
	if config == nil {
		config = map[string]interface{}{}
	}
	_, err := store.Pool.Exec(ctx, `INSERT INTO rule_templates
		(workspace_id, id, kind, name, description, stage, content, config, builtin, enabled)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		workspace, input.ID, input.Kind, input.Name, input.Description,
		input.Stage, input.Content, config, input.Builtin, input.Enabled)
	if err != nil {
		return RuleTemplate{}, err
	}
	return store.Get(ctx, workspace, input.ID)
}

// Update 更新规则模板（部分更新）
func (store PostgresStore) Update(ctx context.Context, workspace, id string, input UpdateInput) (RuleTemplate, error) {
	var sets []string
	var args []interface{}
	argIdx := 1

	// 动态 SET 白名单（BE-PGX-001）：列名仅来自下方 addSet("字面量", …) 硬编码调用，
	// 值全部 $N 参数化；禁止将请求体字段名拼入 col。
	addSet := func(col string, val interface{}) {
		sets = append(sets, fmt.Sprintf("%s = $%d", col, argIdx))
		args = append(args, val)
		argIdx++
	}

	if input.Name != nil {
		addSet("name", *input.Name)
	}
	if input.Description != nil {
		addSet("description", *input.Description)
	}
	if input.Stage != nil {
		addSet("stage", *input.Stage)
	}
	if input.Content != nil {
		addSet("content", *input.Content)
	}
	if input.Config != nil {
		addSet("config", *input.Config)
	}
	if input.Version != nil {
		addSet("version", *input.Version)
	}
	if input.VersionHistory != nil {
		addSet("version_history", *input.VersionHistory)
	}
	if input.Enabled != nil {
		addSet("enabled", *input.Enabled)
	}

	if len(sets) == 0 {
		return store.Get(ctx, workspace, id)
	}

	sets = append(sets, "updated_at = now()")
	args = append(args, workspace, id)

	query := fmt.Sprintf(`UPDATE rule_templates SET %s WHERE workspace_id = $%d AND id = $%d`,
		strings.Join(sets, ", "), argIdx, argIdx+1)

	cmdTag, err := store.Pool.Exec(ctx, query, args...)
	if err != nil {
		return RuleTemplate{}, err
	}
	if cmdTag.RowsAffected() == 0 {
		return RuleTemplate{}, ErrNotFound
	}
	return store.Get(ctx, workspace, id)
}

// Delete 删除规则模板
func (store PostgresStore) Delete(ctx context.Context, workspace, id string) error {
	cmdTag, err := store.Pool.Exec(ctx,
		`DELETE FROM rule_templates WHERE workspace_id = $1 AND id = $2`,
		workspace, id)
	if err != nil {
		return err
	}
	if cmdTag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func scanTemplate(row pgx.Row) (RuleTemplate, error) {
	var t RuleTemplate
	err := row.Scan(
		&t.WorkspaceID, &t.ID, &t.Kind, &t.Name, &t.Description, &t.Stage,
		&t.Content, &t.Config, &t.Version, &t.VersionHistory, &t.Builtin,
		&t.Enabled, &t.CreatedAt, &t.UpdatedAt,
	)
	return t, err
}
