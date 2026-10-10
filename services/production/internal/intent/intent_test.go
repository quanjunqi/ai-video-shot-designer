package intent

import (
	"encoding/json"
	"strings"
	"testing"
)

// intent 包此前 0% 覆盖（无测试文件）。
// 这里覆盖两处【纯逻辑】，它们决定的都是**幂等语义** ——
// 出错不是"少个校验"，而是"**重复执行**"或"**误判重放**"。

func valid() CreateInput {
	return CreateInput{
		ProjectID: "proj_1",
		Kind:      "image",
		Label:     "生成首帧",
		Payload:   json.RawMessage(`{"prompt":"x"}`),
	}
}

func TestValidateAcceptsMinimalValidInput(t *testing.T) {
	if err := valid().Validate(); err != nil {
		t.Fatalf("最小合法输入应通过，得到 %v", err)
	}
	// 边界：Label 恰好 256 字节应通过（>256 才拒）
	in := valid()
	in.Label = strings.Repeat("a", 256)
	if err := in.Validate(); err != nil {
		t.Fatalf("256 字节 Label 应通过（边界），得到 %v", err)
	}
	// 边界：空对象 payload 应通过（只要求是 JSON 对象）
	in = valid()
	in.Payload = json.RawMessage(`{}`)
	if err := in.Validate(); err != nil {
		t.Fatalf("空对象 payload 应通过，得到 %v", err)
	}
	// 六种 kind 全部应通过
	for _, k := range []string{"split", "interpret", "image", "video", "audio", "canvas_export"} {
		in := valid()
		in.Kind = k
		if err := in.Validate(); err != nil {
			t.Fatalf("kind=%q 应通过，得到 %v", k, err)
		}
	}
}

func TestValidateRejects(t *testing.T) {
	big := json.RawMessage(`{"a":"` + strings.Repeat("b", 512*1024) + `"}`)
	cases := []struct {
		name string
		mut  func(*CreateInput)
	}{
		{"ProjectID 为空", func(in *CreateInput) { in.ProjectID = "" }},
		{"ProjectID 仅空白", func(in *CreateInput) { in.ProjectID = "   " }},
		{"Kind 为空", func(in *CreateInput) { in.Kind = "" }},
		{"Label 为空", func(in *CreateInput) { in.Label = "" }},
		{"Label 仅空白", func(in *CreateInput) { in.Label = "  " }},
		{"Kind 不在白名单", func(in *CreateInput) { in.Kind = "unknown" }},
		{"Kind 大小写不符（白名单是精确匹配）", func(in *CreateInput) { in.Kind = "Image" }},
		{"Label 超过 256 字节", func(in *CreateInput) { in.Label = strings.Repeat("a", 257) }},
		{"ScopeEpoch 为负", func(in *CreateInput) { in.ScopeEpoch = -1 }},
		{"Payload 为空", func(in *CreateInput) { in.Payload = nil }},
		{"Payload 超过 512KiB", func(in *CreateInput) { in.Payload = big }},
		{"Payload 不是合法 JSON", func(in *CreateInput) { in.Payload = json.RawMessage(`{`) }},
		{"Payload 是数组（必须是对象）", func(in *CreateInput) { in.Payload = json.RawMessage(`[1,2]`) }},
		{"Payload 是字符串（必须是对象）", func(in *CreateInput) { in.Payload = json.RawMessage(`"x"`) }},
		{"Payload 是数字（必须是对象）", func(in *CreateInput) { in.Payload = json.RawMessage(`123`) }},
		{"Payload 是 null（必须是对象）", func(in *CreateInput) { in.Payload = json.RawMessage(`null`) }},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			in := valid()
			c.mut(&in)
			if err := in.Validate(); err != ErrInvalid {
				t.Fatalf("期望 ErrInvalid，得到 %v", err)
			}
		})
	}
}

func TestRequestHashIsDeterministicAndFieldSensitive(t *testing.T) {
	base := valid()
	h := base.RequestHash()
	if len(h) != 64 {
		t.Fatalf("sha256 hex 应为 64 字符，得到 %d：%q", len(h), h)
	}
	if h != valid().RequestHash() {
		t.Fatal("同一输入的 RequestHash 必须稳定 —— 否则幂等判定会随机失败")
	}

	// 每个字段都必须影响哈希：否则"改了输入却复用幂等键"会被误判为重放，
	// 用户看到的是"我明明改了参数，却拿回上一次的结果"。
	muts := map[string]func(*CreateInput){
		"ProjectID":  func(in *CreateInput) { in.ProjectID = "proj_2" },
		"EpisodeID":  func(in *CreateInput) { in.EpisodeID = "ep_1" },
		"AssetID":    func(in *CreateInput) { in.AssetID = "as_1" },
		"Kind":       func(in *CreateInput) { in.Kind = "video" },
		"Label":      func(in *CreateInput) { in.Label = "另一个标签" },
		"Payload":    func(in *CreateInput) { in.Payload = json.RawMessage(`{"prompt":"y"}`) },
		"ScopeEpoch": func(in *CreateInput) { in.ScopeEpoch = 1 },
	}
	for name, mut := range muts {
		in := valid()
		mut(&in)
		if got := in.RequestHash(); got == h {
			t.Fatalf("改 %s 后哈希未变 —— 该字段没进哈希，会误判重放", name)
		}
	}
}

func TestRequestHashNormalizesLabelWhitespace(t *testing.T) {
	// RequestHash 内部对 Label 做了 TrimSpace（判据：intent.go:68）。
	// 这是**刻意的**：首尾空白不应造成"看起来相同、哈希不同"的伪冲突。
	a := valid()
	b := valid()
	b.Label = "  生成首帧  "
	if a.RequestHash() != b.RequestHash() {
		t.Fatal("Label 首尾空白应被归一化（否则同一意图会产生两个哈希）")
	}
	// 但【中间】空白不能归一化 —— 那是不同的标签
	c := valid()
	c.Label = "生成 首帧"
	if c.RequestHash() == a.RequestHash() {
		t.Fatal("Label 中间空白不应被归一化")
	}
}

func TestSentinelErrorsAreDistinct(t *testing.T) {
	// 三个哨兵被 httpapi 映射成不同状态码；串味就是状态码串味。
	errs := []error{ErrInvalid, ErrIdempotencyConflict, ErrNotFound}
	for i := range errs {
		for j := range errs {
			if i != j && errs[i] == errs[j] {
				t.Fatalf("哨兵错误 %d 与 %d 相同：%v", i, j, errs[i])
			}
		}
	}
}
