package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotMember = errors.New("workspace member not found")
	ErrNotFound  = errors.New("workspace not found")
)

type Member struct {
	WorkspaceID string `json:"workspace_id"`
	ActorID     string `json:"actor_id"`
	Role        string `json:"role"`
}

// WorkspaceInfo is the read-only workspace profile (TASK-SETTINGS-P3B).
type WorkspaceInfo struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

type Store struct{ Pool *pgxpool.Pool }

// Workspace returns the workspace profile (id/name/created_at) for the info card.
func (s Store) Workspace(ctx context.Context, workspaceID string) (WorkspaceInfo, error) {
	var w WorkspaceInfo
	err := s.Pool.QueryRow(ctx, `SELECT id, name, created_at FROM workspaces WHERE id=$1`, workspaceID).
		Scan(&w.ID, &w.Name, &w.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return WorkspaceInfo{}, ErrNotFound
	}
	return w, err
}

func (s Store) Members(ctx context.Context, workspaceID string) ([]Member, error) {
	rows, err := s.Pool.Query(ctx, `SELECT workspace_id, actor_id, role FROM workspace_members WHERE workspace_id=$1 ORDER BY actor_id`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Member, 0)
	for rows.Next() {
		var m Member
		if err := rows.Scan(&m.WorkspaceID, &m.ActorID, &m.Role); err != nil {
			return nil, err
		}
		items = append(items, m)
	}
	return items, rows.Err()
}

func (s Store) Authorize(ctx context.Context, workspaceID, actorID string) (Member, error) {
	var m Member
	err := s.Pool.QueryRow(ctx, `SELECT workspace_id, actor_id, role FROM workspace_members WHERE workspace_id=$1 AND actor_id=$2`, workspaceID, actorID).
		Scan(&m.WorkspaceID, &m.ActorID, &m.Role)
	if errors.Is(err, pgx.ErrNoRows) {
		return Member{}, ErrNotMember
	}
	return m, err
}
