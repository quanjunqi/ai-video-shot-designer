package catalog

import (
	"errors"
	"testing"
)

func dirWith(models ...Model) Directory { return Directory{Models: models} }

// ① 具体行 id 命中 ⇒ 只返回那一行（与实现路由之前的行为完全一致，存量渠道不受影响）
func TestResolveExactModelIDWins(t *testing.T) {
	dir := dirWith(
		Model{ID: "gpt-image-2", ChannelID: "openai", Status: "disabled", RoutePriority: 20},
		Model{ID: "mod_aaa", ChannelID: "relay", LogicalModelID: "gpt-image-2", Status: "enabled", RoutePriority: 10},
	)
	got, err := Resolve(dir, "gpt-image-2")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].ID != "gpt-image-2" {
		t.Fatalf("具体行 id 必须优先于逻辑 id，实际 %+v", got)
	}
	if got[0].Status != "disabled" {
		t.Fatal("具体行分支刻意不看 status（旧行为如此）")
	}
}

// ② 逻辑模型 id ⇒ 候选按 routePriority 升序
func TestResolveLogicalModelOrdersByPriority(t *testing.T) {
	dir := dirWith(
		Model{ID: "c", ChannelID: "ch3", LogicalModelID: "lm1", Status: "enabled", RoutePriority: 30},
		Model{ID: "a", ChannelID: "ch1", LogicalModelID: "lm1", Status: "enabled", RoutePriority: 10},
		Model{ID: "b", ChannelID: "ch2", LogicalModelID: "lm1", Status: "enabled", RoutePriority: 20},
	)
	got, err := Resolve(dir, "lm1")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 || got[0].ID != "a" || got[1].ID != "b" || got[2].ID != "c" {
		t.Fatalf("候选顺序应为 a,b,c（priority 10/20/30），实际 %+v", got)
	}
}

// ③ 停用的候选必须跳过
func TestResolveSkipsDisabledCandidates(t *testing.T) {
	dir := dirWith(
		Model{ID: "a", LogicalModelID: "lm1", Status: "disabled", RoutePriority: 10},
		Model{ID: "b", LogicalModelID: "lm1", Status: "enabled", RoutePriority: 20},
	)
	got, err := Resolve(dir, "lm1")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].ID != "b" {
		t.Fatalf("应只剩启用的候选 b，实际 %+v", got)
	}
}

// ④ 同优先级必须确定性（否则同一请求可能路由到不同渠道，排障变猜谜）
func TestResolveTieBreakIsDeterministic(t *testing.T) {
	for i := 0; i < 20; i++ {
		dir := dirWith(
			Model{ID: "zzz", LogicalModelID: "lm1", Status: "enabled", RoutePriority: 10},
			Model{ID: "aaa", LogicalModelID: "lm1", Status: "enabled", RoutePriority: 10},
		)
		got, err := Resolve(dir, "lm1")
		if err != nil {
			t.Fatal(err)
		}
		if got[0].ID != "aaa" {
			t.Fatalf("同优先级应按 id 升序（确定性），第 %d 次得到 %s", i, got[0].ID)
		}
	}
}

// ⑤ 认不出就明确报错（不猜、不静默退回第一个模型）
func TestResolveUnknownReturnsError(t *testing.T) {
	dir := dirWith(
		Model{ID: "a", LogicalModelID: "lm1", Status: "enabled"},
		Model{ID: "b", LogicalModelID: "lm2", Status: "disabled"},
	)
	if _, err := Resolve(dir, "nope"); !errors.Is(err, ErrModelNotResolved) {
		t.Fatalf("未知 id 应返回 ErrModelNotResolved，实际 %v", err)
	}
	if _, err := Resolve(dir, "lm2"); !errors.Is(err, ErrModelNotResolved) {
		t.Fatalf("只有停用候选的逻辑模型应视为不可解析，实际 %v", err)
	}
	if _, err := Resolve(dir, ""); !errors.Is(err, ErrModelNotResolved) {
		t.Fatalf("空 id 应报错，实际 %v", err)
	}
}
