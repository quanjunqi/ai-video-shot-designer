package episode

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

// ListByProject 列出项目下的所有剧集
func (store PostgresStore) ListByProject(ctx context.Context, workspace, projectID string) ([]Episode, error) {
	rows, err := store.Pool.Query(ctx, `SELECT
		workspace_id, project_id, id, index, title, summary,
		source_span_start, source_span_end, stage, status, counts,
		blocked_by, script_checked, script_draft, interpretation,
		interpretation_confirmed, execution_target, stage_models,
		performance, scene_variants, directing, directing_step,
		executable_units, production, created_at, updated_at
		FROM episodes WHERE workspace_id = $1 AND project_id = $2
		ORDER BY index ASC`, workspace, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var episodes []Episode
	for rows.Next() {
		ep, err := scanEpisode(rows)
		if err != nil {
			return nil, err
		}
		episodes = append(episodes, ep)
	}
	return episodes, rows.Err()
}

// Get 获取单个剧集
func (store PostgresStore) Get(ctx context.Context, workspace, projectID, episodeID string) (Episode, error) {
	row := store.Pool.QueryRow(ctx, `SELECT
		workspace_id, project_id, id, index, title, summary,
		source_span_start, source_span_end, stage, status, counts,
		blocked_by, script_checked, script_draft, interpretation,
		interpretation_confirmed, execution_target, stage_models,
		performance, scene_variants, directing, directing_step,
		executable_units, production, created_at, updated_at
		FROM episodes WHERE workspace_id = $1 AND project_id = $2 AND id = $3`,
		workspace, projectID, episodeID)
	ep, err := scanEpisode(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Episode{}, ErrNotFound
	}
	return ep, err
}

// Create 创建剧集
func (store PostgresStore) Create(ctx context.Context, workspace, projectID string, input CreateInput) (Episode, error) {
	if err := input.Validate(); err != nil {
		return Episode{}, err
	}
	_, err := store.Pool.Exec(ctx, `INSERT INTO episodes
		(workspace_id, project_id, id, index, title, summary, source_span_start, source_span_end)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		workspace, projectID, input.ID, input.Index, input.Title,
		input.Summary, input.SourceSpanStart, input.SourceSpanEnd)
	if err != nil {
		return Episode{}, err
	}
	return store.Get(ctx, workspace, projectID, input.ID)
}

// Update 更新剧集（部分更新，只更新非 nil 字段）
func (store PostgresStore) Update(ctx context.Context, workspace, projectID, episodeID string, input UpdateInput) (Episode, error) {
	// 构建动态更新语句
	var sets []string
	var args []interface{}
	argIdx := 1

	addSet := func(col string, val interface{}) {
		sets = append(sets, fmt.Sprintf("%s = $%d", col, argIdx))
		args = append(args, val)
		argIdx++
	}

	if input.Title != nil {
		addSet("title", *input.Title)
	}
	if input.Summary != nil {
		addSet("summary", *input.Summary)
	}
	if input.SourceSpanStart != nil {
		addSet("source_span_start", *input.SourceSpanStart)
	}
	if input.SourceSpanEnd != nil {
		addSet("source_span_end", *input.SourceSpanEnd)
	}
	if input.Stage != nil {
		addSet("stage", *input.Stage)
	}
	if input.Status != nil {
		addSet("status", *input.Status)
	}
	if input.Counts != nil {
		addSet("counts", input.Counts)
	}
	if input.BlockedBy != nil {
		addSet("blocked_by", *input.BlockedBy)
	}
	if input.ScriptChecked != nil {
		addSet("script_checked", *input.ScriptChecked)
	}
	if input.ScriptDraft != nil {
		addSet("script_draft", *input.ScriptDraft)
	}
	if input.Interpretation != nil {
		addSet("interpretation", input.Interpretation)
	}
	if input.InterpretationConfirmed != nil {
		addSet("interpretation_confirmed", *input.InterpretationConfirmed)
	}
	if input.ExecutionTarget != nil {
		addSet("execution_target", input.ExecutionTarget)
	}
	if input.StageModels != nil {
		addSet("stage_models", input.StageModels)
	}
	if input.Performance != nil {
		addSet("performance", input.Performance)
	}
	if input.SceneVariants != nil {
		addSet("scene_variants", input.SceneVariants)
	}
	if input.Directing != nil {
		addSet("directing", input.Directing)
	}
	if input.DirectingStep != nil {
		addSet("directing_step", *input.DirectingStep)
	}
	if input.ExecutableUnits != nil {
		addSet("executable_units", input.ExecutableUnits)
	}
	if input.Production != nil {
		addSet("production", input.Production)
	}

	if len(sets) == 0 {
		return store.Get(ctx, workspace, projectID, episodeID)
	}

	sets = append(sets, fmt.Sprintf("updated_at = now()"))
	args = append(args, workspace, projectID, episodeID)

	query := fmt.Sprintf(`UPDATE episodes SET %s WHERE workspace_id = $%d AND project_id = $%d AND id = $%d`,
		strings.Join(sets, ", "), argIdx, argIdx+1, argIdx+2)

	cmdTag, err := store.Pool.Exec(ctx, query, args...)
	if err != nil {
		return Episode{}, err
	}
	if cmdTag.RowsAffected() == 0 {
		return Episode{}, ErrNotFound
	}
	return store.Get(ctx, workspace, projectID, episodeID)
}

// Delete 删除剧集
func (store PostgresStore) Delete(ctx context.Context, workspace, projectID, episodeID string) error {
	cmdTag, err := store.Pool.Exec(ctx,
		`DELETE FROM episodes WHERE workspace_id = $1 AND project_id = $2 AND id = $3`,
		workspace, projectID, episodeID)
	if err != nil {
		return err
	}
	if cmdTag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// scanEpisode 从行扫描 Episode
func scanEpisode(row pgx.Row) (Episode, error) {
	var ep Episode
	err := row.Scan(
		&ep.WorkspaceID, &ep.ProjectID, &ep.ID, &ep.Index, &ep.Title, &ep.Summary,
		&ep.SourceSpanStart, &ep.SourceSpanEnd, &ep.Stage, &ep.Status, &ep.Counts,
		&ep.BlockedBy, &ep.ScriptChecked, &ep.ScriptDraft, &ep.Interpretation,
		&ep.InterpretationConfirmed, &ep.ExecutionTarget, &ep.StageModels,
		&ep.Performance, &ep.SceneVariants, &ep.Directing, &ep.DirectingStep,
		&ep.ExecutableUnits, &ep.Production, &ep.CreatedAt, &ep.UpdatedAt,
	)
	return ep, err
}
