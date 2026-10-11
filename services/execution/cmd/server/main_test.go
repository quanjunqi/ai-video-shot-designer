package main

import (
	"context"
	"testing"
	"time"

	"shotdesigner/services/execution/internal/audit"
)

// execution 的 cmd/server 此前覆盖率 0.0% —— 而 **D2/D2b/D4c/D6 的核心逻辑都在这里**
// （worker 终态写回审计、重试终态、用量回填、保留期清理的启动开关）。
// 其中大部分需要数据库，但下面两类不该依赖数据库，且都承载着真实不变量。

// ── 不变量一：保留期配置【只认正数】 ────────────────────────────────
// D6 的「默认关闭」fail-safe 正建立在这条上：
// 环境变量留空 / 填 0 / 填负数 / 填非法值 ⇒ 一律回退默认值（0）⇒ **清理不会启动**。
// 若有人把这里改成"负数也接受"，保留期清理就可能在意料之外被打开 —— 那是删数据的事。

func TestEnvIntOnlyAcceptsPositive(t *testing.T) {
	cases := []struct {
		name string
		set  string
		def  int
		want int
	}{
		{"未设置 ⇒ 默认", "", 0, 0},
		{"空串 ⇒ 默认", "", 10, 10},
		{"非数字 ⇒ 默认", "abc", 0, 0},
		{"0 ⇒ 默认（0 表示不启用，不能被当成「已配置」）", "0", 7, 7},
		{"负数 ⇒ 默认（同上）", "-5", 7, 7},
		{"小数 ⇒ 默认（Atoi 不接受）", "1.5", 7, 7},
		{"带空白 ⇒ 默认", " 7 ", 0, 0},
		{"正数 ⇒ 采用", "180", 0, 180},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Setenv("EXEC_TEST_INT", c.set)
			if got := envInt("EXEC_TEST_INT", c.def); got != c.want {
				t.Fatalf("期望 %d，得到 %d", c.want, got)
			}
		})
	}
}

func TestEnvDurationOnlyAcceptsPositiveDurations(t *testing.T) {
	cases := []struct {
		name string
		set  string
		def  time.Duration
		want time.Duration
	}{
		{"未设置 ⇒ 默认", "", 24 * time.Hour, 24 * time.Hour},
		{"非法 ⇒ 默认", "abc", 24 * time.Hour, 24 * time.Hour},
		{"0s ⇒ 默认（d > 0 不成立）", "0s", 24 * time.Hour, 24 * time.Hour},
		{"负数 ⇒ 默认", "-1h", 24 * time.Hour, 24 * time.Hour},
		{"纯数字（无单位）⇒ 默认", "60", 24 * time.Hour, 24 * time.Hour},
		{"30m ⇒ 采用", "30m", 24 * time.Hour, 30 * time.Minute},
		{"复合时长 ⇒ 采用", "1h30m", time.Second, 90 * time.Minute},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Setenv("EXEC_TEST_DUR", c.set)
			if got := envDuration("EXEC_TEST_DUR", c.def); got != c.want {
				t.Fatalf("期望 %v，得到 %v", c.want, got)
			}
		})
	}
}

// ── 不变量二：审计库未配置时不得 panic、不得阻断主流程 ──────────────
// D1 确立的原则：**审计写入失败（含未配置）绝不能影响任务本身**。
// 这些 helper 会在 parse/panic 等路径上被调用，此时 as 可能就是 nil。

func TestAuditHelpersAreSafeWithNilStore(t *testing.T) {
	ctx := context.Background()
	// 不得 panic —— 一旦 panic 会沿着 recover 分支把任务标成 internal panic
	auditTerminal(ctx, nil, "job_1", true, "", []byte(`{"ok":true}`))
	auditTerminal(ctx, nil, "job_2", false, "boom", nil)
	auditTerminalUsage(ctx, nil, "job_3", true, "", []byte(`{"ok":true}`), map[string]any{
		"usage.prompt_tokens":     float64(35),
		"usage.completion_tokens": float64(38),
	}, 12)
	// 对抗性输入：用法抽取不得因奇怪类型而 panic
	auditTerminalUsage(ctx, nil, "job_4", false, "x", nil, map[string]any{
		"usage.prompt_tokens":     []int{1, 2, 3},
		"usage.completion_tokens": map[string]string{"a": "b"},
	}, 0)
	auditTerminalUsage(ctx, nil, "job_5", false, "x", nil, nil, 0)
}

var _ = audit.SystemWorkspace // 断言 audit 包的哨兵常量仍可被引用（D6 依赖它归属清理记录）

// ── 不变量三：审计终态的【词汇】必须与读者一致 ────────────────────────
//
// 判据：同步路径写 "success"（httpapi/handler.go 的 writeAudit）；
// 契约写「如 success/failed/queued」；前端「成功」卡片与「成功」筛选项都取 success。
// 而 worker 原来写 "succeeded" ⇒ **异步成功从不计入成功/成功率，也不被「成功」筛选显示**；
// 失败态两条路径同名（failed）⇒ **成功率被系统性低估**。
//
// 端到端实测（一次性栈 + 本地桩，2026-10-10）：
//
//	聚合返回 byStatus={succeeded:1} 而 successRate=0
//	该行 status=succeeded | model=m_stub | channel=ch_stub
//
// 这条不变量把"写者随手选词"变成必须过测试的事。
func TestAuditStatusVocabularyMatchesReaders(t *testing.T) {
	if got := auditStatusFor(true); got != "success" {
		t.Fatalf("成功终态必须写 success（读者只认它），实际 %q", got)
	}
	if got := auditStatusFor(false); got != "failed" {
		t.Fatalf("失败终态应为 failed，实际 %q", got)
	}
}
