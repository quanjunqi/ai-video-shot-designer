package catalog

import (
	"errors"
	"testing"
)

func cands3() []Model {
	return []Model{
		{ID: "a", ChannelID: "ch_a"},
		{ID: "b", ChannelID: "ch_b"},
		{ID: "c", ChannelID: "ch_c"},
	}
}

// ① 首选成功 ⇒ 只尝试首选
func TestAttemptEachStopsAtFirstSuccess(t *testing.T) {
	tried := []string{}
	got, attempts, err := AttemptEach(cands3(), func(m Model) error {
		tried = append(tried, m.ID)
		return nil
	})
	if err != nil || got.ID != "a" {
		t.Fatalf("应命中首选 a，实际 %s err=%v", got.ID, err)
	}
	if len(tried) != 1 || len(attempts) != 1 {
		t.Fatalf("不应继续尝试后面的候选：tried=%v attempts=%d", tried, len(attempts))
	}
}

// ② 首选失败 ⇒ 自动切到备用（这就是 ADR-003 的失败切换）
func TestAttemptEachFailsOver(t *testing.T) {
	tried := []string{}
	got, attempts, err := AttemptEach(cands3(), func(m Model) error {
		tried = append(tried, m.ID)
		if m.ID == "a" {
			return errors.New("upstream 503")
		}
		return nil
	})
	if err != nil || got.ID != "b" {
		t.Fatalf("应切到备用 b，实际 %s err=%v", got.ID, err)
	}
	if len(tried) != 2 || len(attempts) != 2 {
		t.Fatalf("应尝试 a 后停在 b：tried=%v", tried)
	}
	if attempts[0].Err == "" || attempts[0].ChannelID != "ch_a" {
		t.Fatalf("失败尝试应记录渠道与原因：%+v", attempts[0])
	}
}

// ③ 全失败 ⇒ 保留**最后一次**原因，并把每次尝试都记下来
func TestAttemptEachAllFailKeepsLastError(t *testing.T) {
	_, attempts, err := AttemptEach(cands3(), func(m Model) error { return errors.New("boom-" + m.ID) })
	if err == nil {
		t.Fatal("全失败应报错")
	}
	if len(attempts) != 3 {
		t.Fatalf("应记录 3 次尝试，实际 %d", len(attempts))
	}
	if attempts[2].Err != "boom-c" {
		t.Fatalf("最后一次尝试的原因应被保留：%+v", attempts[2])
	}
	if !contains(err.Error(), "boom-c") {
		t.Fatalf("错误文案应带最后一次原因：%v", err)
	}
}

// ④ 空候选 ⇒ 明确报错（不猜）
func TestAttemptEachEmptyCandidatesErrors(t *testing.T) {
	if _, _, err := AttemptEach(nil, func(Model) error { return nil }); err == nil {
		t.Fatal("空候选应报错")
	}
}

// ⑥ 表 3-1 硬失败（硬 4xx / 内容安全拒绝）：立即直返，不切换、不消耗剩余候选
func TestAttemptEachHardFailureStopsImmediately(t *testing.T) {
	tried := []string{}
	got, attempts, err := AttemptEach(cands3(), func(m Model) error {
		tried = append(tried, m.ID)
		if m.ID == "a" {
			return &HardFailure{Status: 401, Msg: "auth rejected"}
		}
		return nil
	})
	if err == nil {
		t.Fatal("硬失败应报错")
	}
	if !IsHardFailure(err) {
		t.Fatalf("应识别为硬失败，实际 %v", err)
	}
	if got.ID != "a" {
		t.Fatalf("硬失败应停在触发候选 a，实际 %s", got.ID)
	}
	if len(tried) != 1 || len(attempts) != 1 {
		t.Fatalf("硬失败不应继续切换：tried=%v", tried)
	}
}

// ⑦ 硬失败返回的候选 = 触发候选（供调用方按该候选的状态码直返）
func TestHardFailureErrorFormat(t *testing.T) {
	hf := &HardFailure{Status: 422, Msg: "bad params"}
	if !IsHardFailure(hf) {
		t.Fatal("HardFailure 应被 IsHardFailure 识别")
	}
	if got := hf.Error(); got == "" {
		t.Fatal("硬失败错误文案不应为空")
	}
	// 普通错误不是硬失败
	if IsHardFailure(errors.New("upstream 503")) {
		t.Fatal("普通 5xx 错误不应被识别为硬失败")
	}
}

// ⑤ 重试驱动的选择：attempt=1 用首选，之后推进到备用，越界停在最后一个
func TestPickForAttemptProgression(t *testing.T) {
	c := cands3()
	cases := []struct {
		attempt int
		want    string
	}{
		{0, "a"}, {1, "a"}, {2, "b"}, {3, "c"}, {4, "c"}, {99, "c"},
	}
	for _, tc := range cases {
		if got := PickForAttempt(c, tc.attempt); got.ID != tc.want {
			t.Fatalf("attempt=%d 应选 %s，实际 %s", tc.attempt, tc.want, got.ID)
		}
	}
	// 具体行 id 命中（只有 1 个候选）⇒ 任何 attempt 都用它，行为与改动前一致
	if got := PickForAttempt([]Model{{ID: "only"}}, 7); got.ID != "only" {
		t.Fatalf("单候选应恒返回它，实际 %s", got.ID)
	}
	if got := PickForAttempt(nil, 1); got.ID != "" {
		t.Fatal("空候选应返回零值")
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
