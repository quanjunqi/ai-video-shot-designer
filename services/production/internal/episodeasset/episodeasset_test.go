package episodeasset

import (
	"errors"
	"strings"
	"testing"
)

// episodeasset 包此前 0% 覆盖。这里覆盖 CreateInput.Validate ——
// 它用 errors.Join 把【具体原因】包进 ErrInvalid，
// 因此测试同时锁两件事：① errors.Is 能判类别 ② 人能读懂缺哪个字段。

func TestCreateInputValidate(t *testing.T) {
	valid := func() CreateInput { return CreateInput{ID: "ea_1", Kind: "character", Name: "角色A"} }
	if err := valid().Validate(); err != nil {
		t.Fatalf("最小合法输入应通过，得到 %v", err)
	}

	cases := []struct{ name, field, wantReason string }{
		{"ID 缺失", "ID", "id is required"},
		{"Kind 缺失", "Kind", "kind is required"},
		{"Name 缺失", "Name", "name is required"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			in := valid()
			switch c.field {
			case "ID":
				in.ID = ""
			case "Kind":
				in.Kind = ""
			case "Name":
				in.Name = ""
			}
			err := in.Validate()
			if err == nil {
				t.Fatalf("期望报错，实际通过")
			}
			// ① 类别可判（调用方用 errors.Is 决定 HTTP 状态码）
			if !errors.Is(err, ErrInvalid) {
				t.Fatalf("应满足 errors.Is(err, ErrInvalid)，得到 %v", err)
			}
			// ② 原因可读（缺哪个字段必须能从消息看出来 —— errors.Join 的意义就在这里）
			if !strings.Contains(err.Error(), c.wantReason) {
				t.Fatalf("错误消息应含 %q，得到 %q", c.wantReason, err.Error())
			}
		})
	}
}

// 空白不算缺失（当前实现只判 == ""，不 TrimSpace）—— 如实锁定事实。
func TestCreateInputValidateWhitespaceIsAccepted(t *testing.T) {
	in := CreateInput{ID: " ", Kind: " ", Name: " "}
	if err := in.Validate(); err != nil {
		t.Fatalf("当前实现不 TrimSpace ⇒ 纯空白应被放行；若此处失败，说明行为已变，需确认调用方是否受影响：%v", err)
	}
}
