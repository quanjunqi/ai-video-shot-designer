package httpapi

import (
	"os"
	"strings"
	"testing"
)

// readPackageSources 把本包**全部非测试 .go 文件**拼成一份源码文本。
//
// 为什么不是只读某个文件名（TASK-PROC-007 改动）：
//
//	下面两条不变量的**声明**本来就是"包内"口径（见 TestAtMostOnePrimaryCandidateUse
//	第 10 行注释：「httpapi 包内**至多**允许一处」），但实现此前硬编码读
//	`handlers_generate.go` **一个文件** ⇒ 声明与实现不一致。
//	这个不一致在 BE-SIZE-001 拆分（783 行 → handlers_generate.go / handlers_run_model.go /
//	handlers_preflight.go）时立刻暴露：`catalog.AttemptEach(` 被合法地分到两个文件，
//	按单文件计数就误判成"少了一处"。
//
//	⇒ 改为扫全包：不变量与文件布局**解耦**——拆分、改名、再分域都不会再造成假红，
//	  而它真正要守的东西（"两条执行路径都必须走 AttemptEach"）一点没放松。
func readPackageSources(t *testing.T) string {
	t.Helper()
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatal(err)
	}
	var sb strings.Builder
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		b, err := os.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		sb.Write(b)
		sb.WriteString("\n")
	}
	if sb.Len() == 0 {
		// fail-closed：一个源文件都没读到 ⇒ 扫了个空区间，不得当成通过。
		t.Fatal("未读到任何非测试 .go 文件 —— 扫描区间为空，不可判为通过")
	}
	return sb.String()
}

// P3-2 接线不变量：候选顺序逻辑只允许出现在 catalog.AttemptEach / PickForAttempt，
// httpapi 包内**至多**允许一处 `candidates[0]`，且必须在注释里说明原因。
//
// 为什么需要（真实事故 ×3）：本项目已三次因"两处同形代码只改一处"出错 ——
// `/v1/generate` 接线漏改（#146）、渠道卡片合并丢字段（#147）、以及 P3-2 施工中
// 我又把失败切换先加到了 `runModel` 而漏掉 `generate`。所以把"还允许几处"钉成不变量。
func TestAtMostOnePrimaryCandidateUse(t *testing.T) {
	src := readPackageSources(t)
	// 只数"把首选当作模型"的形状（&candidates[0]）；像 candidates[0].ChannelID 这种
	// 比较（首选沿用已取凭据、备用按需 reveal）是合法的，不算。
	n := strings.Count(src, "&candidates[0]")
	if n > 1 {
		t.Fatalf("包内 &candidates[0] 出现 %d 次；失败切换必须走 AttemptEach（至多保留 1 处预派发用，并写明原因）", n)
	}
	if n == 1 {
		idx := strings.Index(src, "&candidates[0]")
		window := src[maxInt(0, idx-600):idx]
		if !strings.Contains(window, "异步") && !strings.Contains(window, "worker") {
			t.Fatal("保留的 candidates[0] 必须在上方注释里说明原因（异步分支由 worker 的重试驱动切换）")
		}
	}
}

func TestFailoverHelperIsUsed(t *testing.T) {
	src := readPackageSources(t)
	if n := strings.Count(src, "catalog.AttemptEach("); n < 2 {
		t.Fatalf("两个执行路径都应使用 catalog.AttemptEach（包内实际 %d 处）", n)
	}
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
