package episodeasset

import (
	"errors"
	"time"
)

var (
	ErrNotFound = errors.New("episode asset not found")
	ErrInvalid  = errors.New("invalid episode asset input")
)

// EpisodeAsset 剧集描述性资产（角色/道具/场景的 prompt 与版本历史）
type EpisodeAsset struct {
	WorkspaceID    string         `json:"workspace_id"`
	ProjectID      string         `json:"project_id"`
	EpisodeID      string         `json:"episode_id"`
	ID             string         `json:"id"`
	Kind           string         `json:"kind"` // character / prop / scene / other
	Name           string         `json:"name"`
	Description    string         `json:"description"`
	Scope          string         `json:"scope"` // episode / global
	SourceScene    string         `json:"source_scene,omitempty"`
	Holder         string         `json:"holder,omitempty"`
	CurrentVersion int            `json:"current_version"`
	Versions       []AssetVersion `json:"versions"`
	Prompt         string         `json:"prompt"`
	NegativePrompt string         `json:"negative_prompt"`
	ImageURL       string         `json:"image_url,omitempty"`
	Status         string         `json:"status"`
	Model          string         `json:"model"`
	Stale          bool           `json:"stale"`
	// 关联项目级资产（权威源）
	ProjectCharacterID string `json:"project_character_id,omitempty"`
	ProjectPropID      string `json:"project_prop_id,omitempty"`
	ProjectSceneID     string `json:"project_scene_id,omitempty"`
	// 单集状态变体（JSON：emotionState, appearanceChange, temporaryOutfit, specialProp）
	EpisodeVariant map[string]string `json:"episode_variant,omitempty"`
	// 单集变体立绘（图生图，基于标准立绘）
	VariantImageURL         string    `json:"variant_image_url,omitempty"`
	VariantImageStatus      string    `json:"variant_image_status,omitempty"`
	VariantImageModel       string    `json:"variant_image_model,omitempty"`
	VariantImageGeneratedAt time.Time `json:"variant_image_generated_at,omitempty"`
	CreatedAt               time.Time `json:"created_at"`
	UpdatedAt               time.Time `json:"updated_at"`
}

// AssetVersion 资产版本
type AssetVersion struct {
	Version        int    `json:"version"`
	Prompt         string `json:"prompt"`
	NegativePrompt string `json:"negative_prompt"`
	ImageURL       string `json:"image_url,omitempty"`
	Sha256         string `json:"sha256,omitempty"`
	Status         string `json:"status"`
	CreatedAt      int64  `json:"created_at"`
}

// CreateInput 创建资产输入
type CreateInput struct {
	ID             string         `json:"id"`
	Kind           string         `json:"kind"`
	Name           string         `json:"name"`
	Description    string         `json:"description,omitempty"`
	Scope          string         `json:"scope,omitempty"`
	SourceScene    string         `json:"source_scene,omitempty"`
	Holder         string         `json:"holder,omitempty"`
	CurrentVersion int            `json:"current_version,omitempty"`
	Versions       []AssetVersion `json:"versions,omitempty"`
	Prompt         string         `json:"prompt,omitempty"`
	NegativePrompt string         `json:"negative_prompt,omitempty"`
	ImageURL       string         `json:"image_url,omitempty"`
	Status         string         `json:"status,omitempty"`
	Model          string         `json:"model,omitempty"`
	Stale          bool           `json:"stale,omitempty"`
	// 关联项目级资产
	ProjectCharacterID string `json:"project_character_id,omitempty"`
	ProjectPropID      string `json:"project_prop_id,omitempty"`
	ProjectSceneID     string `json:"project_scene_id,omitempty"`
	// 单集状态变体
	EpisodeVariant map[string]string `json:"episode_variant,omitempty"`
}

func (input CreateInput) Validate() error {
	if input.ID == "" {
		return errors.Join(ErrInvalid, errors.New("id is required"))
	}
	if input.Kind == "" {
		return errors.Join(ErrInvalid, errors.New("kind is required"))
	}
	if input.Name == "" {
		return errors.Join(ErrInvalid, errors.New("name is required"))
	}
	return nil
}

// UpdateInput 更新资产输入（部分更新，nil 字段不更新）
type UpdateInput struct {
	Name           *string         `json:"name,omitempty"`
	Description    *string         `json:"description,omitempty"`
	Scope          *string         `json:"scope,omitempty"`
	SourceScene    *string         `json:"source_scene,omitempty"`
	Holder         *string         `json:"holder,omitempty"`
	CurrentVersion *int            `json:"current_version,omitempty"`
	Versions       *[]AssetVersion `json:"versions,omitempty"`
	Prompt         *string         `json:"prompt,omitempty"`
	NegativePrompt *string         `json:"negative_prompt,omitempty"`
	ImageURL       *string         `json:"image_url,omitempty"`
	Status         *string         `json:"status,omitempty"`
	Model          *string         `json:"model,omitempty"`
	Stale          *bool           `json:"stale,omitempty"`
	// 关联项目级资产
	ProjectCharacterID *string `json:"project_character_id,omitempty"`
	ProjectPropID      *string `json:"project_prop_id,omitempty"`
	ProjectSceneID     *string `json:"project_scene_id,omitempty"`
	// 单集状态变体
	EpisodeVariant *map[string]string `json:"episode_variant,omitempty"`
	// 单集变体立绘
	VariantImageURL         *string    `json:"variant_image_url,omitempty"`
	VariantImageStatus      *string    `json:"variant_image_status,omitempty"`
	VariantImageModel       *string    `json:"variant_image_model,omitempty"`
	VariantImageGeneratedAt *time.Time `json:"variant_image_generated_at,omitempty"`
}
