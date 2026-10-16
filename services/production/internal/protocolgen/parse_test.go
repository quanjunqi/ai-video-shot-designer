package protocolgen

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func loadFixture(t *testing.T) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("testdata", "openai_fixture.json"))
	if err != nil {
		t.Fatalf("读取 fixture: %v", err)
	}
	return b
}

func parseFixture(t *testing.T) []Operation {
	t.Helper()
	ops, err := Parse(loadFixture(t))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	return ops
}

func opByPath(ops []Operation, path string) (Operation, bool) {
	for _, op := range ops {
		if op.Path == path && op.Method == "POST" {
			return op, true
		}
	}
	return Operation{}, false
}

func paramKeys(op Operation) []string {
	var keys []string
	for _, p := range op.Params {
		keys = append(keys, p.Key)
	}
	return keys
}

// TestParseDeterministic：同一输入两次解析输出一致（判据 1）。
func TestParseDeterministic(t *testing.T) {
	a := parseFixture(t)
	b := parseFixture(t)
	if !reflect.DeepEqual(a, b) {
		t.Fatalf("同输入两次输出不一致：确定性破坏")
	}
	if len(a) == 0 {
		t.Fatalf("fixture 未解析出任何操作")
	}
}

// TestParseRejectsNonOpenAPI3：非 3.x 文档报错（边界）。
func TestParseRejectsNonOpenAPI3(t *testing.T) {
	_, err := Parse([]byte(`{"openapi":"2.0","paths":{}}`))
	if err == nil {
		t.Fatalf("openapi 2.0 应报错")
	}
}

// TestParseRejectsCrossFileRef：跨文件 $ref 报错（D-002）。
func TestParseRejectsCrossFileRef(t *testing.T) {
	doc := []byte(`{"openapi":"3.1.0","paths":{"/x":{"post":{"requestBody":{"content":{"application/json":{"schema":{"$ref":"other.yaml#/A"}}}}}}}}`)
	_, err := Parse(doc)
	if err == nil {
		t.Fatalf("跨文件 $ref 应报错")
	}
	var refErr ErrUnsupportedRef
	if !errors.As(err, &refErr) {
		t.Fatalf("应返回 ErrUnsupportedRef，got %T: %v", err, err)
	}
}

// TestParseAllOfMerge：allOf 合并 properties/required（D-003）。
func TestParseAllOfMerge(t *testing.T) {
	doc := []byte(`{
  "openapi":"3.1.0",
  "paths":{"/chat/completions":{"post":{
    "requestBody":{"content":{"application/json":{"schema":{"allOf":[
      {"$ref":"#/components/schemas/A"},
      {"type":"object","properties":{"messages":{"type":"array"},"model":{"type":"string"}},"required":["messages"]}
    ]}}}},
    "responses":{"200":{"content":{"application/json":{"schema":{"type":"object","properties":{"id":{"type":"string"}}}}}}}
  }}},
  "components":{"schemas":{"A":{"type":"object","properties":{"temperature":{"type":"number"}},"required":["temperature"]}}}
}`)
	ops, err := Parse(doc)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	op, ok := opByPath(ops, "/chat/completions")
	if !ok {
		t.Fatalf("未找到操作")
	}
	keys := paramKeys(op)
	for _, want := range []string{"temperature", "messages", "model"} {
		if !contains(keys, want) {
			t.Fatalf("allOf 合并缺 %s，got %v", want, keys)
		}
	}
	for _, want := range []string{"temperature", "messages"} {
		if !contains(op.Required, want) {
			t.Fatalf("allOf required 合并缺 %s，got %v", want, op.Required)
		}
	}
}

// TestParseOneOfFirstBranch：oneOf 取首含 properties 分支，不 panic（D-003）。
func TestParseOneOfFirstBranch(t *testing.T) {
	doc := []byte(`{
  "openapi":"3.1.0",
  "paths":{"/x":{"post":{
    "requestBody":{"content":{"application/json":{"schema":{"oneOf":[
      {"type":"object","properties":{"a":{"type":"string"}}},
      {"type":"object","properties":{"b":{"type":"string"}}}
    ]}}}}
  }}}
}`)
	ops, err := Parse(doc)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(ops) != 1 {
		t.Fatalf("应解析出 1 个操作")
	}
	keys := paramKeys(ops[0])
	if !contains(keys, "a") {
		t.Fatalf("oneOf 应取首分支字段 a，got %v", keys)
	}
}

func contains(ss []string, want string) bool {
	for _, s := range ss {
		if s == want {
			return true
		}
	}
	return false
}
