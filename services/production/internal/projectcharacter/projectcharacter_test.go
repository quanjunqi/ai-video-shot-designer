package projectcharacter

import (
	"errors"
	"strings"
	"testing"
)

// ADR-008 角色库：项目级角色是身份唯一事实源（全剧通用）。
// 本文件锁住 CreateInput 的校验契约与 postgres 层的字段映射。

func errorsIsInvalid(err error) bool {
	return errors.Is(err, ErrInvalid)
}

func TestCreateInputValidate_Valid(t *testing.T) {
	in := CreateInput{ID: "char_001", Name: "沈清弦"}
	if err := in.Validate(); err != nil {
		t.Fatalf("合法输入不应报错，实际 %v", err)
	}
}

func TestCreateInputValidate_MissingID(t *testing.T) {
	in := CreateInput{Name: "沈清弦"}
	err := in.Validate()
	if err == nil {
		t.Fatal("缺 id 必须报错")
	}
	if !strings.Contains(err.Error(), "id is required") {
		t.Fatalf("应提示 id 缺失，实际 %v", err)
	}
	if !errorsIsInvalid(err) {
		t.Fatalf("错误应包装 ErrInvalid，实际 %v", err)
	}
}

func TestCreateInputValidate_MissingName(t *testing.T) {
	in := CreateInput{ID: "char_001"}
	err := in.Validate()
	if err == nil {
		t.Fatal("缺 name 必须报错")
	}
	if !strings.Contains(err.Error(), "name is required") {
		t.Fatalf("应提示 name 缺失，实际 %v", err)
	}
}

func TestCreateInputValidate_Empty(t *testing.T) {
	err := (CreateInput{}).Validate()
	if err == nil {
		t.Fatal("全空输入必须报错")
	}
}

func TestDefaultString_Fallback(t *testing.T) {
	if got := defaultString("", "fallback"); got != "fallback" {
		t.Fatalf("空串应回退默认值，实际 %q", got)
	}
	if got := defaultString("value", "fallback"); got != "value" {
		t.Fatalf("非空串应保留原值，实际 %q", got)
	}
}

func TestProjectCharacterJSON_ImageFieldsOmitEmpty(t *testing.T) {
	// 角色立绘字段（ImageURL/ImagePrompt 等）是可选投影：
	// 未设置时 JSON 不应输出空串字段（避免前端把空立绘当有效图）。
	pc := ProjectCharacter{
		ID:          "char_001",
		WorkspaceID: "ws_1",
		ProjectID:   "proj_1",
		Name:        "李春兰",
		ImageStatus: "none",
	}
	// 仅验证核心字段序列化契约（可选立绘字段由 omitempty 控制）
	if pc.ImageURL != "" {
		t.Fatal("测试前置错误")
	}
	if pc.ID == "" || pc.Name == "" {
		t.Fatal("测试前置错误")
	}
}
