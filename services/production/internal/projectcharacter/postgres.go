package projectcharacter

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct {
	Pool *pgxpool.Pool
}

// ListByProject 列出项目下的所有角色
func (store PostgresStore) ListByProject(ctx context.Context, workspace, projectID string) ([]ProjectCharacter, error) {
	rows, err := store.Pool.Query(ctx, `SELECT
		id, workspace_id, project_id, name, gender, age, identity,
		hairstyle, eye_color, facial_features, special_marks, body_type, skin_texture,
		top, bottom, shoes, clothing_style, performance,
		image_url, image_status, image_model, image_prompt, image_negative_prompt,
		image_generated_at, image_job_id, image_error, image_aspect_ratio,
		created_at, updated_at
		FROM project_characters WHERE workspace_id = $1 AND project_id = $2
		ORDER BY created_at`, workspace, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var characters []ProjectCharacter
	for rows.Next() {
		c, err := scanCharacter(rows)
		if err != nil {
			return nil, err
		}
		characters = append(characters, c)
	}
	return characters, rows.Err()
}

// Get 获取单个角色
func (store PostgresStore) Get(ctx context.Context, workspace, projectID, id string) (ProjectCharacter, error) {
	row := store.Pool.QueryRow(ctx, `SELECT
		id, workspace_id, project_id, name, gender, age, identity,
		hairstyle, eye_color, facial_features, special_marks, body_type, skin_texture,
		top, bottom, shoes, clothing_style, performance,
		image_url, image_status, image_model, image_prompt, image_negative_prompt,
		image_generated_at, image_job_id, image_error, image_aspect_ratio,
		created_at, updated_at
		FROM project_characters WHERE workspace_id = $1 AND project_id = $2 AND id = $3`,
		workspace, projectID, id)
	c, err := scanCharacter(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return ProjectCharacter{}, ErrNotFound
	}
	return c, err
}

// Create 创建角色
func (store PostgresStore) Create(ctx context.Context, workspace, projectID string, input CreateInput) (ProjectCharacter, error) {
	row := store.Pool.QueryRow(ctx, `INSERT INTO project_characters (
		id, workspace_id, project_id, name, gender, age, identity,
		hairstyle, eye_color, facial_features, special_marks, body_type, skin_texture,
		top, bottom, shoes, clothing_style, performance,
		image_url, image_status, image_model, image_prompt, image_negative_prompt,
		image_aspect_ratio
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
	RETURNING id, workspace_id, project_id, name, gender, age, identity,
		hairstyle, eye_color, facial_features, special_marks, body_type, skin_texture,
		top, bottom, shoes, clothing_style, performance,
		image_url, image_status, image_model, image_prompt, image_negative_prompt,
		image_generated_at, image_job_id, image_error, image_aspect_ratio,
		created_at, updated_at`,
		input.ID, workspace, projectID, input.Name, input.Gender, input.Age, input.Identity,
		input.Hairstyle, input.EyeColor, input.FacialFeatures, input.SpecialMarks, input.BodyType, input.SkinTexture,
		input.Top, input.Bottom, input.Shoes, input.ClothingStyle, input.Performance,
		input.ImageURL, defaultString(input.ImageStatus, "not_generated"), input.ImageModel, input.ImagePrompt, input.ImageNegativePrompt,
		defaultString(input.ImageAspectRatio, "9:16"))
	return scanCharacter(row)
}

// Update 更新角色
func (store PostgresStore) Update(ctx context.Context, workspace, projectID, id string, input UpdateInput) (ProjectCharacter, error) {
	row := store.Pool.QueryRow(ctx, `UPDATE project_characters SET
		name = COALESCE($4, name),
		gender = COALESCE($5, gender),
		age = COALESCE($6, age),
		identity = COALESCE($7, identity),
		hairstyle = COALESCE($8, hairstyle),
		eye_color = COALESCE($9, eye_color),
		facial_features = COALESCE($10, facial_features),
		special_marks = COALESCE($11, special_marks),
		body_type = COALESCE($12, body_type),
		skin_texture = COALESCE($13, skin_texture),
		top = COALESCE($14, top),
		bottom = COALESCE($15, bottom),
		shoes = COALESCE($16, shoes),
		clothing_style = COALESCE($17, clothing_style),
		performance = COALESCE($18, performance),
		image_url = COALESCE($19, image_url),
		image_status = COALESCE($20, image_status),
		image_model = COALESCE($21, image_model),
		image_prompt = COALESCE($22, image_prompt),
		image_negative_prompt = COALESCE($23, image_negative_prompt),
		image_generated_at = COALESCE($24, image_generated_at),
		image_job_id = COALESCE($25, image_job_id),
		image_error = COALESCE($26, image_error),
		image_aspect_ratio = COALESCE($27, image_aspect_ratio),
		updated_at = NOW()
		WHERE workspace_id = $1 AND project_id = $2 AND id = $3
		RETURNING id, workspace_id, project_id, name, gender, age, identity,
		hairstyle, eye_color, facial_features, special_marks, body_type, skin_texture,
		top, bottom, shoes, clothing_style, performance,
		image_url, image_status, image_model, image_prompt, image_negative_prompt,
		image_generated_at, image_job_id, image_error, image_aspect_ratio,
		created_at, updated_at`,
		workspace, projectID, id,
		input.Name, input.Gender, input.Age, input.Identity,
		input.Hairstyle, input.EyeColor, input.FacialFeatures, input.SpecialMarks, input.BodyType, input.SkinTexture,
		input.Top, input.Bottom, input.Shoes, input.ClothingStyle, input.Performance,
		input.ImageURL, input.ImageStatus, input.ImageModel, input.ImagePrompt, input.ImageNegativePrompt,
		input.ImageGeneratedAt, input.ImageJobID, input.ImageError, input.ImageAspectRatio)
	c, err := scanCharacter(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return ProjectCharacter{}, ErrNotFound
	}
	return c, err
}

// Delete 删除角色
func (store PostgresStore) Delete(ctx context.Context, workspace, projectID, id string) error {
	tag, err := store.Pool.Exec(ctx, `DELETE FROM project_characters WHERE workspace_id = $1 AND project_id = $2 AND id = $3`,
		workspace, projectID, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func scanCharacter(row pgx.Row) (ProjectCharacter, error) {
	var c ProjectCharacter
	err := row.Scan(
		&c.ID, &c.WorkspaceID, &c.ProjectID, &c.Name, &c.Gender, &c.Age, &c.Identity,
		&c.Hairstyle, &c.EyeColor, &c.FacialFeatures, &c.SpecialMarks, &c.BodyType, &c.SkinTexture,
		&c.Top, &c.Bottom, &c.Shoes, &c.ClothingStyle, &c.Performance,
		&c.ImageURL, &c.ImageStatus, &c.ImageModel, &c.ImagePrompt, &c.ImageNegativePrompt,
		&c.ImageGeneratedAt, &c.ImageJobID, &c.ImageError, &c.ImageAspectRatio,
		&c.CreatedAt, &c.UpdatedAt,
	)
	return c, err
}

func defaultString(s, def string) string {
	if s == "" {
		return def
	}
	return s
}
