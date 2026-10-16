package httpapi

import (
	"os"
	"strings"
	"testing"
)

// 接线不变量：execution 里**不允许**再出现"按 id 手写 for 循环找模型"的代码。
//
// 为什么需要这条（真实事故）：P3-1 引入 catalog.Resolve 时，同一文件里有**两处**
// 形状相似、但 if 块文案不同的循环；补丁只命中了一处（assert count==1 通过），
// 于是**真正服务 /v1/generate 的那一处**仍按具体 id 精确匹配 ⇒
// 用逻辑模型 id 调用时 404 "model not found"。
// 单元测试测的是解析器、不是接线，所以只有真机请求能发现 —— 这条不变量把接线也钉住。
func TestNoRawModelIDLookupLoops(t *testing.T) {
	for _, f := range []string{"handlers_generate.go"} {
		b, err := os.ReadFile(f)
		if err != nil {
			continue // 文件不存在不算失败（未来可能改名）
		}
		src := string(b)
		if strings.Contains(src, "if dir.Models[i].ID ==") || strings.Contains(src, "if dir.Models[i].ID==") {
			t.Fatalf("%s 里仍有手写的按 id 查找循环；必须改用 catalog.Resolve（ADR-003）", f)
		}
	}
}

// 反向保证：解析器必须真的被调用，否则上面那条会被"删掉调用"绕过。
// TASK-MODEL-006 判据 6 起解析器有两个入口：Resolve（不传 mode）与 ResolveFor（带能力过滤）；
// 两者都算"用了 Resolve"。
func TestHandlersUseCatalogResolve(t *testing.T) {
	b, err := os.ReadFile("handlers_generate.go")
	if err != nil {
		t.Fatal(err)
	}
	src := string(b)
	if n := strings.Count(src, "catalog.Resolve(") + strings.Count(src, "catalog.ResolveFor("); n < 1 {
		t.Fatalf("handler.go 必须调用 catalog.Resolve/ResolveFor（实际 %d 次）", n)
	}
}

// 接线不变量（TASK-MODEL-006 判据 6 新增）：能力过滤**只有把请求的 mode 真传进去**才生效。
// 若只调 ResolveFor 却传空串（或漏传），过滤形同虚设而**单测依然全绿** ——
// 这与 P3-1「解析器有测试、接线没测试」是同一类盲区，所以在这里把接线本身钉住。
func TestGenerateHandlerThreadsRequestModeIntoResolve(t *testing.T) {
	b, err := os.ReadFile("handlers_generate.go")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(b), "catalog.ResolveFor(dir, in.ModelID, in.Mode)") {
		t.Fatal("/v1/generate 必须把请求的 mode 传给 catalog.ResolveFor（否则能力过滤形同虚设）")
	}
}
