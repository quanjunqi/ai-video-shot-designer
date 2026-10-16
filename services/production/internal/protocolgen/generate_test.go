package protocolgen

import (
	"strings"
	"testing"
)

// TestGenerateChatMatchesRegistry：官方 OpenAPI 独立验证 pt_builtin_openai 手写定义（判据 3）。
//
// 断言：Generate(/chat/completions) 的 RequestPath=/v1/chat/completions，
// params 键集 ⊇ 注册表 pt_builtin_openai params 键集——官方文档字段覆盖手写定义 ⇒ 手写无臆测。
func TestGenerateChatMatchesRegistry(t *testing.T) {
	ops := parseFixture(t)
	op, ok := opByPath(ops, "/v1/chat/completions")
	if !ok {
		t.Fatalf("未找到 /v1/chat/completions（servers basePath 提取失败？）")
	}
	tmpl := Generate(op, GenerateOptions{TemplateID: "pt_builtin_openai", Label: "OpenAI 兼容 Chat"})
	if tmpl.RequestPath != "/v1/chat/completions" {
		t.Fatalf("RequestPath = %q，want /v1/chat/completions", tmpl.RequestPath)
	}
	got := paramKeys(op)
	// 注册表 pt_builtin_openai params 键（protocol_registry.go，迁移 010 定稿）
	registryKeys := []string{"model", "messages", "temperature", "top_p", "max_tokens", "n",
		"stream", "presence_penalty", "frequency_penalty", "stop", "tools", "tool_choice",
		"response_format", "user"}
	var missing []string
	for _, k := range registryKeys {
		if !contains(got, k) {
			missing = append(missing, k)
		}
	}
	if len(missing) > 0 {
		t.Fatalf("官方字段未覆盖注册表手写键：%v（官方 got %d 键）——手写定义存在臆测，须审查", missing, len(got))
	}
}

// TestGenerateImagesMatchesRegistry：官方 OpenAPI 独立验证 pt_builtin_openai_img（判据 4）。
func TestGenerateImagesMatchesRegistry(t *testing.T) {
	ops := parseFixture(t)
	op, ok := opByPath(ops, "/v1/images/generations")
	if !ok {
		t.Fatalf("未找到 /v1/images/generations")
	}
	tmpl := Generate(op, GenerateOptions{TemplateID: "pt_builtin_openai_img", Label: "OpenAI 兼容图片"})
	if tmpl.RequestPath != "/v1/images/generations" {
		t.Fatalf("RequestPath = %q", tmpl.RequestPath)
	}
	got := paramKeys(op)
	for _, k := range []string{"model", "prompt", "n", "size", "quality", "response_format"} {
		if !contains(got, k) {
			t.Fatalf("官方 images 字段缺注册表键 %s，got %v", k, got)
		}
	}
}

// TestGenerateNoInference：capabilities/param_mapping 不自动生成，含待审查标记（判据 5）。
func TestGenerateNoInference(t *testing.T) {
	ops := parseFixture(t)
	op, _ := opByPath(ops, "/v1/chat/completions")
	tmpl := Generate(op, GenerateOptions{TemplateID: "pt_builtin_openai", Label: "OpenAI 兼容 Chat"})
	joined := strings.Join(tmpl.ReviewNotes, "|")
	if !strings.Contains(joined, "capabilities") || !strings.Contains(joined, "param_mapping") {
		t.Fatalf("应含 capabilities/param_mapping 待审查标记，got %v", tmpl.ReviewNotes)
	}
	// 生成器结构本身不含这两个字段（编译期保证：Template 无 Capabilities/ParamMapping 字段）
}

// TestGenerateBasePathOverride：BasePath 注入覆盖 servers（D-004）。
func TestGenerateBasePathOverride(t *testing.T) {
	doc := []byte(`{"openapi":"3.1.0","paths":{"/chat/completions":{"post":{"requestBody":{"content":{"application/json":{"schema":{"type":"object","properties":{"messages":{"type":"array"}},"required":["messages"]}}}}}}}}`)
	ops, err := Parse(doc)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	op := ops[0]
	tmpl := Generate(op, GenerateOptions{TemplateID: "x", Label: "x", BasePath: "/v1"})
	if tmpl.RequestPath != "/v1/chat/completions" {
		t.Fatalf("BasePath 注入失败: %q", tmpl.RequestPath)
	}
}

// TestGenerateResponseExtractTopLevel：顶层 + 数组一层推导（D-006）。
func TestGenerateResponseExtractTopLevel(t *testing.T) {
	doc := []byte(`{
  "openapi":"3.1.0",
  "paths":{"/x":{"post":{
    "responses":{"200":{"content":{"application/json":{"schema":{"type":"object","properties":{
      "id":{"type":"string"},
      "data":{"type":"array","items":{"type":"object","properties":{"url":{"type":"string"}}}}
    }}}}}
  }}}}
}`)
	ops, err := Parse(doc)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	tmpl := Generate(ops[0], GenerateOptions{TemplateID: "x", Label: "x"})
	if tmpl.ResponseExtract["id"] != "id" {
		t.Fatalf("顶层属性推导失败: %v", tmpl.ResponseExtract)
	}
	foundArray := false
	for k, v := range tmpl.ResponseExtract {
		if strings.HasPrefix(k, "data.0.") && v == k {
			foundArray = true
		}
	}
	if !foundArray {
		t.Fatalf("数组一层推导失败: %v", tmpl.ResponseExtract)
	}
}
