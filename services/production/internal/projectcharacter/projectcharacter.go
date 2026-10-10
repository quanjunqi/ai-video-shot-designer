package projectcharacter

import (
	"errors"
	"time"
)

var (
	ErrNotFound = errors.New("project character not found")
	ErrInvalid  = errors.New("invalid project character input")
)

// ProjectCharacter 项目级角色设定（全剧通用，唯一事实源）
type ProjectCharacter struct {
	ID                  string    `json:"id"`
	WorkspaceID         string    `json:"workspace_id"`
	ProjectID           string    `json:"project_id"`
	Name                string    `json:"name"`
	Gender              string    `json:"gender"`
	Age                 string    `json:"age"`
	Identity            string    `json:"identity"`
	Hairstyle           string    `json:"hairstyle"`
	EyeColor            string    `json:"eye_color"`
	FacialFeatures      string    `json:"facial_features"`
	SpecialMarks        string    `json:"special_marks"`
	BodyType            string    `json:"body_type"`
	SkinTexture         string    `json:"skin_texture"`
	Top                 string    `json:"top"`
	Bottom              string    `json:"bottom"`
	Shoes               string    `json:"shoes"`
	ClothingStyle       string    `json:"clothing_style"`
	Performance         string    `json:"performance"`
	ImageURL            string    `json:"image_url,omitempty"`
	ImageStatus         string    `json:"image_status"`
	ImageModel          string    `json:"image_model,omitempty"`
	ImagePrompt         string    `json:"image_prompt,omitempty"`
	ImageNegativePrompt string    `json:"image_negative_prompt,omitempty"`
	ImageGeneratedAt    int64     `json:"image_generated_at"`
	ImageJobID          string    `json:"image_job_id,omitempty"`
	ImageError          string    `json:"image_error,omitempty"`
	ImageAspectRatio    string    `json:"image_aspect_ratio"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
}

// CreateInput 创建角色输入
type CreateInput struct {
	ID                  string `json:"id"`
	Name                string `json:"name"`
	Gender              string `json:"gender,omitempty"`
	Age                 string `json:"age,omitempty"`
	Identity            string `json:"identity,omitempty"`
	Hairstyle           string `json:"hairstyle,omitempty"`
	EyeColor            string `json:"eye_color,omitempty"`
	FacialFeatures      string `json:"facial_features,omitempty"`
	SpecialMarks        string `json:"special_marks,omitempty"`
	BodyType            string `json:"body_type,omitempty"`
	SkinTexture         string `json:"skin_texture,omitempty"`
	Top                 string `json:"top,omitempty"`
	Bottom              string `json:"bottom,omitempty"`
	Shoes               string `json:"shoes,omitempty"`
	ClothingStyle       string `json:"clothing_style,omitempty"`
	Performance         string `json:"performance,omitempty"`
	ImageURL            string `json:"image_url,omitempty"`
	ImageStatus         string `json:"image_status,omitempty"`
	ImageModel          string `json:"image_model,omitempty"`
	ImagePrompt         string `json:"image_prompt,omitempty"`
	ImageNegativePrompt string `json:"image_negative_prompt,omitempty"`
	ImageAspectRatio    string `json:"image_aspect_ratio,omitempty"`
}

func (input CreateInput) Validate() error {
	if input.ID == "" {
		return errors.Join(ErrInvalid, errors.New("id is required"))
	}
	if input.Name == "" {
		return errors.Join(ErrInvalid, errors.New("name is required"))
	}
	return nil
}

// UpdateInput 更新角色输入（部分更新）
type UpdateInput struct {
	Name                *string `json:"name,omitempty"`
	Gender              *string `json:"gender,omitempty"`
	Age                 *string `json:"age,omitempty"`
	Identity            *string `json:"identity,omitempty"`
	Hairstyle           *string `json:"hairstyle,omitempty"`
	EyeColor            *string `json:"eye_color,omitempty"`
	FacialFeatures      *string `json:"facial_features,omitempty"`
	SpecialMarks        *string `json:"special_marks,omitempty"`
	BodyType            *string `json:"body_type,omitempty"`
	SkinTexture         *string `json:"skin_texture,omitempty"`
	Top                 *string `json:"top,omitempty"`
	Bottom              *string `json:"bottom,omitempty"`
	Shoes               *string `json:"shoes,omitempty"`
	ClothingStyle       *string `json:"clothing_style,omitempty"`
	Performance         *string `json:"performance,omitempty"`
	ImageURL            *string `json:"image_url,omitempty"`
	ImageStatus         *string `json:"image_status,omitempty"`
	ImageModel          *string `json:"image_model,omitempty"`
	ImagePrompt         *string `json:"image_prompt,omitempty"`
	ImageNegativePrompt *string `json:"image_negative_prompt,omitempty"`
	ImageGeneratedAt    *int64  `json:"image_generated_at,omitempty"`
	ImageJobID          *string `json:"image_job_id,omitempty"`
	ImageError          *string `json:"image_error,omitempty"`
	ImageAspectRatio    *string `json:"image_aspect_ratio,omitempty"`
}
