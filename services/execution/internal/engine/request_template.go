package engine

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// 本文件是 ADR-007 D3「请求模板」的渲染器：纯函数、无 IO、可单测。
//
// 背景：协议模板此前只用 params[]（key/value/type/role 三分类）描述请求体，形状由执行器
// 的组装代码决定，模板只能声明「有哪些参数」——表达不了嵌套结构，也表达不了 multipart。
// D3 改为一个带 {{占位符}} 的请求模板字符串：请求体长什么样，一眼可见。
//
// 与 params[] 形态并存：RequestTemplate 为空时执行器仍走 params[] 组装（行为逐字不变）。

// ErrTemplateMissingValue 表示模板引用了取值表里不存在的占位符。
//
// 语义决策（ADR-007 D3 规格第 3 条，二选一）：**缺失 key 返回明确错误**，不保持原样、
// 更不静默替换成空串。
//   - 静默替换成空串会生成 `"model":,` 这类残缺 JSON，错误被推迟到上游 400，排查成本高；
//   - 保持原样（把 {{key}} 原样留在请求体里）同样会发出非法 JSON，只是更隐蔽；
//   - 明确报错让「模板引用了执行器不提供的字段」在提交时就暴露，错误信息里带占位符名。
//
// 代价：模板不得引用「可有可无」的字段（例如参数表里 role=runtime 但本次调用没给的 key）。
// 需要可选字段时，应由调用方保证 key 存在（值可为 null —— 见 renderTemplateValue）。
var ErrTemplateMissingValue = errors.New("engine: request template placeholder has no value")

// RenderRequestTemplate 把 tpl 里的每个 {{key}}（两侧允许空格：{{ key }}）替换为
// values[key] 的 JSON 值，返回渲染结果。
//
// 取值语义（value → 文本）：
//
//	string → **原样插入，不加引号**（模板里通常自己写了引号：`"prompt":"{{prompt}}"`）；
//	nil    → `null`；
//	其余（数字/布尔/对象/数组/其它）→ json.Marshal 后的 JSON 文本（数字/布尔为字面量，
//	         对象/数组为 JSON 文本，键按 Go 的规则排序）。
//
// 转义是**调用方（模板作者）的责任**：字符串原样插入意味着值里出现 `"`、换行或反斜杠时
// 会破坏 JSON。需要安全插入任意字符串时，应在取值表里放已经 JSON 编码过的值，并让模板
// 不要额外写引号（`{"text":{{text_json}}}`），或改用其它替代形态。渲染器不做转义、也不做
// 「猜作者意图」的预处理——保持「所见即所得」。
//
// 其它边界：
//   - tpl 为空 → 返回 ""（是否回退到 params[] 由调用方决定；执行器在调用前已判断非空）；
//   - tpl 里没有占位符 → 原样返回（不做任何改写，空白/换行逐字保留）；
//   - `{{` 没有配对的 `}}`，或 `{{}}`／`{{   }}`（空 key）→ 视为普通文本原样保留，
//     因为把 `{{` 当作转义规则会误伤请求体里的合法内容（例如提示词文本）；
//   - 模板文本不会被 JSON 校验：multipart / 非 JSON 请求体是 D3 的合法目标形态。
func RenderRequestTemplate(tpl string, values map[string]any) (string, error) {
	if tpl == "" {
		return "", nil
	}
	var b strings.Builder
	b.Grow(len(tpl))
	for i := 0; i < len(tpl); {
		if strings.HasPrefix(tpl[i:], "{{") {
			if end := strings.Index(tpl[i+2:], "}}"); end >= 0 {
				key := strings.TrimSpace(tpl[i+2 : i+2+end])
				if key != "" {
					value, ok := values[key]
					if !ok {
						return "", fmt.Errorf("%w: {{%s}}", ErrTemplateMissingValue, key)
					}
					rendered, err := renderTemplateValue(value)
					if err != nil {
						return "", fmt.Errorf("engine: request template value %q: %w", key, err)
					}
					_, _ = b.WriteString(rendered)
					i += 2 + end + 2
					continue
				}
			}
		}
		_ = b.WriteByte(tpl[i])
		i++
	}
	return b.String(), nil
}

// renderTemplateValue 把一个取值渲染成插入模板的文本，见 RenderRequestTemplate 的语义表。
func renderTemplateValue(value any) (string, error) {
	// 字符串原样插入：引号由模板作者写（`"prompt":"{{prompt}}"`）。
	if s, ok := value.(string); ok {
		return s, nil
	}
	if value == nil {
		return "null", nil
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	return string(raw), nil
}
