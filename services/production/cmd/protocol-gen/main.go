// Command protocol-gen 从 OpenAPI 3.x 规范确定性生成协议模板定义（TASK-PROTOCOL-003）。
//
// 用法：
//
//	protocol-gen -spec <openapi.json> -id <template-id> -label <label> [-base-path <path>] [-path <endpoint-path>]
//
// 输出：可审查的模板定义文本（含 capabilities/param_mapping 待审查标记）。
// 仅做确定性结构提取；capabilities（mode 语义）与 param_mapping（需实测）不自动生成。
package main

import (
	"flag"
	"fmt"
	"os"

	"shotdesigner/services/production/internal/protocolgen"
)

func main() {
	specPath := flag.String("spec", "", "OpenAPI 3.x JSON 文件路径（必填）")
	tmplID := flag.String("id", "", "生成模板 ID（必填）")
	label := flag.String("label", "", "生成模板 Label（必填）")
	basePath := flag.String("base-path", "", "basePath 覆盖（缺省用 OpenAPI servers 推导；OpenAI 官方无 /v1 前缀时注入 /v1）")
	wantPath := flag.String("path", "", "目标端点路径（如 /chat/completions；缺省输出全部操作）")
	wantMethod := flag.String("method", "", "目标 HTTP 方法（POST/GET/...；缺省输出全部方法）")
	flag.Parse()

	if *specPath == "" || *tmplID == "" || *label == "" {
		fmt.Fprintln(os.Stderr, "protocol-gen: -spec/-id/-label 必填")
		flag.Usage()
		os.Exit(2)
	}
	doc, err := os.ReadFile(*specPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "protocol-gen: 读取 %s: %v\n", *specPath, err)
		os.Exit(1)
	}
	ops, err := protocolgen.Parse(doc)
	if err != nil {
		fmt.Fprintf(os.Stderr, "protocol-gen: %v\n", err)
		os.Exit(1)
	}
	printed := 0
	for _, op := range ops {
		if *wantPath != "" && op.Path != *wantPath {
			continue
		}
		if *wantMethod != "" && op.Method != *wantMethod {
			continue
		}
		tmpl := protocolgen.Generate(op, protocolgen.GenerateOptions{
			TemplateID: *tmplID,
			Label:      *label,
			BasePath:   *basePath,
		})
		fmt.Println(tmpl.String())
		printed++
	}
	if printed == 0 {
		fmt.Fprintf(os.Stderr, "protocol-gen: 未找到匹配操作（path=%q method=%q）\n", *wantPath, *wantMethod)
		os.Exit(1)
	}
}
