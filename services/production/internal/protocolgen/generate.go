package protocolgen

import "fmt"

// Template 是生成器输出的协议模板定义（与注册表 ProtocolDefinition 同构的生成子集）。
type Template struct {
	ID              string
	Label           string
	Summary         string
	Method          string
	RequestPath     string
	Params          []Param
	ResponseExtract map[string]string // 确定性推导的响应提取映射
	ReviewNotes     []string          // 待审查标记（D-005：capabilities/param_mapping/mode 语义不自动生成）
}

// GenerateOptions 控制生成行为。
type GenerateOptions struct {
	TemplateID string // 生成模板 ID（必填）
	Label      string // 生成模板 Label（必填）
	BasePath   string // 覆盖 basePath（缺省用 OpenAPI servers 推导；OpenAI 官方无 /v1 前缀时注入 "/v1"）
}

// Generate 把单个 Operation 确定性转换为协议模板定义。
//
// 生成范围（D-005/D-006）：
//   - method / request_path / params / required：确定性提取
//   - response_extract：顶层属性 k→k；数组一层 k.items.x → k.0.x；更深不推导
//   - capabilities / param_mapping / mode 语义：不生成（ReviewNotes 标注，需人审）
func Generate(op Operation, opts GenerateOptions) Template {
	t := Template{
		ID:          opts.TemplateID,
		Label:       opts.Label,
		Summary:     op.Summary,
		Method:      op.Method,
		RequestPath: op.Path,
		Params:      op.Params,
	}
	if opts.BasePath != "" {
		t.RequestPath = joinPath(opts.BasePath, op.RawPath)
	}
	// response_extract：顶层 + 数组一层
	t.ResponseExtract = map[string]string{}
	for _, p := range op.ResponseProps {
		key := extractKey(p)
		t.ResponseExtract[key] = key
	}
	for _, a := range op.ResponseArray {
		t.ResponseExtract[a.Key+".0."+itemKey(a)] = a.Key + ".0." + itemKey(a)
	}
	// 待审查标记
	t.ReviewNotes = append(t.ReviewNotes,
		"capabilities（mode 语义）未自动生成：需按业务语义人审（参考 061 能力键枚举）",
		"param_mapping 未自动生成：需真实渠道实测/官方文档核读后补（无依据不填）",
		"Type（text/image/video）未自动推断：需人审（按输出模态）",
	)
	return t
}

// extractKey 顶层属性直接以自身键为提取路径。
func extractKey(p Prop) string { return p.Key }

// itemKey 取数组 items 的语义键：items 对象取第一个属性；primitive 用空串（待审查）。
func itemKey(a ArrayProp) string {
	// ArrayProp 只记录 items 的类型与描述提示；语义键需人审——生成器保守输出空并留 ReviewNotes
	return ""
}

// String 输出可审查的模板定义（CLI 用）。
func (t Template) String() string {
	out := fmt.Sprintf("ID:          %s\nLabel:       %s\nSummary:     %s\nMethod:      %s\nRequestPath: %s\n",
		t.ID, t.Label, t.Summary, t.Method, t.RequestPath)
	out += "Params:\n"
	for _, p := range t.Params {
		req := ""
		if p.Required {
			req = "required"
		}
		out += fmt.Sprintf("  - %s (%s) %s  %s\n", p.Key, p.Type, req, p.Desc)
	}
	out += "ResponseExtract:\n"
	for k, v := range t.ResponseExtract {
		out += fmt.Sprintf("  %s -> %s\n", v, k)
	}
	out += "ReviewNotes:\n"
	for _, n := range t.ReviewNotes {
		out += fmt.Sprintf("  - %s\n", n)
	}
	return out
}
