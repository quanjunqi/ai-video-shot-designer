package asset

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
)

var (
	ErrNotFound     = errors.New("asset not found")
	ErrConflict     = errors.New("asset upload already committed")
	ErrHashMismatch = errors.New("uploaded content hash mismatch")
	ErrTooLarge     = errors.New("uploaded content exceeds the configured limit")
	ErrSizeMismatch = errors.New("uploaded content length does not match Content-Length")
)

type Store struct {
	Pool     *pgxpool.Pool
	Object   *minio.Client
	Bucket   string
	MaxBytes int64
}

type UploadInput struct {
	ProjectID string `json:"project_id"`
	EpisodeID string `json:"episode_id"`
	Kind      string `json:"kind"`
	Scope     string `json:"scope"`
	Name      string `json:"name"`
	Prompt    string `json:"prompt"`
	SHA256    string `json:"sha256"`
}

type Upload struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"project_id"`
	ObjectKey string    `json:"object_key"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

type Asset struct {
	ID          string    `json:"id"`
	UploadID    string    `json:"upload_id"`
	ProjectID   string    `json:"project_id"`
	EpisodeID   string    `json:"episode_id,omitempty"`
	Kind        string    `json:"kind"`
	Scope       string    `json:"scope"`
	Name        string    `json:"name"`
	Prompt      string    `json:"prompt"`
	ObjectKey   string    `json:"object_key"`
	SHA256      string    `json:"sha256"`
	ByteSize    int64     `json:"byte_size"`
	ContentType string    `json:"content_type"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
}

func (s Store) CreateUpload(ctx context.Context, workspace, actor string, input UploadInput) (Upload, error) {
	input.ProjectID = strings.TrimSpace(input.ProjectID)
	input.Name = strings.TrimSpace(input.Name)
	if input.ProjectID == "" || input.Name == "" {
		return Upload{}, fmt.Errorf("project_id and name are required")
	}
	if input.Kind == "" {
		input.Kind = "other"
	}
	if input.Scope == "" {
		input.Scope = "project"
	}
	id := "upl_" + randomID()
	objectKey := workspace + "/" + input.ProjectID + "/" + id
	var out Upload
	err := s.Pool.QueryRow(ctx, `INSERT INTO asset_uploads (workspace_id,id,project_id,episode_id,kind,scope,name,prompt,object_key,expected_sha256,created_by)
		VALUES ($1,$2,$3,NULLIF($4,''),$5,$6,$7,$8,$9,NULLIF($10,''),$11) RETURNING id,project_id,object_key,status,created_at`, workspace, id, input.ProjectID, input.EpisodeID, input.Kind, input.Scope, input.Name, input.Prompt, objectKey, input.SHA256, actor).
		Scan(&out.ID, &out.ProjectID, &out.ObjectKey, &out.Status, &out.CreatedAt)
	return out, err
}

func (s Store) Put(ctx context.Context, workspace, uploadID string, body io.Reader, size int64, contentType string) error {
	if size > s.MaxBytes {
		return ErrTooLarge
	}
	if s.MaxBytes <= 0 {
		return fmt.Errorf("upload limit must be positive")
	}
	var key string
	var status string
	if err := s.Pool.QueryRow(ctx, `SELECT object_key,status FROM asset_uploads WHERE workspace_id=$1 AND id=$2`, workspace, uploadID).Scan(&key, &status); errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	} else if status != "uploading" {
		return ErrConflict
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	putSize := size
	if putSize < 0 {
		putSize = -1
	}
	info, err := s.Object.PutObject(ctx, s.Bucket, key, io.LimitReader(body, s.MaxBytes+1), putSize, minio.PutObjectOptions{ContentType: contentType})
	if err != nil {
		return err
	}
	if info.Size > s.MaxBytes {
		_ = s.Object.RemoveObject(ctx, s.Bucket, key, minio.RemoveObjectOptions{})
		return ErrTooLarge
	}
	if size >= 0 && info.Size != size {
		_ = s.Object.RemoveObject(ctx, s.Bucket, key, minio.RemoveObjectOptions{})
		return ErrSizeMismatch
	}
	return nil
}

func (s Store) Commit(ctx context.Context, workspace, uploadID string) (Asset, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Asset{}, err
	}
	defer tx.Rollback(ctx)
	var u UploadInput
	var key, status, createdBy, expected string
	var projectID, episodeID, name, prompt string
	err = tx.QueryRow(ctx, `SELECT project_id,COALESCE(episode_id,''),kind,scope,name,prompt,object_key,status,created_by,COALESCE(expected_sha256,'') FROM asset_uploads WHERE workspace_id=$1 AND id=$2 FOR UPDATE`, workspace, uploadID).
		Scan(&projectID, &episodeID, &u.Kind, &u.Scope, &name, &prompt, &key, &status, &createdBy, &expected)
	if errors.Is(err, pgx.ErrNoRows) {
		return Asset{}, ErrNotFound
	}
	if err != nil {
		return Asset{}, err
	}
	if status == "committed" {
		return Asset{}, ErrConflict
	}
	if status != "uploading" {
		return Asset{}, fmt.Errorf("upload is not committable")
	}
	obj, err := s.Object.GetObject(ctx, s.Bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return Asset{}, err
	}
	defer obj.Close()
	h := sha256.New()
	n, err := io.Copy(h, obj)
	if err != nil {
		return Asset{}, err
	}
	info, err := obj.Stat()
	if err != nil {
		return Asset{}, err
	}
	digest := hex.EncodeToString(h.Sum(nil))
	if expected != "" && !strings.EqualFold(expected, digest) {
		return Asset{}, ErrHashMismatch
	}
	id := "ast_" + randomID()
	var out Asset
	err = tx.QueryRow(ctx, `INSERT INTO assets (workspace_id,id,upload_id,project_id,episode_id,kind,scope,name,prompt,object_key,sha256,byte_size,content_type,created_by)
		VALUES ($1,$2,$3,$4,NULLIF($5,''),$6,$7,$8,$9,$10,$11,$12,$13,$14)
		RETURNING id,upload_id,project_id,COALESCE(episode_id,''),kind,scope,name,prompt,object_key,sha256,byte_size,content_type,status,created_at`, workspace, id, uploadID, projectID, episodeID, u.Kind, u.Scope, name, prompt, key, digest, n, info.ContentType, createdBy).
		Scan(&out.ID, &out.UploadID, &out.ProjectID, &out.EpisodeID, &out.Kind, &out.Scope, &out.Name, &out.Prompt, &out.ObjectKey, &out.SHA256, &out.ByteSize, &out.ContentType, &out.Status, &out.CreatedAt)
	if err != nil {
		return Asset{}, err
	}
	if _, err = tx.Exec(ctx, `UPDATE asset_uploads SET status='committed',updated_at=now() WHERE workspace_id=$1 AND id=$2`, workspace, uploadID); err != nil {
		return Asset{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Asset{}, err
	}
	return out, nil
}

func (s Store) List(ctx context.Context, workspace, projectID string) ([]Asset, error) {
	rows, err := s.Pool.Query(ctx, `SELECT id,upload_id,project_id,COALESCE(episode_id,''),kind,scope,name,prompt,object_key,sha256,byte_size,content_type,status,created_at FROM assets WHERE workspace_id=$1 AND ($2='' OR project_id=$2) ORDER BY created_at DESC`, workspace, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]Asset, 0)
	for rows.Next() {
		var a Asset
		if err := rows.Scan(&a.ID, &a.UploadID, &a.ProjectID, &a.EpisodeID, &a.Kind, &a.Scope, &a.Name, &a.Prompt, &a.ObjectKey, &a.SHA256, &a.ByteSize, &a.ContentType, &a.Status, &a.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, a)
	}
	return result, rows.Err()
}

// Content 是资产读取端点（GET /internal/v1/assets/{id}/content）的返回投影：
// 资产元数据 + MinIO 对象体。Body 由调用方关闭。
type Content struct {
	Asset
	Body io.ReadCloser
}

// GetContent 按资产 id 读取落盘内容（TASK-ASSET-001 读取端点）。
// 只允许读取本 workspace 的资产（workspace 隔离）；资产不存在返回 ErrNotFound。
func (s Store) GetContent(ctx context.Context, workspace, assetID string) (Content, error) {
	var a Asset
	err := s.Pool.QueryRow(ctx, `SELECT id,upload_id,project_id,COALESCE(episode_id,''),kind,scope,name,prompt,object_key,sha256,byte_size,content_type,status,created_at FROM assets WHERE workspace_id=$1 AND id=$2`, workspace, assetID).
		Scan(&a.ID, &a.UploadID, &a.ProjectID, &a.EpisodeID, &a.Kind, &a.Scope, &a.Name, &a.Prompt, &a.ObjectKey, &a.SHA256, &a.ByteSize, &a.ContentType, &a.Status, &a.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Content{}, ErrNotFound
	}
	if err != nil {
		return Content{}, err
	}
	obj, err := s.Object.GetObject(ctx, s.Bucket, a.ObjectKey, minio.GetObjectOptions{})
	if err != nil {
		return Content{}, err
	}
	return Content{Asset: a, Body: obj}, nil
}

func randomID() string { var b [12]byte; _, _ = rand.Read(b[:]); return hex.EncodeToString(b[:]) }
