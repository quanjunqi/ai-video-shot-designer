package catalog

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

// TASK-MODEL-006 判据 6 的自动化断言：`Resolve` 按能力过滤候选。
//
// 本文件只覆盖**能力过滤**这条新增语义；原有解析语义（具体行 id 优先 / 优先级排序 /
// 确定性 tie-break / 停用跳过 / 认不出就报错）仍在 resolve_test.go 里锁着，未改动。
//
// 过滤的全部语义（也是下面用例的一一对应）：
//
//	声明了 modes 且不含请求 mode ⇒ 剔除
//	声明了 modes 且含请求 mode   ⇒ 保留
//	未声明 modes（缺失/空/坏数据）⇒ 保留（★ 未声明 ≠ 不支持）
//	请求 mode 为空                ⇒ 不过滤（与现状逐字一致）
//	全被剔除                      ⇒ ErrNoCandidateForMode（非 ErrModelNotResolved）
//	具体行 id 命中                ⇒ 不做能力过滤（向后兼容，见 resolve.go 注释）

// 真实数据形状（production.model_catalog 实测值节选，2026-10-17）：
// 唯一声明了 modes 的那一行 —— 用它做夹具，避免"只在我编的 JSON 上通过"。
const realSeedanceCapability = `{
  "modes": ["text-to-video", "first-frame", "first-last-frame", "omni-reference", "video-edit", "extend", "with-audio"],
  "aspectRatios": ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"],
  "maxDurationSeconds": 30, "minDurationSeconds": 4
}`

const realSmokeTextCapability = `{"billing": {}, "maxTokens": 8000, "streaming": false}` // 没有 modes 键

// ① 声明了 modes 且**不含**请求 mode ⇒ 被剔除（首选被剔，备用顶上，顺序不乱）
func TestResolveForDropsCandidateWhoseDeclaredModesMissRequest(t *testing.T) {
	dir := dirWith(
		Model{ID: "cand-text", LogicalModelID: "lm1", Status: "enabled", RoutePriority: 10,
			Capability: json.RawMessage(`{"modes":["text-to-video"]}`)},
		Model{ID: "cand-first-frame", LogicalModelID: "lm1", Status: "enabled", RoutePriority: 20,
			Capability: json.RawMessage(realSeedanceCapability)},
	)
	got, err := ResolveFor(dir, "lm1", "first-frame")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].ID != "cand-first-frame" {
		t.Fatalf("不支持 first-frame 的候选必须被剔除，实际 %+v", got)
	}
}

// ② 声明了 modes 且**含**请求 mode ⇒ 保留（两个都支持时都保留，仍按优先级排序）
func TestResolveForKeepsCandidateDeclaringRequestedMode(t *testing.T) {
	dir := dirWith(
		Model{ID: "b", LogicalModelID: "lm1", Status: "enabled", RoutePriority: 30,
			Capability: json.RawMessage(realSeedanceCapability)},
		Model{ID: "a", LogicalModelID: "lm1", Status: "enabled", RoutePriority: 10,
			Capability: json.RawMessage(`{"modes":["text-to-video","first-frame"]}`)},
	)
	got, err := ResolveFor(dir, "lm1", "text-to-video")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].ID != "a" || got[1].ID != "b" {
		t.Fatalf("支持该 mode 的候选都要保留且按 routePriority 升序，实际 %+v", got)
	}
}

// ③ ★ 关键：候选**未声明** modes ⇒ 保留（未声明 ≠ 不支持）
//
// 覆盖全部"无断言"形态：capability 缺失 / 空对象 / modes 空数组 / modes 键不存在 /
// 坏 JSON / modes 类型错。任何一种都**不得**成为剔除渠道的依据。
func TestResolveForKeepsCandidatesWithoutDeclaredModes(t *testing.T) {
	cases := map[string]json.RawMessage{
		"capability 缺失":     nil,
		"capability 空":      json.RawMessage(``),
		"空对象":               json.RawMessage(`{}`),
		"modes 空数组":         json.RawMessage(`{"modes":[]}`),
		"无 modes 键（真实文本模型）": json.RawMessage(realSmokeTextCapability),
		"JSON null":         json.RawMessage(`null`),
		"坏 JSON":            json.RawMessage(`{"modes":[`),
		"modes 类型错（字符串不是数组）":   json.RawMessage(`{"modes":"text-to-video"}`),
		"modes 元素类型错":          json.RawMessage(`{"modes":[1,2]}`),
		"其它键但不含 modes（真实图像模型）": json.RawMessage(`{"refImage":true,"maxN":10}`),
	}
	for name, capability := range cases {
		t.Run(name, func(t *testing.T) {
			dir := dirWith(Model{ID: "cand", LogicalModelID: "lm1", Status: "enabled", RoutePriority: 10, Capability: capability})
			got, err := ResolveFor(dir, "lm1", "image-to-image")
			if err != nil {
				t.Fatalf("未声明 modes 不得据此剔除候选（未声明 ≠ 不支持），实际 err=%v", err)
			}
			if len(got) != 1 || got[0].ID != "cand" {
				t.Fatalf("未声明 modes 的候选必须保留，实际 %+v", got)
			}
		})
	}
}

// ④ 请求 mode 为空 ⇒ 不过滤（行为与现状逐字一致，且不会返回 ErrNoCandidateForMode）
func TestResolveForEmptyModeDoesNotFilter(t *testing.T) {
	dir := dirWith(
		// 两个候选的声明都**不含**任何调用方可能传的东西：一旦过滤就会全灭
		Model{ID: "a", LogicalModelID: "lm1", Status: "enabled", RoutePriority: 10,
			Capability: json.RawMessage(`{"modes":["text-to-video"]}`)},
		Model{ID: "b", LogicalModelID: "lm1", Status: "enabled", RoutePriority: 20,
			Capability: json.RawMessage(`{"modes":["first-frame"]}`)},
	)
	got, err := ResolveFor(dir, "lm1", "")
	if err != nil {
		t.Fatalf("空 mode 不得触发任何过滤/错误，实际 %v", err)
	}
	if len(got) != 2 || got[0].ID != "a" || got[1].ID != "b" {
		t.Fatalf("空 mode 必须原样返回全部候选，实际 %+v", got)
	}
}

// ⑤ 全部候选都被剔除 ⇒ ErrNoCandidateForMode（**不是** ErrModelNotResolved），
// 且错误信息里带上请求的 mode（排障不必回放请求）
func TestResolveForAllFilteredReturnsErrNoCandidateForMode(t *testing.T) {
	dir := dirWith(
		Model{ID: "a", LogicalModelID: "lm1", Status: "enabled", RoutePriority: 10,
			Capability: json.RawMessage(`{"modes":["text-to-video"]}`)},
		Model{ID: "b", LogicalModelID: "lm1", Status: "enabled", RoutePriority: 20,
			Capability: json.RawMessage(`{"modes":["first-frame"]}`)},
	)
	got, err := ResolveFor(dir, "lm1", "omni-reference")
	if err == nil {
		t.Fatalf("全部候选被剔除必须明确报错，不得静默返回空切片（实际返回 %+v）", got)
	}
	if got != nil {
		t.Fatalf("报错时不得同时返回候选，实际 %+v", got)
	}
	if !errors.Is(err, ErrNoCandidateForMode) {
		t.Fatalf("应返回 ErrNoCandidateForMode，实际 %v", err)
	}
	if errors.Is(err, ErrModelNotResolved) {
		t.Fatalf("语义不同，不得与 ErrModelNotResolved 混用：%v", err)
	}
	if !strings.Contains(err.Error(), "omni-reference") {
		t.Fatalf("错误信息必须带请求的 mode（排障用），实际 %q", err.Error())
	}
	if !strings.Contains(err.Error(), "lm1") {
		t.Fatalf("错误信息应带逻辑模型 id，实际 %q", err.Error())
	}
}

// ⑥ "找不到模型"的两条既有路径**不受过滤影响**（语义区分：找不到 vs 没有候选支持该能力）
func TestResolveForNotFoundStillErrModelNotResolved(t *testing.T) {
	dir := dirWith(
		Model{ID: "a", LogicalModelID: "lm1", Status: "enabled",
			Capability: json.RawMessage(`{"modes":["text-to-video"]}`)},
		Model{ID: "b", LogicalModelID: "lm2", Status: "disabled",
			Capability: json.RawMessage(`{"modes":["text-to-video"]}`)},
	)
	for _, tc := range []struct{ name, id string }{
		{"未知 id", "nope"},
		{"逻辑模型只有停用候选", "lm2"},
		{"空 id", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := ResolveFor(dir, tc.id, "text-to-video"); !errors.Is(err, ErrModelNotResolved) {
				t.Fatalf("应为 ErrModelNotResolved，实际 %v", err)
			}
		})
	}
}

// ⑦ 具体行 id 命中 ⇒ **不做能力过滤**（本卡的判断，理由写在 resolve.go 里）
//
// 依据：这一支的语义是"调用方点名了这一行"，没有候选集也没有失败切换；
// 且实测全库唯一声明了 modes 的行 logical_model_id 为 NULL，只能走这一支 ——
// 在这里过滤等于把存量可用渠道改成硬错误。
func TestResolveForExactRowIDIgnoresModeFilter(t *testing.T) {
	dir := dirWith(
		Model{ID: "mod_pinned", ChannelID: "relay", Status: "disabled", RoutePriority: 5,
			Capability: json.RawMessage(`{"modes":["text-to-video"]}`)},
		Model{ID: "mod_logical", ChannelID: "relay2", LogicalModelID: "mod_pinned", Status: "enabled", RoutePriority: 10,
			Capability: json.RawMessage(`{"modes":["first-frame"]}`)},
	)
	got, err := ResolveFor(dir, "mod_pinned", "image-to-image") // 该行明确没声明 image-to-image
	if err != nil {
		t.Fatalf("具体行 id 命中不得因能力过滤报错，实际 %v", err)
	}
	if len(got) != 1 || got[0].ID != "mod_pinned" {
		t.Fatalf("具体行 id 必须原样返回（不按 status、也不按 modes 过滤），实际 %+v", got)
	}
	if got[0].Status != "disabled" {
		t.Fatal("具体行分支刻意不看 status（旧行为如此）")
	}
}

// ⑧ 向后兼容锁：旧入口 Resolve 在任何数据下都**不返回**能力过滤错误，且与
// ResolveFor(dir, id, "") 逐元素一致；同时证明"若传了 mode，同一份目录确实会被全灭"
// （即 ④①的过滤逻辑真的在生效，不是恒真）
func TestResolveLegacyEntryPointNeverFilters(t *testing.T) {
	dir := dirWith(
		Model{ID: "a", LogicalModelID: "lm1", Status: "enabled", RoutePriority: 10,
			Capability: json.RawMessage(`{"modes":["text-to-video"]}`)},
		Model{ID: "b", LogicalModelID: "lm1", Status: "enabled", RoutePriority: 20,
			Capability: json.RawMessage(`{"modes":["first-frame"]}`)},
	)
	legacy, err := Resolve(dir, "lm1")
	if err != nil {
		t.Fatalf("旧入口必须保持原行为（这个目录在带 mode 时会全灭），实际 %v", err)
	}
	if len(legacy) != 2 {
		t.Fatalf("旧入口必须原样返回全部启用候选，实际 %+v", legacy)
	}
	noMode, err := ResolveFor(dir, "lm1", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(noMode) != len(legacy) {
		t.Fatalf("Resolve 与 ResolveFor(...,\"\") 必须一致：%+v vs %+v", legacy, noMode)
	}
	for i := range legacy {
		if legacy[i].ID != noMode[i].ID {
			t.Fatalf("Resolve 与 ResolveFor(...,\"\") 顺序/成员必须一致：%+v vs %+v", legacy, noMode)
		}
	}
	// 反证：同一份目录带上 mode 后确实全灭 ⇒ 过滤逻辑真的有作用（否则上面两条是空断言）
	if _, err := ResolveFor(dir, "lm1", "with-audio"); !errors.Is(err, ErrNoCandidateForMode) {
		t.Fatalf("同一目录带 mode 应全灭（证明过滤生效），实际 %v", err)
	}
}

// ⑨ mode 匹配是**完全相等**（不做子串/大小写/别名归一）—— 词表归一需要依据，本卡没有
func TestResolveForModeMatchingIsExactNotSubstring(t *testing.T) {
	dir := dirWith(Model{ID: "cand", LogicalModelID: "lm1", Status: "enabled",
		Capability: json.RawMessage(`{"modes":["text-to-video","first-frame"]}`)})
	for _, mode := range []string{"video", "TEXT-TO-VIDEO", " text-to-video ", "t2v"} {
		if _, err := ResolveFor(dir, "lm1", mode); !errors.Is(err, ErrNoCandidateForMode) {
			t.Fatalf("mode=%q 不应命中（完全相等匹配），实际 %v", mode, err)
		}
	}
	if got, err := ResolveFor(dir, "lm1", "text-to-video"); err != nil || len(got) != 1 {
		t.Fatalf("精确命中的 mode 必须保留，实际 %+v err=%v", got, err)
	}
}

// ⑩ 过滤之后仍保持确定性 tie-break（同优先级按 id 升序）——过滤不得打乱既有排序口径
func TestResolveForKeepsDeterministicOrderAfterFiltering(t *testing.T) {
	for i := 0; i < 20; i++ {
		dir := dirWith(
			Model{ID: "zzz", LogicalModelID: "lm1", Status: "enabled", RoutePriority: 10,
				Capability: json.RawMessage(`{"modes":["text-to-video"]}`)},
			Model{ID: "aaa", LogicalModelID: "lm1", Status: "enabled", RoutePriority: 10,
				Capability: json.RawMessage(`{"modes":["first-frame","text-to-video"]}`)},
		)
		got, err := ResolveFor(dir, "lm1", "text-to-video")
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != 2 || got[0].ID != "aaa" || got[1].ID != "zzz" {
			t.Fatalf("同优先级应按 id 升序（第 %d 次），实际 %+v", i, got)
		}
	}
}
