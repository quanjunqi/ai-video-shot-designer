package worker

import (
	"context"
	"testing"

	"shotdesigner/services/execution/internal/audit"
	"shotdesigner/services/execution/internal/job"
)

// ── 不变量二：审计库未配置时不得 panic、不得阻断主流程 ──────────────
// D1 确立的原则：**审计写入失败（含未配置）绝不能影响任务本身**。
// 这些 helper 会在 parse/panic 等路径上被调用，此时 as 可能就是 nil。

func TestAuditHelpersAreSafeWithNilStore(t *testing.T) {
	ctx := context.Background()
	// 不得 panic —— 一旦 panic 会沿着 recover 分支把任务标成 internal panic
	auditTerminal(ctx, nil, job.Job{ID: "job_1"}, true, "", []byte(`{"ok":true}`))
	auditTerminal(ctx, nil, job.Job{ID: "job_2"}, false, "boom", nil)
	auditTerminalUsage(ctx, nil, job.Job{ID: "job_3"}, true, "", []byte(`{"ok":true}`), map[string]any{
		"usage.prompt_tokens":     float64(35),
		"usage.completion_tokens": float64(38),
	}, 12, 0, "", "", "")
	// 对抗性输入：用法抽取不得因奇怪类型而 panic
	auditTerminalUsage(ctx, nil, job.Job{ID: "job_4"}, false, "x", nil, map[string]any{
		"usage.prompt_tokens":     []int{1, 2, 3},
		"usage.completion_tokens": map[string]string{"a": "b"},
	}, 0, 0, "", "", "")
	auditTerminalUsage(ctx, nil, job.Job{ID: "job_5"}, false, "x", nil, nil, 0, 0, "", "", "")
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
