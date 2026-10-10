package project

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct {
	Pool *pgxpool.Pool
}

func (store PostgresStore) Create(ctx context.Context, workspace, actor, key string, input CreateInput) (Project, bool, error) {
	tx, err := store.Pool.Begin(ctx)
	if err != nil {
		return Project{}, false, err
	}
	defer tx.Rollback(ctx)

	hash := input.RequestHash()
	var reserved string
	err = tx.QueryRow(ctx, `INSERT INTO project_creation_requests (workspace_id, idempotency_key, request_sha256)
        VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING idempotency_key`, workspace, key, hash).Scan(&reserved)
	if errors.Is(err, pgx.ErrNoRows) {
		var previousHash, projectID string
		if err := tx.QueryRow(ctx, `SELECT request_sha256, project_id FROM project_creation_requests
            WHERE workspace_id = $1 AND idempotency_key = $2`, workspace, key).Scan(&previousHash, &projectID); err != nil {
			return Project{}, false, err
		}
		if previousHash != hash {
			return Project{}, false, ErrIdempotencyConflict
		}
		result, err := getWithQuery(ctx, tx, workspace, projectID)
		return result, true, err
	}
	if err != nil {
		return Project{}, false, err
	}

	id, err := newID()
	if err != nil {
		return Project{}, false, err
	}
	title := strings.TrimSpace(input.Title)
	sourceHash := SHA256([]byte(input.SourceText))
	_, err = tx.Exec(ctx, `INSERT INTO projects
        (workspace_id, id, title, style_id, style_version, aspect_ratio,
         default_text_model, default_image_model, default_video_model, status, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending_parse',$10)`, workspace, id, title,
		input.StyleID, input.StyleVersion, input.AspectRatio, input.DefaultTextModel, input.DefaultImageModel, input.DefaultVideoModel, actor)
	if err != nil {
		return Project{}, false, err
	}
	_, err = tx.Exec(ctx, `INSERT INTO source_versions
        (workspace_id, project_id, version, content, sha256, created_by)
        VALUES ($1,$2,1,$3,$4,$5)`, workspace, id, input.SourceText, sourceHash, actor)
	if err != nil {
		return Project{}, false, err
	}
	_, err = tx.Exec(ctx, `UPDATE project_creation_requests SET project_id = $3
        WHERE workspace_id = $1 AND idempotency_key = $2`, workspace, key, id)
	if err != nil {
		return Project{}, false, err
	}
	result, err := getWithQuery(ctx, tx, workspace, id)
	if err != nil {
		return Project{}, false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Project{}, false, err
	}
	return result, false, nil
}

func (store PostgresStore) Get(ctx context.Context, workspace, id string) (Project, error) {
	return getWithQuery(ctx, store.Pool, workspace, id)
}

// Update 部分更新项目设置（title/style/aspect_ratio/default_*_model）。
// 只更新非 nil 字段，updated_at 自动推进。
func (store PostgresStore) Update(ctx context.Context, workspace, id string, input UpdateInput) (Project, error) {
	if err := input.Validate(); err != nil {
		return Project{}, err
	}
	tx, err := store.Pool.Begin(ctx)
	if err != nil {
		return Project{}, err
	}
	defer tx.Rollback(ctx)

	// 动态构建 SET 子句：只包含非 nil 字段
	sets := []string{"updated_at = now()"}
	args := []any{workspace, id}
	argIdx := 3
	if input.Title != nil {
		sets = append(sets, "title = $"+itoa(argIdx))
		args = append(args, strings.TrimSpace(*input.Title))
		argIdx++
	}
	if input.StyleID != nil {
		sets = append(sets, "style_id = $"+itoa(argIdx))
		args = append(args, *input.StyleID)
		argIdx++
	}
	if input.StyleVersion != nil {
		sets = append(sets, "style_version = $"+itoa(argIdx))
		args = append(args, *input.StyleVersion)
		argIdx++
	}
	if input.AspectRatio != nil {
		sets = append(sets, "aspect_ratio = $"+itoa(argIdx))
		args = append(args, *input.AspectRatio)
		argIdx++
	}
	if input.DefaultTextModel != nil {
		sets = append(sets, "default_text_model = $"+itoa(argIdx))
		args = append(args, *input.DefaultTextModel)
		argIdx++
	}
	if input.DefaultImageModel != nil {
		sets = append(sets, "default_image_model = $"+itoa(argIdx))
		args = append(args, *input.DefaultImageModel)
		argIdx++
	}
	if input.DefaultVideoModel != nil {
		sets = append(sets, "default_video_model = $"+itoa(argIdx))
		args = append(args, *input.DefaultVideoModel)
		argIdx++
	}

	query := `UPDATE projects SET ` + strings.Join(sets, ", ") + ` WHERE workspace_id = $1 AND id = $2`
	tag, err := tx.Exec(ctx, query, args...)
	if err != nil {
		return Project{}, err
	}
	if tag.RowsAffected() == 0 {
		return Project{}, ErrNotFound
	}
	if err := tx.Commit(ctx); err != nil {
		return Project{}, err
	}
	return getWithQuery(ctx, store.Pool, workspace, id)
}

func itoa(n int) string { return strconv.Itoa(n) }

// Delete 删除项目及其全部子表数据（事务）。
// 顺序必须为「先子表后父表」：generation_intents / project_creation_requests / source_versions
// 均无 ON DELETE CASCADE，且 source_versions 的 immutable 触发器在迁移 015 后仅拦截 UPDATE，
// DELETE 仅用于本清理路径（版本追加不可变语义不受影响）。
func (store PostgresStore) Delete(ctx context.Context, workspace, id string) error {
	tx, err := store.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM generation_intents WHERE workspace_id = $1 AND project_id = $2`, workspace, id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM project_creation_requests WHERE workspace_id = $1 AND project_id = $2`, workspace, id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM source_versions WHERE workspace_id = $1 AND project_id = $2`, workspace, id); err != nil {
		return err
	}
	tag, err := tx.Exec(ctx, `DELETE FROM projects WHERE workspace_id = $1 AND id = $2`, workspace, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return tx.Commit(ctx)
}

func (store PostgresStore) List(ctx context.Context, workspace string, limit int) (ListResult, error) {
	if limit < 1 || limit > 100 {
		limit = 50
	}
	rows, err := store.Pool.Query(ctx, `SELECT p.id, p.title, p.style_id, p.style_version, p.aspect_ratio,
        p.default_text_model, p.default_image_model, p.default_video_model, p.status, s.version, s.sha256,
        s.created_at, p.created_at, p.updated_at
        FROM projects p JOIN source_versions s
          ON s.workspace_id = p.workspace_id AND s.project_id = p.id AND s.version = p.current_source_version
        WHERE p.workspace_id = $1 ORDER BY p.updated_at DESC, p.id DESC LIMIT $2`, workspace, limit)
	if err != nil {
		return ListResult{}, err
	}
	defer rows.Close()
	result := ListResult{Items: make([]Project, 0)}
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.Title, &p.StyleID, &p.StyleVersion, &p.AspectRatio,
			&p.DefaultTextModel, &p.DefaultImageModel, &p.DefaultVideoModel, &p.Status, &p.CurrentSourceVersion,
			&p.SourceVersion.SHA256, &p.SourceVersion.CreatedAt, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return ListResult{}, err
		}
		p.SourceVersion.Version = p.CurrentSourceVersion
		result.Items = append(result.Items, p)
	}
	return result, rows.Err()
}

type rowQuerier interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func getWithQuery(ctx context.Context, query rowQuerier, workspace, id string) (Project, error) {
	var p Project
	err := query.QueryRow(ctx, `SELECT p.id, p.title, p.style_id, p.style_version, p.aspect_ratio,
        p.default_text_model, p.default_image_model, p.default_video_model, p.status, s.version, s.sha256,
        s.created_at, p.created_at, p.updated_at, s.content
        FROM projects p JOIN source_versions s
          ON s.workspace_id = p.workspace_id AND s.project_id = p.id AND s.version = p.current_source_version
        WHERE p.workspace_id = $1 AND p.id = $2`, workspace, id).Scan(
		&p.ID, &p.Title, &p.StyleID, &p.StyleVersion, &p.AspectRatio,
		&p.DefaultTextModel, &p.DefaultImageModel, &p.DefaultVideoModel, &p.Status, &p.CurrentSourceVersion,
		&p.SourceVersion.SHA256, &p.SourceVersion.CreatedAt, &p.CreatedAt, &p.UpdatedAt, &p.SourceText)
	if errors.Is(err, pgx.ErrNoRows) {
		return Project{}, ErrNotFound
	}
	p.SourceVersion.Version = p.CurrentSourceVersion
	return p, err
}

func newID() (string, error) {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("generate project ID: %w", err)
	}
	raw[6] = (raw[6] & 0x0f) | 0x40
	raw[8] = (raw[8] & 0x3f) | 0x80
	return "proj_" + hex.EncodeToString(raw[:]), nil
}
