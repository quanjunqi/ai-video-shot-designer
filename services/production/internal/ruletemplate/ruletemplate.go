package ruletemplate

import (
	"errors"
	"time"
)

var (
	ErrNotFound = errors.New("rule template not found")
	ErrInvalid  = errors.New("invalid rule template input")
)

// RuleTemplate 规则模板（拆集规则 + 环节提示词规则统一存储）
type RuleTemplate struct {
	WorkspaceID    string                 `json:"workspace_id"`
	ID             string                 `json:"id"`
	Kind           string                 `json:"kind"` // split / prompt
	Name           string                 `json:"name"`
	Description    string                 `json:"description"`
	Stage          string                 `json:"stage,omitempty"`
	Content        string                 `json:"content"`
	Config         map[string]interface{} `json:"config"`
	Version        int                    `json:"version"`
	VersionHistory []VersionEntry         `json:"version_history"`
	Builtin        bool                   `json:"builtin"`
	Enabled        bool                   `json:"enabled"`
	CreatedAt      time.Time              `json:"created_at"`
	UpdatedAt      time.Time              `json:"updated_at"`
}

// VersionEntry 版本历史条目
type VersionEntry struct {
	Version  int                    `json:"version"`
	SavedAt  int64                  `json:"savedAt"`
	Note     string                 `json:"note,omitempty"`
	Snapshot map[string]interface{} `json:"snapshot"`
}

// CreateInput 创建规则模板输入
type CreateInput struct {
	ID          string                 `json:"id"`
	Kind        string                 `json:"kind"`
	Name        string                 `json:"name"`
	Description string                 `json:"description,omitempty"`
	Stage       string                 `json:"stage,omitempty"`
	Content     string                 `json:"content,omitempty"`
	Config      map[string]interface{} `json:"config,omitempty"`
	Builtin     bool                   `json:"builtin,omitempty"`
	Enabled     bool                   `json:"enabled,omitempty"`
}

func (input CreateInput) Validate() error {
	if input.ID == "" {
		return errors.Join(ErrInvalid, errors.New("id is required"))
	}
	if input.Kind != "split" && input.Kind != "prompt" {
		return errors.Join(ErrInvalid, errors.New("kind must be split or prompt"))
	}
	if input.Name == "" {
		return errors.Join(ErrInvalid, errors.New("name is required"))
	}
	return nil
}

// UpdateInput 更新规则模板输入（部分更新）
type UpdateInput struct {
	Name           *string                 `json:"name,omitempty"`
	Description    *string                 `json:"description,omitempty"`
	Stage          *string                 `json:"stage,omitempty"`
	Content        *string                 `json:"content,omitempty"`
	Config         *map[string]interface{} `json:"config,omitempty"`
	Version        *int                    `json:"version,omitempty"`
	VersionHistory *[]VersionEntry         `json:"version_history,omitempty"`
	Enabled        *bool                   `json:"enabled,omitempty"`
}
