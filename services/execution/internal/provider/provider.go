// Package provider routes execution to model-channel adapters.
//
// Routing model: a job's video/image/text model resolves through the model
// directory (production: channels + model_catalog). The channel_id selects an
// adapter (jimeng / minimax / grsai / google / openai / comfy); the adapter
// then needs tenant credentials from the workspace credential store.
//
// Skeleton phase: adapters are declared and routing is tested, but there are
// no real HTTP clients yet. Without credentials every adapter returns
// ErrCredentialsNotConfigured with a clear reason — execution must never fake
// a dispatch. Real auth lands after channel keys are injected (workspace
// encrypted credential store).
package provider

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrCredentialsNotConfigured = errors.New("provider: credentials not configured for channel")
	ErrUnsupportedChannel       = errors.New("provider: unsupported channel")
	ErrUnsupportedModelType     = errors.New("provider: unsupported model type")
)

// CapabilitySnapshot is the routed execution contract for one unit/job:
// which channel owns the model and which model family/name was locked.
type CapabilitySnapshot struct {
	ChannelID  string `json:"channelId"`
	Family     string `json:"family"`
	ModelName  string `json:"modelName"`
	Type       string `json:"type"` // text | image | video
	MaxSeconds int    `json:"maxSeconds,omitempty"`
}

// Credentials are the tenant-scoped channel connection info. The workspace
// credential store must never hand out raw secrets in plain text responses;
// this struct is only materialized inside the adapter process boundary.
type Credentials struct {
	BaseURL string
	APIKey  string
	Auth    string // bearer | apikey | sign | none
}

// CredentialStore resolves tenant credentials for a channel.
type CredentialStore interface {
	Lookup(workspaceID, channelID string) (Credentials, error)
}

// Result is the adapter poll outcome for one remote generation.
type Result struct {
	Done      bool   `json:"done"`
	Error     string `json:"error,omitempty"`
	ObjectKey string `json:"objectKey,omitempty"`
}

// Provider is the adapter interface for a model channel. In skeleton phase
// Generate/Poll return ErrCredentialsNotConfigured until real auth lands.
type Provider interface {
	ChannelID() string
	Supports(modelType string) bool
	Generate(ctx context.Context, snapshot CapabilitySnapshot, creds Credentials) (string, error)
	Poll(ctx context.Context, remoteRef string) (Result, error)
}

// Resolver picks the adapter for a directory snapshot. It owns the channel_id
// → adapter mapping so the rest of execution never switches on channel names.
type Resolver struct {
	adapters map[string]Provider
}

func NewResolver(adapters ...Provider) *Resolver {
	m := make(map[string]Provider, len(adapters))
	for _, p := range adapters {
		if p != nil {
			m[p.ChannelID()] = p
		}
	}
	return &Resolver{adapters: m}
}

func (r *Resolver) Resolve(snapshot CapabilitySnapshot) (Provider, error) {
	if snapshot.Type != "text" && snapshot.Type != "image" && snapshot.Type != "video" {
		return nil, fmt.Errorf("%w: %q", ErrUnsupportedModelType, snapshot.Type)
	}
	p, ok := r.adapters[snapshot.ChannelID]
	if !ok {
		return nil, fmt.Errorf("%w: %q", ErrUnsupportedChannel, snapshot.ChannelID)
	}
	if !p.Supports(snapshot.Type) {
		return nil, fmt.Errorf("%w: %q for channel %q", ErrUnsupportedModelType, snapshot.Type, snapshot.ChannelID)
	}
	return p, nil
}

// KnownChannelIDs mirrors the seeded production model_channels for validation.
var KnownChannelIDs = []string{"jimeng", "minimax", "grsai", "google", "openai", "comfy"}

func IsKnownChannel(id string) bool {
	for _, c := range KnownChannelIDs {
		if strings.EqualFold(c, id) {
			return true
		}
	}
	return false
}
