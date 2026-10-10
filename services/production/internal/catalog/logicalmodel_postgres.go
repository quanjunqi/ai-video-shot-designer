package catalog

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// logicalModelColumns：logical_models 的读取列（顺序与 scanLogicalModel 一致）。
const logicalModelColumns = `id, label, type, capability, status, sort, note, created_by, created_at, updated_at`

// Candidate 的 logical_model_id 需要区分「已绑定」与「NULL（未纳入路由）」，
// 故这一列扫进 **string（pgx 用 PointerPointerScanPlan 处理 NULL → nil）。
//
// 注意：pgx 的 text 编解码器**在解码前**就拒绝 NULL 扫入 *string，
// 因此 COALESCE 护不住 NULL —— 可空列必须用 **string 或 pgtype 类型。
const candidateColumns = `id, logical_model_id, name, family, channel_id, provider_model, type, status, route_priority`

func scanLogicalModel(row pgx.Row) (LogicalModel, error) {
	var model LogicalModel
	var capability, note, createdBy *string
	err := row.Scan(&model.ID, &model.Label, &model.Type, &capability, &model.Status, &model.Sort,
		&note, &createdBy, &model.CreatedAt, &model.UpdatedAt)
	if err != nil {
		return model, err
	}
	model.Capability = derefString(capability)
	model.Note = derefString(note)
	model.CreatedBy = derefString(createdBy)
	return model, nil
}

func scanCandidate(row pgx.Row) (Candidate, error) {
	var candidate Candidate
	var logicalModelID *string
	err := row.Scan(&candidate.ID, &logicalModelID, &candidate.Name, &candidate.Family,
		&candidate.ChannelID, &candidate.ProviderModel, &candidate.Type, &candidate.Status, &candidate.RoutePriority)
	if err != nil {
		return candidate, err
	}
	candidate.LogicalModelID = derefString(logicalModelID)
	return candidate, nil
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func (store PostgresStore) ListLogicalModels(ctx context.Context, status, modelType string) ([]LogicalModel, error) {
	rows, err := store.Pool.Query(ctx, `SELECT `+logicalModelColumns+` FROM logical_models
        WHERE ($1 = '' OR status = $1) AND ($2 = '' OR type = $2)
        ORDER BY sort, id`, status, modelType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	models := make([]LogicalModel, 0, 16)
	for rows.Next() {
		model, err := scanLogicalModel(rows)
		if err != nil {
			return nil, err
		}
		models = append(models, model)
	}
	return models, rows.Err()
}

func (store PostgresStore) GetLogicalModel(ctx context.Context, id string) (LogicalModel, error) {
	model, err := scanLogicalModel(store.Pool.QueryRow(ctx,
		`SELECT `+logicalModelColumns+` FROM logical_models WHERE id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return LogicalModel{}, ErrNotFound
	}
	return model, err
}

func (store PostgresStore) CreateLogicalModel(ctx context.Context, actor string, input LogicalModelCreate) (LogicalModel, error) {
	if err := input.Validate(); err != nil {
		return LogicalModel{}, err
	}
	status := input.Status
	if status == "" {
		status = "enabled"
	}
	sort := defaultLogicalModelSort
	if input.Sort != nil {
		sort = *input.Sort
	}
	// 单行插入自带事务语义，无需显式 BEGIN。
	row := store.Pool.QueryRow(ctx, `INSERT INTO logical_models (id, label, type, capability, status, sort, note, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING `+logicalModelColumns,
		input.ID, input.Label, input.Type, nullableString(input.Capability), status, sort, input.Note, actor)
	model, err := scanLogicalModel(row)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return LogicalModel{}, ErrDuplicate
		}
		return LogicalModel{}, err
	}
	return model, nil
}

func (store PostgresStore) UpdateLogicalModel(ctx context.Context, id string, patch LogicalModelPatch) (LogicalModel, error) {
	// id 不可修改：请求体带 id 即拒绝（路径 id 与请求体 id 的比较在 handler 完成，
	// 这里再兜一层，防止其它调用方绕过 HTTP 契约）。
	if err := patch.Validate(); err != nil {
		return LogicalModel{}, err
	}
	// 显式 NULL / 显式置零 都必须与「未提供」区分，故一律用指针传参；
	// 参数里可能是 NULL，必须显式 ::text / ::integer 让 PG 能推断类型。
	var capability *string
	if patch.Capability != nil && *patch.Capability != "" {
		capability = patch.Capability
	}
	row := store.Pool.QueryRow(ctx, `UPDATE logical_models SET
            label       = COALESCE($2::text, label),
            type        = COALESCE($3::text, type),
            capability  = CASE WHEN $4::boolean THEN $5::text ELSE capability END,
            status      = COALESCE($6::text, status),
            sort        = COALESCE($7::integer, sort),
            note        = CASE WHEN $8::boolean THEN $9::text ELSE note END,
            updated_at  = now()
        WHERE id = $1
        RETURNING `+logicalModelColumns,
		id, patch.Label, patch.Type, patch.Capability != nil, capability, patch.Status, patch.Sort, patch.Note != nil, patch.Note)
	model, err := scanLogicalModel(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return LogicalModel{}, ErrNotFound
	}
	return model, err
}

// ListCandidates 返回该逻辑模型下的候选行，按 route_priority 升序（小者优先）。
// 逻辑模型不存在时返回 ErrNotFound，避免把「空候选」与「不存在」混为一谈。
func (store PostgresStore) ListCandidates(ctx context.Context, logicalModelID string) ([]Candidate, error) {
	if _, err := store.GetLogicalModel(ctx, logicalModelID); err != nil {
		return nil, err
	}
	rows, err := store.Pool.Query(ctx, `SELECT `+candidateColumns+` FROM model_catalog
        WHERE logical_model_id = $1 ORDER BY route_priority, id`, logicalModelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	candidates := make([]Candidate, 0, 8)
	for rows.Next() {
		candidate, err := scanCandidate(rows)
		if err != nil {
			return nil, err
		}
		candidates = append(candidates, candidate)
	}
	return candidates, rows.Err()
}

// BindCandidates 把给定 model_catalog 行设为该逻辑模型的候选。
// **只写 logical_model_id 与 route_priority 两列**，其余列一律不动。
// 全流程在单事务内完成（检查 + 多行更新必须原子）。
func (store PostgresStore) BindCandidates(ctx context.Context, logicalModelID string, input BindCandidatesInput) ([]Candidate, error) {
	if err := input.Validate(); err != nil {
		return nil, err
	}
	modelIDs := uniqueModelIDs(input.ModelIDs)
	priority := input.routePriority()
	tx, err := store.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var exists bool
	if err := tx.QueryRow(ctx, `SELECT true FROM logical_models WHERE id = $1`, logicalModelID).Scan(&exists); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	// 先确认全部行存在，再检查归属冲突，最后才写 —— 顺序保证错误信息确定且无部分写入。
	// FOR UPDATE：对候选行加锁，避免两个并发绑定请求同时通过归属检查、
	// 结果后者静默改写前者的绑定（这正是「不静默抢占」要防的情况）。
	rows, err := tx.Query(ctx, `SELECT id, logical_model_id FROM model_catalog WHERE id = ANY($1) FOR UPDATE`, modelIDs)
	if err != nil {
		return nil, err
	}
	present := make(map[string]string, len(modelIDs))
	for rows.Next() {
		var modelID string
		var owner *string
		if err := rows.Scan(&modelID, &owner); err != nil {
			rows.Close()
			return nil, err
		}
		present[modelID] = derefString(owner)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	missing := make([]string, 0, len(modelIDs))
	conflicts := make([]ErrModelBoundElsewhere, 0, len(modelIDs))
	for _, modelID := range modelIDs {
		owner, ok := present[modelID]
		switch {
		case !ok:
			missing = append(missing, modelID)
		case owner != "" && owner != logicalModelID:
			conflicts = append(conflicts, ErrModelBoundElsewhere{ModelID: modelID, LogicalModelID: owner})
		}
	}
	if len(missing) > 0 {
		return nil, ErrModelNotFound{ModelIDs: missing}
	}
	if len(conflicts) > 0 {
		return nil, ErrModelsBoundElsewhere(conflicts)
	}

	if _, err := tx.Exec(ctx, `UPDATE model_catalog SET logical_model_id = $2, route_priority = $3 WHERE id = ANY($1)`,
		modelIDs, logicalModelID, priority); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return store.ListCandidates(ctx, logicalModelID)
}

// UnbindCandidate 解绑：置 logical_model_id = NULL，**不删除** model_catalog 行。
func (store PostgresStore) UnbindCandidate(ctx context.Context, logicalModelID, modelID string) error {
	tx, err := store.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var exists bool
	if err := tx.QueryRow(ctx, `SELECT true FROM logical_models WHERE id = $1`, logicalModelID).Scan(&exists); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	var owner *string
	if err := tx.QueryRow(ctx, `SELECT logical_model_id FROM model_catalog WHERE id = $1 FOR UPDATE`, modelID).Scan(&owner); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrModelNotFound{ModelIDs: []string{modelID}}
		}
		return err
	}
	if owner == nil {
		return ErrModelNotCandidate{ModelID: modelID}
	}
	if *owner != logicalModelID {
		return ErrModelBoundElsewhere{ModelID: modelID, LogicalModelID: *owner}
	}
	if _, err := tx.Exec(ctx, `UPDATE model_catalog SET logical_model_id = NULL WHERE id = $1`, modelID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ErrModelNotFound：请求里的 model_catalog id 不存在（错误信息必须点名是哪个）。
type ErrModelNotFound struct {
	ModelIDs []string
}

func (e ErrModelNotFound) Error() string {
	return "catalog: model not found: " + strings.Join(e.ModelIDs, ", ")
}

// ErrModelNotCandidate：行存在，但当前不属于该逻辑模型（没有可解绑的绑定）。
type ErrModelNotCandidate struct {
	ModelID string
}

func (e ErrModelNotCandidate) Error() string {
	return "catalog: model " + e.ModelID + " is not a candidate of this logical model"
}

// ErrModelsBoundElsewhereList：一次请求里多个候选行被别的逻辑模型占用。
type ErrModelsBoundElsewhereList struct {
	Conflicts []ErrModelBoundElsewhere
}

func ErrModelsBoundElsewhere(conflicts []ErrModelBoundElsewhere) ErrModelsBoundElsewhereList {
	return ErrModelsBoundElsewhereList{Conflicts: conflicts}
}

func (e ErrModelsBoundElsewhereList) Error() string {
	messages := make([]string, 0, len(e.Conflicts))
	for _, conflict := range e.Conflicts {
		messages = append(messages, conflict.Error())
	}
	return strings.Join(messages, "; ")
}

func (e ErrModelsBoundElsewhereList) Unwrap() []error {
	errs := make([]error, 0, len(e.Conflicts))
	for _, conflict := range e.Conflicts {
		errs = append(errs, conflict)
	}
	return errs
}
