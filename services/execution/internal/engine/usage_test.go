package engine

import (
	"encoding/json"
	"testing"
)

// D4a/D4c：usage 抽取是纯函数 ⇒ 可单测，不需要数据库与上游。
// 它同时是同步路径与异步路径的【同一份】实现，所以这里锁住的行为对两条链路都生效。

func TestUsageFromExtractedPrefersDottedKeys(t *testing.T) {
	// 键名依据：pt_builtin_openai 的 response_params 原文（点路径即键）
	ex := map[string]any{
		"usage.prompt_tokens":     float64(35),
		"usage.completion_tokens": float64(38),
		"usage.total_tokens":      float64(132),
	}
	in, out, cached := UsageFromExtracted(ex)
	if in != 35 || out != 38 || cached != 0 {
		t.Fatalf("期望 in=35 out=38 cached=0，得到 in=%d out=%d cached=%d", in, out, cached)
	}
}

func TestUsageFromExtractedAcceptsAlternateShapes(t *testing.T) {
	cases := []struct {
		name            string
		ex              map[string]any
		in, out, cached int
	}{
		{"无前缀写法", map[string]any{"prompt_tokens": float64(1), "completion_tokens": float64(2)}, 1, 2, 0},
		{"Anthropic 风格 input/output", map[string]any{"usage.input_tokens": float64(3), "usage.output_tokens": float64(4)}, 3, 4, 0},
		{"缓存命中", map[string]any{"usage.cached_tokens": float64(9)}, 0, 0, 9},
		{"OpenAI 嵌套缓存字段", map[string]any{"usage.prompt_tokens_details.cached_tokens": float64(7)}, 0, 0, 7},
		{"json.Number（解码器给了具体类型时）", map[string]any{"usage.prompt_tokens": json.Number("12")}, 12, 0, 0},
		{"int 而非 float64", map[string]any{"usage.prompt_tokens": 5}, 5, 0, 0},
		{"没有 usage 字段", map[string]any{"choices.0.message.content": "hi"}, 0, 0, 0},
		{"nil map 不 panic", nil, 0, 0, 0},
		{"未知类型按 0 处理，不 panic", map[string]any{"usage.prompt_tokens": "35"}, 0, 0, 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			in, out, cached := UsageFromExtracted(c.ex)
			if in != c.in || out != c.out || cached != c.cached {
				t.Fatalf("期望 in=%d out=%d cached=%d，得到 in=%d out=%d cached=%d",
					c.in, c.out, c.cached, in, out, cached)
			}
		})
	}
}
