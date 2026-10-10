// Package engine defines the unified Executor interface for model execution.
//
// Three executor types are supported:
//   - APIConnector: HTTP API calls (transit/official APIs)
//   - ComfyUIAgent: local ComfyUI via outbound connection
//   - CloudRunner: cloud ComfyUI via GPU pool
//
// All executors implement the same interface, allowing the gateway to route
// requests uniformly regardless of backend type.
package engine

import (
	"context"
	"time"
)

// ExecutorType identifies the backend execution type.
type ExecutorType string

const (
	// ExecutorTypeAPI calls HTTP APIs (transit/official).
	ExecutorTypeAPI ExecutorType = "api"
	// ExecutorTypeComfyUILocal connects to a locally running ComfyUI instance.
	ExecutorTypeComfyUILocal ExecutorType = "comfyui-local"
	// ExecutorTypeComfyUICloud submits to a cloud ComfyUI GPU pool.
	ExecutorTypeComfyUICloud ExecutorType = "comfyui-cloud"
)

// TaskStatus represents the lifecycle state of an execution task.
type TaskStatus string

const (
	TaskStatusQueued    TaskStatus = "queued"
	TaskStatusRunning   TaskStatus = "running"
	TaskStatusSucceeded TaskStatus = "succeeded"
	TaskStatusFailed    TaskStatus = "failed"
	TaskStatusCancelled TaskStatus = "cancelled"
	TaskStatusTimeout   TaskStatus = "timeout"
)

// IsTerminal returns true if the status is a final state.
func (s TaskStatus) IsTerminal() bool {
	return s == TaskStatusSucceeded || s == TaskStatusFailed ||
		s == TaskStatusCancelled || s == TaskStatusTimeout
}

// ExecutorRequest is the unified input for all executor types.
type ExecutorRequest struct {
	// Model identification
	ModelID       string
	ProviderModel string
	ChannelID     string

	// Execution mode: text-chat, text-to-image, image-to-image, text-to-video, etc.
	Mode string

	// Modality: text, image, video, audio
	Modality string

	// Input parameters (prompt, reference_images, etc.)
	Input map[string]any

	// Model-specific parameters (aspect_ratio, n, seed, etc.)
	Parameters map[string]any

	// Protocol template capabilities (for parameter mapping)
	Capabilities []byte

	// Protocol template config (for API connector)
	ProtocolTemplate Template

	// Model-level params overrides
	ModelParams []Param

	// Model-level request path override
	ModelRequestPath string

	// Async flag: if true, use async submit+poll; if false, sync call
	Async bool

	// Timeout for the entire execution
	Timeout time.Duration

	// Metadata for audit and tracing
	Metadata map[string]any
}

// ExecutorResult is the unified output from all executor types.
type ExecutorResult struct {
	// Task identification
	TaskID         string
	ProviderTaskID string
	Status         TaskStatus

	// Extracted output fields (mapped by protocol template)
	Extracted map[string]any

	// Raw response body (for diagnosis)
	RawBody string

	// HTTP status code (for API connector)
	HTTPStatus int

	// Error message if failed
	Error string

	// Timing
	Duration    time.Duration
	SubmittedAt time.Time
	CompletedAt *time.Time

	// Token usage (if available)
	TokenInput  int
	TokenOutput int
	TokenCached int

	// Cost (if available)
	CostAmount   float64
	CostCurrency string
}

// Executor is the unified interface for all model execution backends.
type Executor interface {
	// Type returns the executor type.
	Type() ExecutorType

	// Submit sends the request to the backend and returns immediately with a task ID.
	// For sync executors, this may block until completion and return the result.
	Submit(ctx context.Context, req ExecutorRequest) (ExecutorResult, error)

	// Poll queries the backend for the current status of an async task.
	// Returns the current result; caller should check Status.IsTerminal().
	Poll(ctx context.Context, taskID string, req ExecutorRequest) (ExecutorResult, error)

	// Cancel requests cancellation of an async task.
	// Not all backends support cancellation; unsupported returns ErrCancelUnsupported.
	Cancel(ctx context.Context, taskID string, req ExecutorRequest) error

	// GetResult returns the final result of a completed task.
	// Only valid after Poll returns a terminal status.
	GetResult(ctx context.Context, taskID string, req ExecutorRequest) (ExecutorResult, error)
}

// ExecutorConfig holds configuration for creating executors.
type ExecutorConfig struct {
	Type        ExecutorType
	Credentials Credentials
	HTTPClient  interface{} // *http.Client for API connector
	// ComfyUI-specific config (added later)
	ComfyUIEndpoint string
}

// NewExecutor creates an executor of the given type.
func NewExecutor(cfg ExecutorConfig) (Executor, error) {
	switch cfg.Type {
	case ExecutorTypeAPI:
		return NewAPIConnector(cfg), nil
	case ExecutorTypeComfyUILocal:
		return nil, ErrExecutorNotImplemented
	case ExecutorTypeComfyUICloud:
		return nil, ErrExecutorNotImplemented
	default:
		return nil, ErrUnknownExecutorType
	}
}
