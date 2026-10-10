package project

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

var ErrInvalid = errors.New("invalid project input")
var ErrIdempotencyConflict = errors.New("idempotency key reused with different input")
var ErrNotFound = errors.New("project not found")

type CreateInput struct {
	Title             string `json:"title"`
	StyleID           string `json:"style_id"`
	StyleVersion      string `json:"style_version"`
	AspectRatio       string `json:"aspect_ratio"`
	DefaultTextModel  string `json:"default_text_model"`
	DefaultImageModel string `json:"default_image_model"`
	DefaultVideoModel string `json:"default_video_model"`
	SourceText        string `json:"source_text"`
}

type UpdateInput struct {
	Title             *string `json:"title,omitempty"`
	StyleID           *string `json:"style_id,omitempty"`
	StyleVersion      *string `json:"style_version,omitempty"`
	AspectRatio       *string `json:"aspect_ratio,omitempty"`
	DefaultTextModel  *string `json:"default_text_model,omitempty"`
	DefaultImageModel *string `json:"default_image_model,omitempty"`
	DefaultVideoModel *string `json:"default_video_model,omitempty"`
}

func (input UpdateInput) Validate() error {
	if input.Title != nil {
		title := strings.TrimSpace(*input.Title)
		if n := utf8.RuneCountInString(title); !utf8.ValidString(title) || strings.ContainsRune(title, 0) || n < 1 || n > 50 {
			return ErrInvalid
		}
	}
	for _, ptr := range []*string{input.StyleID, input.StyleVersion, input.DefaultTextModel, input.DefaultImageModel, input.DefaultVideoModel} {
		if ptr != nil {
			if !utf8.ValidString(*ptr) || strings.ContainsRune(*ptr, 0) || len(*ptr) > 128 {
				return ErrInvalid
			}
		}
	}
	if input.AspectRatio != nil {
		switch *input.AspectRatio {
		case "16:9", "9:16", "1:1":
		default:
			return ErrInvalid
		}
	}
	return nil
}

type SourceVersion struct {
	Version   int       `json:"version"`
	SHA256    string    `json:"sha256"`
	CreatedAt time.Time `json:"created_at"`
}

type Project struct {
	ID                   string        `json:"id"`
	Title                string        `json:"title"`
	StyleID              string        `json:"style_id"`
	StyleVersion         string        `json:"style_version"`
	AspectRatio          string        `json:"aspect_ratio"`
	DefaultTextModel     string        `json:"default_text_model"`
	DefaultImageModel    string        `json:"default_image_model"`
	DefaultVideoModel    string        `json:"default_video_model"`
	Status               string        `json:"status"`
	CurrentSourceVersion int           `json:"current_source_version"`
	SourceVersion        SourceVersion `json:"source_version"`
	// SourceText is populated by the detail endpoint only. Lists intentionally
	// omit the full script because it can be up to 2 MiB.
	SourceText string    `json:"source_text,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type ListResult struct {
	Items  []Project `json:"items"`
	Cursor string    `json:"next_cursor,omitempty"`
}

func (input CreateInput) Validate() error {
	// 剧本无下限（用户既定决策）：只校验文本合法性与体积上限，不设字数下限。
	if !utf8.ValidString(input.SourceText) || strings.ContainsRune(input.SourceText, 0) ||
		len(input.SourceText) > 2*1024*1024 {
		return ErrInvalid
	}
	title := strings.TrimSpace(input.Title)
	if n := utf8.RuneCountInString(title); !utf8.ValidString(title) || strings.ContainsRune(title, 0) || n < 1 || n > 50 {
		return ErrInvalid
	}
	for _, value := range []string{input.StyleID, input.StyleVersion, input.DefaultTextModel, input.DefaultImageModel, input.DefaultVideoModel} {
		if !utf8.ValidString(value) || strings.ContainsRune(value, 0) || strings.TrimSpace(value) == "" || len(value) > 128 {
			return ErrInvalid
		}
	}
	switch input.AspectRatio {
	case "16:9", "9:16", "1:1":
		return nil
	default:
		return ErrInvalid
	}
}

func (input CreateInput) RequestHash() string {
	input.Title = strings.TrimSpace(input.Title)
	data, _ := json.Marshal(input)
	return SHA256(data)
}

func SHA256(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
