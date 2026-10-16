package engine

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

// ---- 渲染器单测（ADR-007 D3 语义表） ----

func TestRenderRequestTemplate(t *testing.T) {
	cases := []struct {
		name   string
		tpl    string
		values map[string]any
		want   string
	}{
		{
			name:   "字符串原样插入（不加引号，引号由模板作者写）",
			tpl:    `{"prompt":"{{prompt}}"}`,
			values: map[string]any{"prompt": "一只猫"},
			want:   `{"prompt":"一只猫"}`,
		},
		{
			name:   "数字为 JSON 字面量",
			tpl:    `{"n":{{n}},"ratio":{{ratio}}}`,
			values: map[string]any{"n": 1, "ratio": 1.5},
			want:   `{"n":1,"ratio":1.5}`,
		},
		{
			name:   "整数值的 float64 不渲染成 1.0",
			tpl:    `{"n":{{n}}}`,
			values: map[string]any{"n": float64(3)},
			want:   `{"n":3}`,
		},
		{
			name:   "布尔为 JSON 字面量",
			tpl:    `{"stream":{{stream}}}`,
			values: map[string]any{"stream": false},
			want:   `{"stream":false}`,
		},
		{
			name:   "对象为 JSON 文本",
			tpl:    `{"input_reference":{{ref}}}`,
			values: map[string]any{"ref": map[string]any{"image_url": "https://cdn/x.png", "strength": 0.6}},
			want:   `{"input_reference":{"image_url":"https://cdn/x.png","strength":0.6}}`,
		},
		{
			name:   "数组为 JSON 文本",
			tpl:    `{"stop":{{stop}}}`,
			values: map[string]any{"stop": []any{"\n", "###"}},
			want:   `{"stop":["\n","###"]}`,
		},
		{
			name:   "嵌套结构：数组里放对象（模板能表达的形态）",
			tpl:    `{"messages":{{messages}}}`,
			values: map[string]any{"messages": []any{map[string]any{"role": "user", "content": "你好"}}},
			want:   `{"messages":[{"content":"你好","role":"user"}]}`,
		},
		{
			name:   "占位符两侧允许空格",
			tpl:    `{"stream":{{ stream }},"p":"{{  prompt  }}"}`,
			values: map[string]any{"stream": false, "prompt": "x"},
			want:   `{"stream":false,"p":"x"}`,
		},
		{
			name:   "同一占位符出现多次",
			tpl:    `{"a":"{{v}}","b":"{{v}}"}`,
			values: map[string]any{"v": "z"},
			want:   `{"a":"z","b":"z"}`,
		},
		{
			name:   "nil 渲染为 null",
			tpl:    `{"tools":{{tools}}}`,
			values: map[string]any{"tools": nil},
			want:   `{"tools":null}`,
		},
		{
			name:   "空模板返回空串（是否回退由调用方决定）",
			tpl:    "",
			values: map[string]any{"a": 1},
			want:   "",
		},
		{
			name:   "无占位符的模板原样返回（不做任何改写）",
			tpl:    "{\n  \"stream\": false\n}",
			values: map[string]any{"stream": true},
			want:   "{\n  \"stream\": false\n}",
		},
		{
			name:   "未闭合的 {{ 视为普通文本（不误伤请求体里的合法内容）",
			tpl:    `{"text":"a {{ b"}`,
			values: map[string]any{},
			want:   `{"text":"a {{ b"}`,
		},
		{
			name:   "空 key（{{}} / {{ }}）视为普通文本",
			tpl:    `{"a":{{}},"b":{{  }}}`,
			values: map[string]any{"": "x"},
			want:   `{"a":{{}},"b":{{  }}}`,
		},
		{
			name:   "multipart 形态：模板文本即请求体（渲染器不假设 JSON）",
			tpl:    "--B\r\nContent-Disposition: form-data; name=\"prompt\"\r\n\r\n{{prompt}}\r\n--B--\r\n",
			values: map[string]any{"prompt": "一只猫"},
			want:   "--B\r\nContent-Disposition: form-data; name=\"prompt\"\r\n\r\n一只猫\r\n--B--\r\n",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := RenderRequestTemplate(tc.tpl, tc.values)
			if err != nil {
				t.Fatalf("RenderRequestTemplate: %v", err)
			}
			if got != tc.want {
				t.Fatalf("RenderRequestTemplate:\n got: %q\nwant: %q", got, tc.want)
			}
		})
	}
}

// TestRenderRequestTemplateMissingValue 锁定「缺失 key → 明确错误」的选择：
// 既不静默替换成空串（会生成 "model":, 这类残缺 JSON），也不把 {{key}} 原样留在请求体里。
func TestRenderRequestTemplateMissingValue(t *testing.T) {
	_, err := RenderRequestTemplate(`{"model":"{{model}}","n":{{n}}}`, map[string]any{"model": "m"})
	if err == nil {
		t.Fatal("missing placeholder value must return an error, got nil")
	}
	if !errors.Is(err, ErrTemplateMissingValue) {
		t.Fatalf("err = %v, want ErrTemplateMissingValue", err)
	}
	if !strings.Contains(err.Error(), "{{n}}") {
		t.Fatalf("error must name the missing placeholder, got: %v", err)
	}
}

// TestRenderRequestTemplateRawStringIsCallerResponsibility 锁定字符串「原样插入」的后果：
// 值里含引号/换行时，插入后的请求体不再是合法 JSON —— 这是模板作者的责任（模板里写引号；
// 需要插入任意字符串时应放入已 JSON 编码的值，且模板不要再额外写引号）。
func TestRenderRequestTemplateRawStringIsCallerResponsibility(t *testing.T) {
	// ① 原样插入的裸字符串会破坏 JSON：渲染本身成功（渲染器不猜作者意图、不做转义）。
	rendered, err := RenderRequestTemplate(`{"prompt":"{{prompt}}"}`, map[string]any{"prompt": "he said \"hi\"\nbye"})
	if err != nil {
		t.Fatalf("RenderRequestTemplate: %v", err)
	}
	var probe map[string]any
	if err := json.Unmarshal([]byte(rendered), &probe); err == nil {
		t.Fatalf("裸字符串插入含引号/换行的值本应破坏 JSON，实际可解析：%s", rendered)
	}

	// ② 调用方承担转义：取值表里放已 JSON 编码的字符串，模板不再写引号 → 合法 JSON。
	quoted, err := json.Marshal("he said \"hi\"\nbye")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	rendered, err = RenderRequestTemplate(`{"prompt":{{prompt}}}`, map[string]any{"prompt": string(quoted)})
	if err != nil {
		t.Fatalf("RenderRequestTemplate: %v", err)
	}
	if err := json.Unmarshal([]byte(rendered), &probe); err != nil {
		t.Fatalf("已编码的值不应破坏 JSON: %v (%s)", err, rendered)
	}
	if probe["prompt"] != "he said \"hi\"\nbye" {
		t.Fatalf("prompt = %q", probe["prompt"])
	}
}

// ---- 装配点：兼容性 + 共享语义 ----

// legacyBodyReference 复刻重构前同步路径（Run 内联）的完整装配：
// params 合并 → role 三分类 → task_type 注入（async 声明非空）→ __passthrough 注入 → marshal。
//
// 与改动前源码逐字一致，唯一差别是删掉了从未被读取的 order 切片（对返回值无影响）。
// 它的作用是**锁定重构后字节完全一致**：assembleBody 必须与它输出同样的字节。
func legacyBodyReference(req RunRequest) ([]byte, error) {
	byKey := map[string]Param{}
	for _, p := range req.ProtocolTemplate.Params {
		byKey[p.Key] = p
	}
	for _, p := range req.ModelParams {
		if p.Key != "" {
			byKey[p.Key] = p
		}
	}
	body := map[string]any{}
	for _, p := range req.ProtocolTemplate.Params {
		spec, ok := byKey[p.Key]
		if !ok {
			continue
		}
		if p.Key == "" {
			continue
		}
		switch spec.Role {
		case "model":
			body[p.Key] = req.ProviderModel
		case "runtime":
			if v, has := req.Runtime[p.Key]; has {
				body[p.Key] = v
			}
		default:
			if v, has := req.Runtime["__"+p.Key]; has {
				body[p.Key] = v
				continue
			}
			val := strings.TrimSpace(spec.Value)
			if val == "" {
				continue
			}
			body[p.Key] = parseJSONValue(val)
		}
	}
	if len(req.ProtocolTemplate.Async) > 0 {
		body["task_type"] = "sync"
	}
	if pt, ok := req.Runtime["__passthrough"].(map[string]any); ok {
		for k, v := range pt {
			if k != "" && v != nil {
				body[k] = v
			}
		}
	}
	return json.Marshal(body)
}
