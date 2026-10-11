package httpapi

import (
	"os"
	"strings"
	"testing"
)

// P3-2 接线不变量：候选顺序逻辑只允许出现在 catalog.AttemptEach / PickForAttempt，
// httpapi 包内**至多**允许一处 `candidates[0]`，且必须在注释里说明原因。
//
// 为什么需要（真实事故 ×3）：本项目已三次因"两处同形代码只改一处"出错 ——
// `/v1/generate` 接线漏改（#146）、渠道卡片合并丢字段（#147）、以及 P3-2 施工中
// 我又把失败切换先加到了 `runModel` 而漏掉 `generate`。所以把"还允许几处"钉成不变量。
func TestAtMostOnePrimaryCandidateUse(t *testing.T) {
	b, err := os.ReadFile("handler.go")
	if err != nil {
		t.Fatal(err)
	}
	src := string(b)
	// 只数"把首选当作模型"的形状（&candidates[0]）；像 candidates[0].ChannelID 这种
	// 比较（首选沿用已取凭据、备用按需 reveal）是合法的，不算。
	n := strings.Count(src, "&candidates[0]")
	if n > 1 {
		t.Fatalf("handler.go 里 &candidates[0] 出现 %d 次；失败切换必须走 AttemptEach（至多保留 1 处预派发用，并写明原因）", n)
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
	b, err := os.ReadFile("handler.go")
	if err != nil {
		t.Fatal(err)
	}
	if n := strings.Count(string(b), "catalog.AttemptEach("); n < 2 {
		t.Fatalf("两个执行路径都应使用 catalog.AttemptEach（实际 %d 处）", n)
	}
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
