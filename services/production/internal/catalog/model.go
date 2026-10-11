// Package catalog owns the platform-shared model directory:
// channels (L1 model sources) + model_catalog (L2 models, L3 capability/billing).
// Capability/billing is stored as opaque JSONB (schema matches the web catalog),
// so the web catalog stays the single source of truth for field shape.
package catalog

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

var (
	ErrNotFound          = errors.New("catalog: not found")
	ErrDuplicate         = errors.New("catalog: duplicate")
	ErrInvalidChannel    = errors.New("catalog: invalid channel")
	ErrInvalidType       = errors.New("catalog: invalid model type")
	ErrInvalidStatus     = errors.New("catalog: invalid model status")
	ErrInvalidCapability = errors.New("catalog: invalid capability json")
	ErrBuiltinProtected  = errors.New("catalog: builtin template is protected")
	ErrTemplateInUse     = errors.New("catalog: template referenced by models")
)

type Channel struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Kind     string `json:"kind"`
	BaseURL  string `json:"baseUrl"`
	AuthType string `json:"authType"`
	Enabled  bool   `json:"enabled"`
	Note     string `json:"note"`
	Sort     int    `json:"sort"`
	// 同步状态（① 的第①步）：**只读投影** —— 界面据此显示"这个渠道有没有配同步、
	// 上次同步成功没有"。刻意不放进 ChannelPatch：同步配置是【平台级】的，
	// 而渠道页写的是工作区域（见 useSettingsStore 的注释），两者不能混。
	SyncKind        string     `json:"syncKind"`
	SyncModelsPath  string     `json:"syncModelsPath"`
	SyncPricingPath string     `json:"syncPricingPath"`
	LastSyncAt      *time.Time `json:"lastSyncAt"`
}

type Model struct {
	ID                 string          `json:"id"`
	ChannelID          string          `json:"channelId"`
	Family             string          `json:"family"`
	Name               string          `json:"name"`
	ProviderModel      string          `json:"providerModel"`
	Type               string          `json:"type"`
	Status             string          `json:"status"`
	Sort               int             `json:"sort"`
	Note               string          `json:"note"`
	ProtocolTemplateID string          `json:"protocolTemplateId"`
	RequestPath        string          `json:"requestPath"`
	Method             string          `json:"method"`
	Params             json.RawMessage `json:"params"`
	ResponseParams     json.RawMessage `json:"responseParams"`
	Capability         json.RawMessage `json:"capability"`
	Version            int             `json:"version"`
	// 路由字段（ADR-003 §3.1）：同一 logicalModelId 的多行 = 该逻辑模型的候选渠道，
	// routePriority 小者优先。放进【目录投影】是为了让 execution 一次拉取就能在本地
	// 解析候选（零额外往返），而不是再加一次内部调用。
	LogicalModelID string `json:"logicalModelId"`
	RoutePriority  int    `json:"routePriority"`
}

// ProtocolTemplate：协议模板实体（独立可管理）。
// 模板修改一处生效于全部引用模型；模型级字段为覆盖层（模板默认值 → 模型覆盖值）。
// Type 声明模板适用的模型类型：text / image / video / all（all 全类型通用，如聚合网关）。
type ProtocolTemplate struct {
	ID             string          `json:"id"`
	Label          string          `json:"label"`
	Desc           string          `json:"desc"`
	Type           string          `json:"type"`
	Method         string          `json:"method"`
	RequestPath    string          `json:"requestPath"`
	Params         json.RawMessage `json:"params"`
	ResponseParams json.RawMessage `json:"responseParams"`
	Async          json.RawMessage `json:"async,omitempty"`
	Capabilities   json.RawMessage `json:"capabilities,omitempty"`
	Builtin        bool            `json:"builtin"`
	Enabled        bool            `json:"enabled"`
	RefCount       int             `json:"refCount"`
	Version        int             `json:"version"`
	// Source 标识模板来源（builtin=内置/注册表，custom=用户自定义），
	// 由读取路径（Directory 合并）填充；写入路径返回时省略，保持既有 JSON 消费者兼容。
	Source string `json:"source,omitempty"`
	// RequestTemplate 是 ADR-007 D3 的请求模板（{{占位符}} 语法，迁移 028 新增列）。
	// 非空时执行器渲染它作为请求体（params[] 仍用于解析占位符取值）；空则沿用 params[] 组装。
	// 追加式 + omitempty：既有 JSON 消费者不受影响（空值不出现该键）。
	// 转义责任在模板作者：字符串值原样插入，模板里需要自己写引号（见执行器 RenderRequestTemplate）。
	RequestTemplate string `json:"requestTemplate,omitempty"`
	// ADR-008 §3 两类证据并列：
	//   doc_ref           —— 文档依据（**外部输入**，可能过期或本身有误）
	//   observed_evidence —— 实测证据（**事实**，冲突时以它为准，且差异必须保留可见）
	// 两者都是 jsonb；NULL = 尚未对齐文档 / 尚未实测。
	DocRef           json.RawMessage `json:"docRef,omitempty"`
	ObservedEvidence json.RawMessage `json:"observedEvidence,omitempty"`
}

type ProtocolTemplatePatch struct {
	Label          string          `json:"label,omitempty"`
	Desc           string          `json:"desc,omitempty"`
	Type           string          `json:"type,omitempty"`
	Method         string          `json:"method,omitempty"`
	RequestPath    string          `json:"requestPath,omitempty"`
	Params         json.RawMessage `json:"params,omitempty"`
	ResponseParams json.RawMessage `json:"responseParams,omitempty"`
	Async          json.RawMessage `json:"async,omitempty"`
	Capabilities   json.RawMessage `json:"capabilities,omitempty"`
	Enabled        *bool           `json:"enabled,omitempty"`
	// RequestTemplate 为指针：nil = 不变；非 nil = 整体替换（含清空为 ""，回到 params[] 组装）。
	RequestTemplate *string `json:"requestTemplate,omitempty"`
}

func (t *ProtocolTemplatePatch) Validate() error {
	if t.Type != "" && t.Type != "text" && t.Type != "image" && t.Type != "video" && t.Type != "all" {
		return errors.New("catalog: invalid template type")
	}
	if t.Method != "" && t.Method != "POST" && t.Method != "GET" {
		return errors.New("catalog: invalid method")
	}
	if len(t.Params) > 0 {
		var probe any
		if err := json.Unmarshal(t.Params, &probe); err != nil {
			return errors.New("catalog: invalid params")
		}
	}
	if len(t.ResponseParams) > 0 {
		var probe any
		if err := json.Unmarshal(t.ResponseParams, &probe); err != nil {
			return errors.New("catalog: invalid response params")
		}
	}
	if len(t.Async) > 0 && string(t.Async) != "null" {
		var probe any
		if err := json.Unmarshal(t.Async, &probe); err != nil {
			return errors.New("catalog: invalid async declaration")
		}
	}
	return nil
}

type Directory struct {
	Channels  []Channel          `json:"channels"`
	Models    []Model            `json:"models"`
	Templates []ProtocolTemplate `json:"templates"`
}

type ModelPatch struct {
	ChannelID          string          `json:"channelId,omitempty"`
	Family             string          `json:"family,omitempty"`
	Name               string          `json:"name,omitempty"`
	ProviderModel      string          `json:"providerModel,omitempty"`
	Type               string          `json:"type,omitempty"`
	Status             string          `json:"status,omitempty"`
	Sort               *int            `json:"sort,omitempty"`
	Note               string          `json:"note,omitempty"`
	ProtocolTemplateID string          `json:"protocolTemplateId,omitempty"`
	RequestPath        string          `json:"requestPath,omitempty"`
	Method             string          `json:"method,omitempty"`
	Params             json.RawMessage `json:"params,omitempty"`
	ResponseParams     json.RawMessage `json:"responseParams,omitempty"`
	Capability         json.RawMessage `json:"capability,omitempty"`
}

type ChannelPatch struct {
	Name     string `json:"name,omitempty"`
	BaseURL  string `json:"baseUrl,omitempty"`
	AuthType string `json:"authType,omitempty"`
	Enabled  *bool  `json:"enabled,omitempty"`
	Note     string `json:"note,omitempty"`
	Sort     *int   `json:"sort,omitempty"`
}

func (m *ModelPatch) Validate() error {
	if m.Type != "" && m.Type != "text" && m.Type != "image" && m.Type != "video" {
		return ErrInvalidType
	}
	if m.Status != "" && m.Status != "enabled" && m.Status != "disabled" {
		return ErrInvalidStatus
	}
	if len(m.Capability) > 0 {
		var probe any
		if err := json.Unmarshal(m.Capability, &probe); err != nil {
			return ErrInvalidCapability
		}
	}
	return nil
}

func (p *ChannelPatch) Validate() error {
	if p.AuthType != "" && p.AuthType != "bearer" && p.AuthType != "apikey" && p.AuthType != "sign" && p.AuthType != "none" {
		return errors.New("catalog: invalid auth type")
	}
	return nil
}

func isModelID(id string) bool {
	return len(id) == 24 && strings.HasPrefix(id, "mod_")
}

func (m Model) Validate() error {
	if m.Method != "" && m.Method != "POST" && m.Method != "GET" {
		return fmt.Errorf("catalog: invalid method")
	}
	switch {
	case !isModelID(m.ID):
		return errors.New("catalog: id must be mod_ + 24 chars")
	case m.ChannelID == "":
		return ErrInvalidChannel
	case strings.TrimSpace(m.Name) == "":
		return errors.New("catalog: name is required")
	case m.Type != "text" && m.Type != "image" && m.Type != "video":
		return ErrInvalidType
	case m.Status != "enabled" && m.Status != "disabled":
		return ErrInvalidStatus
	}
	if len(m.Capability) == 0 {
		m.Capability = []byte("{}")
	}
	var probe any
	if err := json.Unmarshal(m.Capability, &probe); err != nil {
		return ErrInvalidCapability
	}
	return nil
}

type Store interface {
	Directory(context.Context) (Directory, error)
	GetModel(context.Context, string) (Model, error)
	CreateModel(context.Context, string, Model) (Model, bool, error) // (model, duplicate, err)
	UpdateModel(context.Context, string, ModelPatch) (Model, error)
	UpdateChannel(context.Context, string, ChannelPatch) (Channel, error)
}

func normalizeModelPatch(p ModelPatch) (ModelPatch, error) {
	if p.Method != "" && p.Method != "POST" && p.Method != "GET" {
		return p, fmt.Errorf("catalog: invalid method")
	}
	if p.Capability != nil && len(p.Capability) == 0 {
		p.Capability = []byte("{}")
	}
	return p, p.Validate()
}

func randomHex(n int) string {
	b := make([]byte, (n+1)/2)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%d", timeNowNanos())
	}
	return hex.EncodeToString(b)[:n]
}

func modelID() string {
	return "mod_" + randomHex(20)
}

func timeNowNanos() int64 {
	return time.Now().UnixNano()
}
