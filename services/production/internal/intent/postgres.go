package intent

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct{ Pool *pgxpool.Pool }

func (s PostgresStore) Create(ctx context.Context, workspace, actor, key string, in CreateInput) (Intent, bool, error) {
	if err := in.Validate(); err != nil {
		return Intent{}, false, err
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Intent{}, false, err
	}
	defer tx.Rollback(ctx)
	hash := in.RequestHash()
	var reserved string
	err = tx.QueryRow(ctx, `INSERT INTO generation_intent_requests (workspace_id, idempotency_key, request_sha256)
        VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING idempotency_key`, workspace, key, hash).Scan(&reserved)
	if errors.Is(err, pgx.ErrNoRows) {
		var previousHash, intentID string
		if err := tx.QueryRow(ctx, `SELECT request_sha256, intent_id FROM generation_intent_requests WHERE workspace_id=$1 AND idempotency_key=$2`, workspace, key).Scan(&previousHash, &intentID); err != nil {
			return Intent{}, false, err
		}
		if previousHash != hash {
			return Intent{}, false, ErrIdempotencyConflict
		}
		out, err := getWithQuery(ctx, tx, workspace, intentID)
		return out, true, err
	}
	if err != nil {
		return Intent{}, false, err
	}
	id, err := newID()
	if err != nil {
		return Intent{}, false, err
	}
	var out Intent
	err = tx.QueryRow(ctx, `INSERT INTO generation_intents
        (workspace_id,id,project_id,episode_id,asset_id,kind,label,payload,scope_epoch,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id,project_id,episode_id,asset_id,kind,label,payload,scope_epoch,status,created_at,updated_at`,
		workspace, id, in.ProjectID, in.EpisodeID, in.AssetID, in.Kind, in.Label, in.Payload, in.ScopeEpoch, actor).Scan(fields(&out)...)
	if err != nil {
		return Intent{}, false, err
	}
	eventPayload := map[string]any{"intent_id": out.ID, "project_id": out.ProjectID, "episode_id": out.EpisodeID, "asset_id": out.AssetID, "kind": out.Kind, "label": out.Label, "payload": json.RawMessage(out.Payload), "scope_epoch": out.ScopeEpoch}
	payloadBytes, err := json.Marshal(eventPayload)
	if err != nil {
		return Intent{}, false, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO outbox_events (workspace_id,actor_id,aggregate_id,event_type,payload) VALUES ($1,$2,$3,'generation.intent.created',$4)`, workspace, actor, out.ID, payloadBytes); err != nil {
		return Intent{}, false, err
	}
	if _, err = tx.Exec(ctx, `UPDATE generation_intent_requests SET intent_id=$3 WHERE workspace_id=$1 AND idempotency_key=$2`, workspace, key, out.ID); err != nil {
		return Intent{}, false, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Intent{}, false, err
	}
	return out, false, nil
}

func (s PostgresStore) Get(ctx context.Context, workspace, id string) (Intent, error) {
	return getWithQuery(ctx, s.Pool, workspace, id)
}

type rowQuerier interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func getWithQuery(ctx context.Context, q rowQuerier, workspace, id string) (Intent, error) {
	var out Intent
	err := q.QueryRow(ctx, `SELECT id,project_id,episode_id,asset_id,kind,label,payload,scope_epoch,status,created_at,updated_at FROM generation_intents WHERE workspace_id=$1 AND id=$2`, workspace, id).Scan(fields(&out)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return Intent{}, ErrNotFound
	}
	return out, err
}

func fields(i *Intent) []any {
	return []any{&i.ID, &i.ProjectID, &i.EpisodeID, &i.AssetID, &i.Kind, &i.Label, &i.Payload, &i.ScopeEpoch, &i.Status, &i.CreatedAt, &i.UpdatedAt}
}

func newID() (string, error) {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("generate intent ID: %w", err)
	}
	return "intent_" + hex.EncodeToString(raw[:]), nil
}
