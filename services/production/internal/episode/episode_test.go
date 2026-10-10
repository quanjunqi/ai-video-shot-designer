package episode

import "testing"

// episode 包此前 0% 覆盖（无测试文件）。这里覆盖 CreateInput.Validate ——
// 它是剧集写入的唯一入参防线。

func TestCreateInputValidateAccepts(t *testing.T) {
	valid := func() CreateInput { return CreateInput{ID: "ep_1", Index: 0, Title: "第一集"} }
	if err := valid().Validate(); err != nil {
		t.Fatalf("最小合法输入应通过，得到 %v", err)
	}
	// 边界：Index==0 合法（判据：episode.go 的 Validate 只拒 `Index < 0`）
	in := valid()
	in.Index = 0
	if err := in.Validate(); err != nil {
		t.Fatalf("Index=0 应合法，得到 %v", err)
	}
}

func TestCreateInputValidateRejects(t *testing.T) {
	cases := []struct {
		name string
		mut  func(*CreateInput)
	}{
		{"ID 为空", func(in *CreateInput) { in.ID = "" }},
		{"Index 为负", func(in *CreateInput) { in.Index = -1 }},
		{"Title 为空", func(in *CreateInput) { in.Title = "" }},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			in := CreateInput{ID: "ep_1", Index: 0, Title: "第一集"}
			c.mut(&in)
			if err := in.Validate(); err != ErrInvalid {
				t.Fatalf("期望 ErrInvalid，得到 %v", err)
			}
		})
	}
}

// ★ 如实锁定当前行为（不是"应该"）：
//
//	Validate 只判 `Title == ""`，**不做 TrimSpace** ⇒ 纯空白标题会被放行。
//
// 写成测试的目的：若日后改为 TrimSpace，本用例会失败并提醒
// "这是对外语义变更，请确认调用方是否依赖旧行为" —— 而不是悄悄改变。
func TestCreateInputValidateDoesNotTrimWhitespace(t *testing.T) {
	in := CreateInput{ID: "ep_1", Index: 0, Title: " "}
	if err := in.Validate(); err != nil {
		t.Fatalf("当前实现不 TrimSpace ⇒ 纯空白标题应被放行；此处失败说明行为已变：%v", err)
	}
}
