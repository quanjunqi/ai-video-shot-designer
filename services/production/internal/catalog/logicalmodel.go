package catalog

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
)

// 逻辑模型（ADR-003 §3.1）：对外唯一标识（能力型 kebab-case），
// 具体上游落点在 model_catalog —— 同一 logical_model_id 的多行即候选渠道集合。
//
// id 一经对外使用即成契约，**不可修改**（改名用 label）。
var (
	ErrInvalidLogicalModelID = errors.New("catalog: invalid logical model id")
	ErrInvalidLogicalType    = errors.New("catalog: invalid logical model type")
	ErrInvalidLabel          = errors.New("catalog: logical model label is required")
	ErrInvalidRoutePriority  = errors.New("catalog: route priority must be >= 0")
	ErrInvalidCandidateInput = errors.New("catalog: candidates must be a non-empty list of model ids")
)

// ErrLogicalModelIDImmutable：请求体与路径的 id 不一致 —— 拒绝（不得静默忽略，否则
// 调用方会以为改名成功）。对外契约的一部分。
var ErrLogicalModelIDImmutable = errors.New("catalog: logical model id is immutable")

// ErrModelBoundElsewhere：候选行已属于另一个逻辑模型。避免静默抢占
// （ADR-003 §3.1.1：等价性是声明出来的，不是推断出来的）。
type ErrModelBoundElsewhere struct {
	ModelID        string
	LogicalModelID string
}

func (e ErrModelBoundElsewhere) Error() string {
	return fmt.Sprintf("catalog: model %s is already bound to logical model %s", e.ModelID, e.LogicalModelID)
}

type LogicalModel struct {
	ID         string    `json:"id"`
	Label      string    `json:"label"`
	Type       string    `json:"type"`
	Capability string    `json:"capability"`
	Status     string    `json:"status"`
	Sort       int       `json:"sort"`
	Note       string    `json:"note"`
	CreatedBy  string    `json:"createdBy"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

// Candidate：某逻辑模型下的候选行（= model_catalog 一行）。
// 只读视图：路由尝试顺序由 routePriority（**小者优先**）决定。
type Candidate struct {
	ID             string `json:"id"`
	LogicalModelID string `json:"logicalModelId"`
	Name           string `json:"name"`
	Family         string `json:"family"`
	ChannelID      string `json:"channelId"`
	ProviderModel  string `json:"providerModel"`
	Type           string `json:"type"`
	Status         string `json:"status"`
	RoutePriority  int    `json:"routePriority"`
}

// LogicalModelCreate：POST /internal/v1/logical-models 请求体。
type LogicalModelCreate struct {
	ID         string `json:"id"`
	Label      string `json:"label"`
	Type       string `json:"type"`
	Capability string `json:"capability"`
	Status     string `json:"status"`
	Sort       *int   `json:"sort"`
	Note       string `json:"note"`
}

// LogicalModelPatch：PATCH /internal/v1/logical-models/{id} 请求体。
// 指针字段区分「未提供」（保持原值）与「显式置零」—— sort 允许为 0。
// ID 只用于识别「试图改名」，**不接受**其值。
type LogicalModelPatch struct {
	ID         string  `json:"id"`
	Label      *string `json:"label"`
	Type       *string `json:"type"`
	Capability *string `json:"capability"`
	Status     *string `json:"status"`
	Sort       *int    `json:"sort"`
	Note       *string `json:"note"`
}

// BindCandidatesInput：POST /internal/v1/logical-models/{id}/candidates 请求体。
// routePriority 未提供时用 DefaultRoutePriority。
type BindCandidatesInput struct {
	ModelIDs      []string `json:"modelIds"`
	RoutePriority *int     `json:"routePriority"`
}

// DefaultRoutePriority 与 026 迁移的 route_priority 列默认值一致。
const DefaultRoutePriority = 100

// defaultLogicalModelSort 与 025 迁移的 sort 列默认值一致。
const defaultLogicalModelSort = 100

// maxLogicalModelIDLength：id 是对外契约与 URL 路径段，限制在合理长度内。
const maxLogicalModelIDLength = 64

// ValidLogicalModelID 校验能力型 kebab-case：小写字母/数字，单连字符分隔，
// 不得以连字符开头或结尾、不得连续连字符。
func ValidLogicalModelID(id string) bool {
	if id == "" || len(id) > maxLogicalModelIDLength {
		return false
	}
	previousHyphen := true // 开头不允许连字符
	for i := 0; i < len(id); i++ {
		c := id[i]
		switch {
		case c >= 'a' && c <= 'z', c >= '0' && c <= '9':
			previousHyphen = false
		case c == '-':
			if previousHyphen {
				return false
			}
			previousHyphen = true
		default:
			return false
		}
	}
	return !previousHyphen
}

func ValidLogicalModelType(modelType string) bool {
	return modelType == "text" || modelType == "image" || modelType == "video"
}

func ValidLogicalModelStatus(status string) bool {
	return status == "enabled" || status == "disabled"
}

func (input *LogicalModelCreate) Validate() error {
	if !ValidLogicalModelID(input.ID) {
		return ErrInvalidLogicalModelID
	}
	if strings.TrimSpace(input.Label) == "" {
		return ErrInvalidLabel
	}
	if !ValidLogicalModelType(input.Type) {
		return ErrInvalidLogicalType
	}
	if input.Status != "" && !ValidLogicalModelStatus(input.Status) {
		return ErrInvalidStatus
	}
	if input.Sort != nil && *input.Sort < 0 {
		return errors.New("catalog: logical model sort must be >= 0")
	}
	if len(input.Label) > 200 {
		return errors.New("catalog: logical model label is too long")
	}
	return nil
}

func (patch *LogicalModelPatch) Validate() error {
	if patch.ID != "" {
		return ErrLogicalModelIDImmutable
	}
	if patch.Label != nil && strings.TrimSpace(*patch.Label) == "" {
		return ErrInvalidLabel
	}
	if patch.Type != nil && !ValidLogicalModelType(*patch.Type) {
		return ErrInvalidLogicalType
	}
	if patch.Status != nil && !ValidLogicalModelStatus(*patch.Status) {
		return ErrInvalidStatus
	}
	if patch.Sort != nil && *patch.Sort < 0 {
		return errors.New("catalog: logical model sort must be >= 0")
	}
	if patch.Label != nil && len(*patch.Label) > 200 {
		return errors.New("catalog: logical model label is too long")
	}
	return nil
}

func (input *BindCandidatesInput) Validate() error {
	if len(input.ModelIDs) == 0 {
		return ErrInvalidCandidateInput
	}
	for _, modelID := range input.ModelIDs {
		if strings.TrimSpace(modelID) == "" || len(modelID) > 128 {
			return ErrInvalidCandidateInput
		}
	}
	if input.RoutePriority != nil && *input.RoutePriority < 0 {
		return ErrInvalidRoutePriority
	}
	return nil
}

// routePriority 归一化：未提供时用默认值。
func (input *BindCandidatesInput) routePriority() int {
	if input.RoutePriority == nil {
		return DefaultRoutePriority
	}
	return *input.RoutePriority
}

// uniqueModelIDs 去重并保留首次出现顺序：绑定请求对同一 id 重复是幂等的。
func uniqueModelIDs(modelIDs []string) []string {
	seen := make(map[string]struct{}, len(modelIDs))
	unique := make([]string, 0, len(modelIDs))
	for _, modelID := range modelIDs {
		if _, ok := seen[modelID]; ok {
			continue
		}
		seen[modelID] = struct{}{}
		unique = append(unique, modelID)
	}
	return unique
}

// LogicalModelStore 是逻辑模型与候选绑定的存储契约（由 PostgresStore + 测试桩实现）。
type LogicalModelStore interface {
	ListLogicalModels(context.Context, string, string) ([]LogicalModel, error)
	GetLogicalModel(context.Context, string) (LogicalModel, error)
	CreateLogicalModel(context.Context, string, LogicalModelCreate) (LogicalModel, error)
	UpdateLogicalModel(context.Context, string, LogicalModelPatch) (LogicalModel, error)
	ListCandidates(context.Context, string) ([]Candidate, error)
	BindCandidates(context.Context, string, BindCandidatesInput) ([]Candidate, error)
	UnbindCandidate(context.Context, string, string) error
}
