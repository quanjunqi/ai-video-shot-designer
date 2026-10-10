package job

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound            = errors.New("job not found")
	ErrIdempotencyConflict = errors.New("idempotency key was used with a different request")
	ErrInvalidState        = errors.New("job is not in a mutable state")
)

type Store struct{ Pool *pgxpool.Pool }

type Input struct {
	ID, IdempotencyKey, Kind, Label       string
	IntentID                              string
	ProjectID, EpisodeID, AssetID, ShotID string
	ScopeEpoch                            int
	Steps                                 json.RawMessage
	IntentPayload                         json.RawMessage
	CostEstimate, ContextPath             string
}

type Job struct {
	ID            string          `json:"id"`
	IntentID      string          `json:"intent_id,omitempty"`
	ScopeEpoch    int             `json:"scope_epoch"`
	Kind          string          `json:"kind"`
	Label         string          `json:"label"`
	ProjectID     string          `json:"project_id,omitempty"`
	EpisodeID     string          `json:"episode_id,omitempty"`
	AssetID       string          `json:"asset_id,omitempty"`
	ShotID        string          `json:"shot_id,omitempty"`
	Status        string          `json:"status"`
	Progress      float64         `json:"progress"`
	Attempt       int             `json:"attempt"`
	Steps         json.RawMessage `json:"steps"`
	IntentPayload json.RawMessage `json:"intent_payload,omitempty"`
	CostEstimate  string          `json:"cost_estimate,omitempty"`
	Error         string          `json:"error,omitempty"`
	ContextPath   string          `json:"context_path,omitempty"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
	StartedAt     *time.Time      `json:"started_at,omitempty"`
	FinishedAt    *time.Time      `json:"finished_at,omitempty"`
}

func (s Store) Create(ctx context.Context, workspace, actor string, in Input) (Job, bool, error) {
	if strings.TrimSpace(in.Kind) == "" || strings.TrimSpace(in.Label) == "" || strings.TrimSpace(in.IdempotencyKey) == "" {
		return Job{}, false, errors.New("kind, label and idempotency_key are required")
	}
	id := strings.TrimSpace(in.ID)
	if id == "" {
		id = "job_" + randomID()
	}
	steps := in.Steps
	if len(steps) == 0 {
		steps = json.RawMessage(`[]`)
	}
	if !validSteps(steps) {
		return Job{}, false, errors.New("steps must be a JSON array")
	}
	intentPayload := in.IntentPayload
	if len(intentPayload) == 0 {
		intentPayload = json.RawMessage(`null`)
	}
	if !json.Valid(intentPayload) {
		return Job{}, false, errors.New("intent_payload must be valid JSON")
	}
	requestHash := hashInput(in, steps, intentPayload)
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Job{}, false, err
	}
	defer tx.Rollback(ctx)
	var out Job
	err = tx.QueryRow(ctx, `INSERT INTO jobs (workspace_id,id,idempotency_key,request_hash,intent_id,kind,label,project_id,episode_id,asset_id,shot_id,scope_epoch,steps,intent_payload,cost_estimate,context_path,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT DO NOTHING RETURNING id,intent_id,kind,label,project_id,episode_id,asset_id,shot_id,scope_epoch,status,progress,attempt,steps,intent_payload,cost_estimate,error,context_path,created_at,updated_at,started_at,finished_at`, workspace, id, in.IdempotencyKey, requestHash, in.IntentID, in.Kind, in.Label, in.ProjectID, in.EpisodeID, in.AssetID, in.ShotID, in.ScopeEpoch, steps, intentPayload, in.CostEstimate, in.ContextPath, actor).Scan(fields(&out)...)
	if errors.Is(err, pgx.ErrNoRows) {
		var hashID, existingHash string
		err = s.Pool.QueryRow(ctx, `SELECT id,request_hash FROM jobs WHERE workspace_id=$1 AND (idempotency_key=$2 OR ($3 <> '' AND intent_id=$3)) ORDER BY id LIMIT 1`, workspace, in.IdempotencyKey, in.IntentID).Scan(&hashID, &existingHash)
		if err != nil {
			return Job{}, false, err
		}
		if existingHash != "" && existingHash != requestHash {
			return Job{}, false, ErrIdempotencyConflict
		}
		out, err = s.Get(ctx, workspace, hashID)
		return out, true, err
	}
	if err != nil {
		return Job{}, false, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO job_attempts (workspace_id,job_id,attempt,status) VALUES ($1,$2,$3,'queued')`, workspace, out.ID, out.Attempt); err != nil {
		return Job{}, false, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Job{}, false, err
	}
	return out, false, nil
}

func (s Store) Get(ctx context.Context, workspace, id string) (Job, error) {
	var out Job
	err := s.Pool.QueryRow(ctx, `SELECT id,intent_id,kind,label,project_id,episode_id,asset_id,shot_id,scope_epoch,status,progress,attempt,steps,intent_payload,cost_estimate,error,context_path,created_at,updated_at,started_at,finished_at FROM jobs WHERE workspace_id=$1 AND id=$2`, workspace, id).Scan(fields(&out)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return Job{}, ErrNotFound
	}
	return out, err
}

func (s Store) List(ctx context.Context, workspace, status, kind string, limit int) ([]Job, error) {
	if limit < 1 || limit > 100 {
		limit = 50
	}
	rows, err := s.Pool.Query(ctx, `SELECT id,intent_id,kind,label,project_id,episode_id,asset_id,shot_id,scope_epoch,status,progress,attempt,steps,intent_payload,cost_estimate,error,context_path,created_at,updated_at,started_at,finished_at FROM jobs WHERE workspace_id=$1 AND ($2='' OR status=$2) AND ($3='' OR kind=$3) ORDER BY updated_at DESC,id DESC LIMIT $4`, workspace, status, kind, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Job{}
	for rows.Next() {
		var j Job
		if err := rows.Scan(fields(&j)...); err != nil {
			return nil, err
		}
		out = append(out, j)
	}
	return out, rows.Err()
}

func (s Store) Cancel(ctx context.Context, workspace, id string) (Job, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Job{}, err
	}
	defer tx.Rollback(ctx)
	var j Job
	err = tx.QueryRow(ctx, `UPDATE jobs SET status='cancelled',error='',finished_at=now(),updated_at=now() WHERE workspace_id=$1 AND id=$2 AND status IN ('queued','running') RETURNING id,intent_id,kind,label,project_id,episode_id,asset_id,shot_id,scope_epoch,status,progress,attempt,steps,intent_payload,cost_estimate,error,context_path,created_at,updated_at,started_at,finished_at`, workspace, id).Scan(fields(&j)...)
	if errors.Is(err, pgx.ErrNoRows) {
		existing, e := s.Get(ctx, workspace, id)
		if e != nil {
			return Job{}, e
		}
		if existing.Status == "cancelled" || existing.Status == "succeeded" || existing.Status == "failed" {
			return existing, nil
		}
		return Job{}, ErrInvalidState
	}
	if err != nil {
		return Job{}, err
	}
	if _, err = tx.Exec(ctx, `UPDATE job_attempts SET status='cancelled',finished_at=now() WHERE workspace_id=$1 AND job_id=$2 AND attempt=$3 AND status IN ('queued','running')`, workspace, id, j.Attempt); err != nil {
		return Job{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Job{}, err
	}
	return j, nil
}

func (s Store) Retry(ctx context.Context, workspace, id string) (Job, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Job{}, err
	}
	defer tx.Rollback(ctx)
	var j Job
	err = tx.QueryRow(ctx, `UPDATE jobs SET status='queued',progress=0,error='',attempt=attempt+1,finished_at=NULL,updated_at=now() WHERE workspace_id=$1 AND id=$2 AND status IN ('failed','cancelled') RETURNING id,intent_id,kind,label,project_id,episode_id,asset_id,shot_id,scope_epoch,status,progress,attempt,steps,intent_payload,cost_estimate,error,context_path,created_at,updated_at,started_at,finished_at`, workspace, id).Scan(fields(&j)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return Job{}, ErrInvalidState
	}
	if err != nil {
		return Job{}, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO job_attempts (workspace_id,job_id,attempt,status) VALUES ($1,$2,$3,'queued')`, workspace, id, j.Attempt); err != nil {
		return Job{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Job{}, err
	}
	return j, nil
}

// Advance is intentionally small and deterministic; a dedicated worker can replace it without changing the HTTP contract.
func (s Store) Advance(ctx context.Context, batch int) error {
	_, err := s.Pool.Exec(ctx, `WITH picked AS (SELECT workspace_id,id,attempt FROM jobs WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT $1) UPDATE jobs j SET status='running',started_at=COALESCE(j.started_at,now()),updated_at=now() FROM picked p WHERE j.workspace_id=p.workspace_id AND j.id=p.id`, batch)
	if err != nil {
		return err
	}
	_, err = s.Pool.Exec(ctx, `UPDATE job_attempts a SET status='running',started_at=COALESCE(a.started_at,now()) FROM jobs j WHERE a.workspace_id=j.workspace_id AND a.job_id=j.id AND a.attempt=j.attempt AND j.status='running' AND a.status='queued'`)
	return err
}

// Complete marks a job as succeeded or failed, with optional result payload and error.
func (s Store) Complete(ctx context.Context, id string, succeeded bool, resultPayload json.RawMessage, errMsg string) error {
	status := "succeeded"
	if !succeeded {
		status = "failed"
	}
	progress := 0.0
	if succeeded {
		progress = 100
	}
	// 只有当 resultPayload 非空时才更新 intent_payload，避免 COALESCE 边界问题
	if len(resultPayload) > 0 {
		// 使用 string 传递并显式转换为 jsonb，避免 pgx 驱动处理 []byte 时的编码问题
		payloadStr := string(resultPayload)
		tag, err := s.Pool.Exec(ctx, `UPDATE jobs SET status=$1,progress=$2,error=$3,intent_payload=$4::jsonb,finished_at=now(),updated_at=now() WHERE id=$5`, status, progress, errMsg, payloadStr, id)
		if err != nil {
			log.Printf("job store: Complete update error id=%s err=%v", id, err)
			return err
		}
		log.Printf("job store: Complete id=%s status=%s payloadLen=%d rowsAffected=%d", id, status, len(resultPayload), tag.RowsAffected())
		return nil
	}
	tag, err := s.Pool.Exec(ctx, `UPDATE jobs SET status=$1,progress=$2,error=$3,finished_at=now(),updated_at=now() WHERE id=$4`, status, progress, errMsg, id)
	if err == nil {
		log.Printf("job store: Complete id=%s status=%s (no payload) rowsAffected=%d", id, status, tag.RowsAffected())
	}
	return err
}

// ListRunning returns jobs currently in running state, for worker dispatch.
func (s Store) ListRunning(ctx context.Context, limit int) ([]Job, error) {
	rows, err := s.Pool.Query(ctx, `SELECT id,intent_id,kind,label,project_id,episode_id,asset_id,shot_id,scope_epoch,status,progress,attempt,steps,intent_payload,cost_estimate,error,context_path,created_at,updated_at,started_at,finished_at FROM jobs WHERE status='running' ORDER BY created_at LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Job
	for rows.Next() {
		var j Job
		if err := rows.Scan(fields(&j)...); err != nil {
			return nil, err
		}
		out = append(out, j)
	}
	return out, rows.Err()
}

func fields(j *Job) []any {
	return []any{&j.ID, &j.IntentID, &j.Kind, &j.Label, &j.ProjectID, &j.EpisodeID, &j.AssetID, &j.ShotID, &j.ScopeEpoch, &j.Status, &j.Progress, &j.Attempt, &j.Steps, &j.IntentPayload, &j.CostEstimate, &j.Error, &j.ContextPath, &j.CreatedAt, &j.UpdatedAt, &j.StartedAt, &j.FinishedAt}
}
func randomID() string { var b [12]byte; _, _ = rand.Read(b[:]); return hex.EncodeToString(b[:]) }

func validSteps(steps json.RawMessage) bool {
	if !json.Valid(steps) {
		return false
	}
	trimmed := strings.TrimSpace(string(steps))
	if len(trimmed) == 0 || trimmed[0] != '[' {
		return false
	}
	var items []json.RawMessage
	return json.Unmarshal(steps, &items) == nil
}

func hashInput(in Input, steps, intentPayload json.RawMessage) string {
	payload := struct {
		IntentID, Kind, Label, ProjectID, EpisodeID, AssetID, ShotID string
		ScopeEpoch                                                   int
		Steps                                                        json.RawMessage
		IntentPayload                                                json.RawMessage
		CostEstimate, ContextPath                                    string
	}{in.IntentID, in.Kind, in.Label, in.ProjectID, in.EpisodeID, in.AssetID, in.ShotID, in.ScopeEpoch, steps, intentPayload, in.CostEstimate, in.ContextPath}
	b, _ := json.Marshal(payload)
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}
