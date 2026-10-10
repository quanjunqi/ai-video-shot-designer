package mapping

import (
	"encoding/json"
	"testing"
)

func TestParsePath(t *testing.T) {
	tests := []struct {
		path     string
		expected []any
	}{
		{"prompt", []any{"prompt"}},
		{"a.b.c", []any{"a", "b", "c"}},
		{"reference_images[0].url", []any{"reference_images", 0, "url"}},
		{"data[0].url", []any{"data", 0, "url"}},
	}
	for _, tt := range tests {
		result := parsePath(tt.path)
		if len(result) != len(tt.expected) {
			t.Errorf("parsePath(%q) length = %d, want %d", tt.path, len(result), len(tt.expected))
			continue
		}
		for i, v := range result {
			if v != tt.expected[i] {
				t.Errorf("parsePath(%q)[%d] = %v, want %v", tt.path, i, v, tt.expected[i])
			}
		}
	}
}

func TestGetNestedValue(t *testing.T) {
	data := map[string]any{
		"prompt": "hello",
		"reference_images": []any{
			map[string]any{"url": "http://example.com/img1.jpg", "role": "identity"},
			map[string]any{"url": "http://example.com/img2.jpg"},
		},
		"nested": map[string]any{
			"deep": map[string]any{
				"value": 42,
			},
		},
	}

	tests := []struct {
		path     string
		expected any
	}{
		{"prompt", "hello"},
		{"reference_images[0].url", "http://example.com/img1.jpg"},
		{"reference_images[1].url", "http://example.com/img2.jpg"},
		{"reference_images[0].role", "identity"},
		{"nested.deep.value", 42},
		{"nonexistent", nil},
		{"reference_images[5].url", nil},
	}
	for _, tt := range tests {
		result := getNestedValue(data, tt.path)
		if result != tt.expected {
			t.Errorf("getNestedValue(%q) = %v, want %v", tt.path, result, tt.expected)
		}
	}
}

func TestApplyMapping(t *testing.T) {
	capsJSON := json.RawMessage(`{
		"image-to-image": {
			"request_path": "/v1/images/edits",
			"required_params": ["prompt", "image"],
			"param_mapping": {
				"prompt": "prompt",
				"reference_images[0].url": "image",
				"strength": "strength",
				"aspect_ratio": "aspect_ratio"
			}
		},
		"text-to-image": {
			"request_path": "/v1/images/generations",
			"required_params": ["prompt"],
			"param_mapping": {
				"prompt": "prompt",
				"aspect_ratio": "aspect_ratio",
				"negative_prompt": "negative_prompt"
			}
		}
	}`)

	engine, err := NewEngine(capsJSON)
	if err != nil {
		t.Fatalf("NewEngine error: %v", err)
	}

	// 测试图生图映射
	input := map[string]any{
		"prompt": "change expression",
		"reference_images": []any{
			map[string]any{"url": "http://example.com/ref.jpg", "role": "identity"},
		},
		"strength":     0.6,
		"aspect_ratio": "9:16",
	}
	result, err := engine.ApplyMapping(input, "image-to-image")
	if err != nil {
		t.Fatalf("ApplyMapping error: %v", err)
	}
	if result["prompt"] != "change expression" {
		t.Errorf("prompt = %v, want 'change expression'", result["prompt"])
	}
	if result["image"] != "http://example.com/ref.jpg" {
		t.Errorf("image = %v, want 'http://example.com/ref.jpg'", result["image"])
	}
	if result["strength"] != 0.6 {
		t.Errorf("strength = %v, want 0.6", result["strength"])
	}
	if result["aspect_ratio"] != "9:16" {
		t.Errorf("aspect_ratio = %v, want '9:16'", result["aspect_ratio"])
	}

	// 测试请求路径
	path := engine.GetRequestPath("image-to-image", "/default")
	if path != "/v1/images/edits" {
		t.Errorf("GetRequestPath = %s, want '/v1/images/edits'", path)
	}
	path = engine.GetRequestPath("text-to-image", "/default")
	if path != "/v1/images/generations" {
		t.Errorf("GetRequestPath = %s, want '/v1/images/generations'", path)
	}
}

func TestValidateRequired(t *testing.T) {
	capsJSON := json.RawMessage(`{
		"image-to-image": {
			"required_params": ["prompt", "image"],
			"param_mapping": {
				"prompt": "prompt",
				"reference_images[0].url": "image"
			}
		}
	}`)
	engine, err := NewEngine(capsJSON)
	if err != nil {
		t.Fatalf("NewEngine error: %v", err)
	}

	// 缺少必填参数
	input := map[string]any{"prompt": "test"}
	err = engine.ValidateRequired("image-to-image", input)
	if err == nil {
		t.Error("ValidateRequired should fail when image is missing")
	}

	// 所有必填参数都有
	input["reference_images"] = []any{map[string]any{"url": "http://example.com/ref.jpg"}}
	err = engine.ValidateRequired("image-to-image", input)
	if err != nil {
		t.Errorf("ValidateRequired should pass, got: %v", err)
	}
}

func TestHasCapability(t *testing.T) {
	capsJSON := json.RawMessage(`{"text-to-image": {}, "image-to-image": {}}`)
	engine, _ := NewEngine(capsJSON)

	if !engine.HasCapability("text-to-image") {
		t.Error("HasCapability(text-to-image) should be true")
	}
	if !engine.HasCapability("image-to-image") {
		t.Error("HasCapability(image-to-image) should be true")
	}
	if engine.HasCapability("text-to-video") {
		t.Error("HasCapability(text-to-video) should be false")
	}
}
