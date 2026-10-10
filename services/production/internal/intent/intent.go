package intent

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

var (
	ErrInvalid             = errors.New("invalid generation intent")
	ErrIdempotencyConflict = errors.New("idempotency key reused with different input")
	ErrNotFound            = errors.New("generation intent not found")
)

var allowedKinds = map[string]struct{}{
	"split": {}, "interpret": {}, "image": {}, "video": {}, "audio": {}, "canvas_export": {},
}

type CreateInput struct {
	ProjectID  string          `json:"project_id"`
	EpisodeID  string          `json:"episode_id,omitempty"`
	AssetID    string          `json:"asset_id,omitempty"`
	Kind       string          `json:"kind"`
	Label      string          `json:"label"`
	Payload    json.RawMessage `json:"payload"`
	ScopeEpoch int             `json:"scope_epoch"`
}

type Intent struct {
	ID         string          `json:"id"`
	ProjectID  string          `json:"project_id"`
	EpisodeID  string          `json:"episode_id,omitempty"`
	AssetID    string          `json:"asset_id,omitempty"`
	Kind       string          `json:"kind"`
	Label      string          `json:"label"`
	Payload    json.RawMessage `json:"payload"`
	ScopeEpoch int             `json:"scope_epoch"`
	Status     string          `json:"status"`
	CreatedAt  time.Time       `json:"created_at"`
	UpdatedAt  time.Time       `json:"updated_at"`
}

func (in CreateInput) Validate() error {
	if strings.TrimSpace(in.ProjectID) == "" || strings.TrimSpace(in.Kind) == "" || strings.TrimSpace(in.Label) == "" {
		return ErrInvalid
	}
	if _, ok := allowedKinds[in.Kind]; !ok || len(in.Label) > 256 || in.ScopeEpoch < 0 {
		return ErrInvalid
	}
	if len(in.Payload) == 0 || len(in.Payload) > 512*1024 || !json.Valid(in.Payload) {
		return ErrInvalid
	}
	var object map[string]json.RawMessage
	if json.Unmarshal(in.Payload, &object) != nil || object == nil {
		return ErrInvalid
	}
	return nil
}

func (in CreateInput) RequestHash() string {
	b, _ := json.Marshal(struct {
		ProjectID, EpisodeID, AssetID, Kind, Label string
		Payload                                    json.RawMessage
		ScopeEpoch                                 int
	}{in.ProjectID, in.EpisodeID, in.AssetID, in.Kind, strings.TrimSpace(in.Label), in.Payload, in.ScopeEpoch})
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}
