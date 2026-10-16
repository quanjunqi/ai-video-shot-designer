// Package protocolgen 从 OpenAPI 3.x 规范**确定性**生成协议模板定义。
//
// 动机（TASK-PROTOCOL-003）：本仓 9 个 builtin 协议模板全部手写（protocol_registry.go + DB 行），
// 手写的风险 = 臆测（无依据不填原则）。本包用上游官方 OpenAPI 规范作为**独立输入**，
// 生成器输出协议定义（method / request_path / params / required / response_extract 确定性提取），
// 使协议定义可追溯到上游文档——官方文档可独立验证手写定义的正确性。
//
// 确定性规则（同一输入 → 同一输出）：
//   - $ref：仅解析文件内 #/components/schemas/...；跨文件 ref 报错（D-002）
//   - allOf：合并各分支（properties 并集、required 并集、type 取首个非空）（D-003）
//   - oneOf/anyOf：取第一个含 properties 的分支，其余跳过并记录（D-003）
//   - basePath：优先从 servers[0].url 提取路径段；缺省由调用方注入（D-004）
//   - capabilities / param_mapping：**不自动生成**（mode 语义需人审；param_mapping 需实测）（D-005）
//   - response_extract：只推导顶层 properties 与数组 items 一层（data.items.url → data.0.url）（D-006）
//
// 零外部依赖（D-001）：仅 encoding/json + 手写解析。
package protocolgen

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// Spec 是 OpenAPI 文档的极小子集（只承载解析所需结构）。
type Spec struct {
	OpenAPI    string                     `json:"openapi"`
	Info       map[string]any             `json:"info"`
	Servers    []map[string]any           `json:"servers"`
	Paths      map[string]map[string]any  `json:"paths"`
	Components map[string]map[string]any  `json:"components"`
	Raw        map[string]json.RawMessage `json:"-"`
}

// Operation 是单个端点操作（path × method）的解析结果。
type Operation struct {
	RawPath       string // 原始路径（无 basePath；Generate 时 basePath 可覆盖）
	Path          string // 最终路径（servers basePath + RawPath）
	Method        string
	Summary       string
	Params        []Param // path/query 参数 + requestBody schema 属性
	Required      []string
	ResponseProps []Prop      // 200 响应顶层属性
	ResponseArray []ArrayProp // 200 响应数组属性（items 一层）
	ReviewNotes   []string    // 待审查标记（确定性之外的内容）
}

// Param 是请求参数（与注册表 Param 同构的生成子集）。
type Param struct {
	Key      string
	Type     string
	Required bool
	Desc     string
}

// Prop 是响应对象属性。
type Prop struct {
	Key  string
	Type string
	Desc string
}

// ArrayProp 是响应数组属性（items 一层）。
type ArrayProp struct {
	Key      string
	ItemType string
	ItemDesc string
}

// ErrUnsupportedRef 表示跨文件 $ref（明确不支持，不静默）。
type ErrUnsupportedRef struct{ Ref string }

func (e ErrUnsupportedRef) Error() string {
	return fmt.Sprintf("protocolgen: 跨文件 $ref 不支持: %s（仅支持文件内 #/components/schemas/...）", e.Ref)
}

// ErrNotOpenAPI3 表示文档不是 OpenAPI 3.x。
type ErrNotOpenAPI3 struct{ Version string }

func (e ErrNotOpenAPI3) Error() string {
	return fmt.Sprintf("protocolgen: 不是 OpenAPI 3.x 文档: openapi=%q", e.Version)
}

// Parse 解析 OpenAPI 3.x JSON 文档，返回目标操作列表。
// 支持 openapi 3.0.x / 3.1.x；文档缺 paths 或路径为空 → 空列表（不报错）。
func Parse(doc []byte) ([]Operation, error) {
	var s Spec
	if err := json.Unmarshal(doc, &s); err != nil {
		return nil, fmt.Errorf("protocolgen: 解析 OpenAPI JSON: %w", err)
	}
	if !strings.HasPrefix(s.OpenAPI, "3.") {
		return nil, ErrNotOpenAPI3{Version: s.OpenAPI}
	}
	basePath := BasePath(s)
	var ops []Operation
	for path, item := range s.Paths {
		for method, raw := range item {
			if !isHTTPMethod(method) {
				continue
			}
			op, err := parseOperation(s, path, method, raw, basePath)
			if err != nil {
				return nil, err
			}
			ops = append(ops, op)
		}
	}
	sort.Slice(ops, func(i, j int) bool {
		if ops[i].Path != ops[j].Path {
			return ops[i].Path < ops[j].Path
		}
		return ops[i].Method < ops[j].Method
	})
	return ops, nil
}

// BasePath 从 servers[0].url 提取路径段（https://api.openai.com/v1 → /v1）；无路径段返回 ""。
func BasePath(s Spec) string {
	for _, sv := range s.Servers {
		u, _ := sv["url"].(string)
		if u == "" {
			continue
		}
		// 去掉 scheme://host[:port]，取第一个路径段
		rest := u
		if i := strings.Index(rest, "://"); i >= 0 {
			rest = rest[i+3:]
		}
		if i := strings.IndexAny(rest, "/"); i >= 0 {
			seg := rest[i:]
			if j := strings.IndexAny(seg, "?#"); j >= 0 {
				seg = seg[:j]
			}
			return strings.TrimSuffix(seg, "/")
		}
		return ""
	}
	return ""
}

func isHTTPMethod(m string) bool {
	switch strings.ToUpper(m) {
	case "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS":
		return true
	}
	return false
}

func parseOperation(s Spec, path, method string, raw any, basePath string) (Operation, error) {
	m, ok := raw.(map[string]any)
	if !ok {
		return Operation{}, fmt.Errorf("protocolgen: %s %s 操作节点不是对象", method, path)
	}
	op := Operation{
		RawPath: path,
		Path:    joinPath(basePath, path),
		Method:  strings.ToUpper(method),
	}
	if sm, _ := m["summary"].(string); sm != "" {
		op.Summary = sm
	}

	// 1. parameters（path/query/header）
	if ps, ok := m["parameters"].([]any); ok {
		for _, p := range ps {
			pm, ok := p.(map[string]any)
			if !ok {
				continue
			}
			name, _ := pm["name"].(string)
			if name == "" {
				continue
			}
			desc, _ := pm["description"].(string)
			required := false
			if r, ok := pm["required"].(bool); ok {
				required = r
			}
			typ := schemaType(pm["schema"])
			op.Params = append(op.Params, Param{Key: name, Type: typ, Required: required, Desc: desc})
			if required {
				op.Required = append(op.Required, name)
			}
		}
	}

	// 2. requestBody → application/json schema 属性
	if rb, ok := m["requestBody"].(map[string]any); ok {
		if content, ok := rb["content"].(map[string]any); ok {
			if mt, ok := content["application/json"].(map[string]any); ok {
				if sch, ok := mt["schema"].(map[string]any); ok {
					schema, err := resolveSchemaNode(s, sch)
					if err != nil {
						return Operation{}, fmt.Errorf("protocolgen: %s %s requestBody: %w", method, path, err)
					}
					if schema != nil {
						for _, k := range schema.OrderedKeys {
							p, ok := schema.Properties[k]
							if !ok {
								continue
							}
							op.Params = append(op.Params, Param{Key: k, Type: p.Type, Required: schema.RequiredSet[k], Desc: p.Desc})
							if schema.RequiredSet[k] {
								op.Required = append(op.Required, k)
							}
						}
					}
				}
			}
		}
	}

	// 3. responses.200 → application/json schema 顶层属性 + 数组一层
	if resps, ok := m["responses"].(map[string]any); ok {
		resp, ok := respJSONSchema(resps)
		if ok {
			schema, err := resolveSchemaNode(s, resp)
			if err != nil {
				return Operation{}, fmt.Errorf("protocolgen: %s %s responses.200: %w", method, path, err)
			}
			if schema != nil {
				for _, k := range schema.OrderedKeys {
					p, ok := schema.Properties[k]
					if !ok {
						continue
					}
					if p.Items != nil {
						op.ResponseArray = append(op.ResponseArray, ArrayProp{Key: k, ItemType: p.Items.Type, ItemDesc: p.Items.Desc})
						continue
					}
					op.ResponseProps = append(op.ResponseProps, Prop{Key: k, Type: p.Type, Desc: p.Desc})
				}
			}
		}
	}
	return op, nil
}

// joinPath 拼接 basePath 与端点路径（/v1 + /chat/completions → /v1/chat/completions）。
func joinPath(base, path string) string {
	if base == "" {
		return path
	}
	return strings.TrimSuffix(base, "/") + path
}

// respJSONSchema 取 responses 200/201 的 application/json schema。
func respJSONSchema(resps map[string]any) (map[string]any, bool) {
	for _, code := range []string{"200", "201"} {
		r, ok := resps[code].(map[string]any)
		if !ok {
			continue
		}
		if content, ok := r["content"].(map[string]any); ok {
			if mt, ok := content["application/json"].(map[string]any); ok {
				if sch, ok := mt["schema"].(map[string]any); ok {
					return sch, true
				}
			}
		}
	}
	return nil, false
}

// schemaType 取参数 schema 的类型（primitive 或 string 默认）。
func schemaType(v any) string {
	m, ok := v.(map[string]any)
	if !ok {
		return "string"
	}
	if t, _ := m["type"].(string); t != "" {
		return t
	}
	if len(m) == 0 {
		return "string"
	}
	return "object"
}
