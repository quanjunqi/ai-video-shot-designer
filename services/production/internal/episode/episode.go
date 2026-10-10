package episode

import (
	"encoding/json"
	"errors"
	"time"
)

var ErrNotFound = errors.New("episode not found")
var ErrInvalid = errors.New("invalid episode input")

// Episode 是单集工坊的完整数据结构
// 复杂字段（interpretation/directing/units/production 等）使用 json.RawMessage 存储
type Episode struct {
	WorkspaceID          string          `json:"workspace_id"`
	ProjectID            string          `json:"project_id"`
	ID                   string          `json:"id"`
	Index                int             `json:"index"`
	Title                string          `json:"title"`
	Summary              string          `json:"summary"`
	SourceSpanStart      int             `json:"source_span_start"`
	SourceSpanEnd        int             `json:"source_span_end"`
	Stage                string          `json:"stage"`
	Status               string          `json:"status"`
	Counts               json.RawMessage `json:"counts"`
	BlockedBy            *string         `json:"blocked_by,omitempty"`
	ScriptChecked        bool            `json:"script_checked"`
	ScriptDraft          *string         `json:"script_draft,omitempty"`
	Interpretation       json.RawMessage `json:"interpretation,omitempty"`
	InterpretationConfirmed bool         `json:"interpretation_confirmed"`
	ExecutionTarget      json.RawMessage `json:"execution_target,omitempty"`
	StageModels          json.RawMessage `json:"stage_models,omitempty"`
	Performance          json.RawMessage `json:"performance,omitempty"`
	SceneVariants        json.RawMessage `json:"scene_variants,omitempty"`
	Directing            json.RawMessage `json:"directing,omitempty"`
	DirectingStep        *int            `json:"directing_step,omitempty"`
	ExecutableUnits      json.RawMessage `json:"executable_units,omitempty"`
	Production           json.RawMessage `json:"production,omitempty"`
	CreatedAt            time.Time       `json:"created_at"`
	UpdatedAt            time.Time       `json:"updated_at"`
}

// UpdateInput 是剧集更新输入，所有字段可选
type UpdateInput struct {
	Title                *string          `json:"title,omitempty"`
	Summary              *string          `json:"summary,omitempty"`
	SourceSpanStart      *int             `json:"source_span_start,omitempty"`
	SourceSpanEnd        *int             `json:"source_span_end,omitempty"`
	Stage                *string          `json:"stage,omitempty"`
	Status               *string          `json:"status,omitempty"`
	Counts               json.RawMessage  `json:"counts,omitempty"`
	BlockedBy            *string          `json:"blocked_by,omitempty"`
	ScriptChecked        *bool            `json:"script_checked,omitempty"`
	ScriptDraft          *string          `json:"script_draft,omitempty"`
	Interpretation       json.RawMessage  `json:"interpretation,omitempty"`
	InterpretationConfirmed *bool         `json:"interpretation_confirmed,omitempty"`
	ExecutionTarget      json.RawMessage  `json:"execution_target,omitempty"`
	StageModels          json.RawMessage  `json:"stage_models,omitempty"`
	Performance          json.RawMessage  `json:"performance,omitempty"`
	SceneVariants        json.RawMessage  `json:"scene_variants,omitempty"`
	Directing            json.RawMessage  `json:"directing,omitempty"`
	DirectingStep        *int             `json:"directing_step,omitempty"`
	ExecutableUnits      json.RawMessage  `json:"executable_units,omitempty"`
	Production           json.RawMessage  `json:"production,omitempty"`
}

// CreateInput 是剧集创建输入
type CreateInput struct {
	ID              string `json:"id"`
	Index           int    `json:"index"`
	Title           string `json:"title"`
	Summary         string `json:"summary,omitempty"`
	SourceSpanStart int    `json:"source_span_start,omitempty"`
	SourceSpanEnd   int    `json:"source_span_end,omitempty"`
}

func (input CreateInput) Validate() error {
	if input.ID == "" {
		return ErrInvalid
	}
	if input.Index < 0 {
		return ErrInvalid
	}
	if input.Title == "" {
		return ErrInvalid
	}
	return nil
}
