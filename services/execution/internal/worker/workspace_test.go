package worker

import (
	"os"
	"strings"
	"testing"

	"shotdesigner/services/execution/internal/audit"
	"shotdesigner/services/execution/internal/job"
)

// Phase C 不变量：worker 里**不允许**再出现硬编码的工作区字面量。
//
// 为什么钉住它：多租户下，硬编码的 "ws_dev" 会把 A 的 job 拿去 B 的目录上解析、
// 并用 B 的凭据去上游调用 —— 这类缺陷**不会报错**，只会用错人的钱与凭据，
// 人眼审查极难发现（本项目已因此栽过多次）。
func TestWorkerHasNoHardcodedWorkspace(t *testing.T) {
	b, err := os.ReadFile("worker.go")
	if err != nil {
		t.Fatal(err)
	}
	src := string(b)
	if strings.Contains(src, `"ws_dev"`) {
		t.Fatal(`main.go 里仍有硬编码的 "ws_dev"；worker 必须使用 job 自己的工作区`)
	}
	if !strings.Contains(src, "j.WorkspaceID") {
		t.Fatal("worker 必须读取 job 的 WorkspaceID（否则又回到硬编码）")
	}
}

// wsOf 的语义：有工作区就用它；历史行（空）退回审计哨兵值 —— 且这是**可见**的降级。
func TestWsOfFallsBackForLegacyJobs(t *testing.T) {
	if got := wsOf(job.Job{WorkspaceID: "ws_b"}); got != "ws_b" {
		t.Fatalf("应返回 job 的工作区，实际 %q", got)
	}
	if got := wsOf(job.Job{}); got != audit.SystemWorkspace {
		t.Fatalf("历史行应退回哨兵值 %q，实际 %q", audit.SystemWorkspace, got)
	}
}

// 审计清理（purge）**刻意**挂在哨兵值下：它不是任何租户的行为。
// 我最初的全局替换误伤过它 ⇒ 钉一条不变量记住这个决定。
func TestAuditPurgeStaysUnderSystemWorkspace(t *testing.T) {
	b, err := os.ReadFile("purger.go")
	if err != nil {
		t.Fatal(err)
	}
	src := string(b)
	idx := strings.Index(src, "func RunAuditPurger(")
	if idx < 0 {
		t.Fatal("未找到 RunAuditPurger")
	}
	body := src[idx:]
	if end := strings.Index(body, "\nfunc "); end > 0 {
		body = body[:end]
	}
	if !strings.Contains(body, "WorkspaceID: audit.SystemWorkspace") {
		t.Fatal("审计清理的审计行必须挂在 audit.SystemWorkspace（否则会污染某个租户的列表与聚合）")
	}
}
