package ruletemplate

import (
	"errors"
	"strings"
	"testing"
)

// 规则模板（拆集规则 + 环节提示词规则统一存储）：
// 本文件锁住 CreateInput.Validate 的校验契约。

func TestCreateInputValidate_Valid(t *testing.T) {
	valid := []CreateInput{
		{ID: "rt_split_1", Kind: "split", Name: "拆集规则"},
		{ID: "rt_prompt_1", Kind: "prompt", Name: "提示词规则"},
	}
	for _, in := range valid {
		if err := in.Validate(); err != nil {
			t.Fatalf("%s/%s 应合法，实际 %v", in.Kind, in.Name, err)
		}
	}
}

func TestCreateInputValidate_MissingID(t *testing.T) {
	in := CreateInput{Kind: "split", Name: "x"}
	err := in.Validate()
	if err == nil {
		t.Fatal("缺 id 必须报错")
	}
	if !strings.Contains(err.Error(), "id is required") {
		t.Fatalf("应提示 id 缺失，实际 %v", err)
	}
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("错误应包装 ErrInvalid，实际 %v", err)
	}
}

func TestCreateInputValidate_BadKind(t *testing.T) {
	in := CreateInput{ID: "rt_1", Kind: "unsupported", Name: "x"}
	err := in.Validate()
	if err == nil {
		t.Fatal("非法 kind 必须报错")
	}
	if !strings.Contains(err.Error(), "kind must be split or prompt") {
		t.Fatalf("应提示 kind 非法，实际 %v", err)
	}
}

func TestCreateInputValidate_MissingName(t *testing.T) {
	in := CreateInput{ID: "rt_1", Kind: "split"}
	err := in.Validate()
	if err == nil {
		t.Fatal("缺 name 必须报错")
	}
	if !strings.Contains(err.Error(), "name is required") {
		t.Fatalf("应提示 name 缺失，实际 %v", err)
	}
}
