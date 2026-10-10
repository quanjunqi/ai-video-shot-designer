package catalog

import (
	"context"
	"encoding/json"
	"testing"
)

// TestPostgresProtocolTemplateRequestTemplateRoundTrip 锁定迁移 028 的读写契约：
// request_template 列能被创建、读回（Directory 合并后）、整体替换与清空，且**不回填**存量行。
//
// 未设置 PRODUCTION_TEST_DATABASE_URL 时跳过（与既有集成测试一致）。
func TestPostgresProtocolTemplateRequestTemplateRoundTrip(t *testing.T) {
	store := testPostgresStore(t)
	ctx := context.Background()

	const tpl = `{"stream":{{stream}},"task_type":"sync"}`
	const tplV2 = `{"stream":{{stream}},"task_type":"sync","n":1}`

	findTemplate := func(t *testing.T, dir Directory, id string) ProtocolTemplate {
		t.Helper()
		for _, tmpl := range dir.Templates {
			if tmpl.ID == id {
				return tmpl
			}
		}
		t.Fatalf("template %q missing from directory", id)
		return ProtocolTemplate{}
	}

	created, dup, err := store.CreateTemplate(ctx, "tester", ProtocolTemplate{
		ID:              "pt_int_request_template",
		Label:           "集成测试模板（ADR-007 D3）",
		Desc:            "request_template 读写",
		Type:            "text",
		Method:          "POST",
		RequestPath:     "/v1/int/test",
		Params:          json.RawMessage(`[{"key":"stream","value":"false"}]`),
		ResponseParams:  json.RawMessage(`[]`),
		Async:           json.RawMessage(`{}`),
		Capabilities:    json.RawMessage(`{}`),
		RequestTemplate: tpl,
	})
	if err != nil {
		t.Fatalf("CreateTemplate: %v", err)
	}
	if dup {
		t.Fatal("unexpected duplicate")
	}
	if created.RequestTemplate != tpl {
		t.Fatalf("created requestTemplate = %q, want %q", created.RequestTemplate, tpl)
	}

	dir, err := store.Directory(ctx)
	if err != nil {
		t.Fatalf("Directory: %v", err)
	}
	got := findTemplate(t, dir, "pt_int_request_template")
	if got.RequestTemplate != tpl {
		t.Fatalf("directory requestTemplate = %q, want %q", got.RequestTemplate, tpl)
	}
	if got.Source != TemplateSourceCustom {
		t.Fatalf("source = %q, want %q", got.Source, TemplateSourceCustom)
	}

	// 迁移 028 只加列、不回填：内置行读回仍是空模板 → DB 行优先，注册表里的模板形态在
	// 存量库上尚未生效（本切片交付的是能力，切换由后续切片负责）。
	if builtin := findTemplate(t, dir, "pt_builtin_minimax_text"); builtin.RequestTemplate != "" {
		t.Fatalf("migration 028 must not backfill existing rows, got %q", builtin.RequestTemplate)
	}

	// 整体替换。
	v2 := tplV2
	updated, err := store.UpdateTemplate(ctx, "tester", "pt_int_request_template", ProtocolTemplatePatch{RequestTemplate: &v2})
	if err != nil {
		t.Fatalf("UpdateTemplate(replace): %v", err)
	}
	if updated.RequestTemplate != tplV2 {
		t.Fatalf("updated requestTemplate = %q, want %q", updated.RequestTemplate, tplV2)
	}
	if updated.Version != created.Version+1 {
		t.Fatalf("version = %d, want %d", updated.Version, created.Version+1)
	}

	// 指针为 nil ⇒ 不变（其它字段的 patch 不应清掉模板）。
	renamed, err := store.UpdateTemplate(ctx, "tester", "pt_int_request_template", ProtocolTemplatePatch{Label: "改名"})
	if err != nil {
		t.Fatalf("UpdateTemplate(keep): %v", err)
	}
	if renamed.RequestTemplate != tplV2 {
		t.Fatalf("requestTemplate changed by unrelated patch: %q", renamed.RequestTemplate)
	}

	// 指针指向空串 ⇒ 清空（回到 params[] 组装）。
	empty := ""
	cleared, err := store.UpdateTemplate(ctx, "tester", "pt_int_request_template", ProtocolTemplatePatch{RequestTemplate: &empty})
	if err != nil {
		t.Fatalf("UpdateTemplate(clear): %v", err)
	}
	if cleared.RequestTemplate != "" {
		t.Fatalf("requestTemplate not cleared: %q", cleared.RequestTemplate)
	}

	dir, err = store.Directory(ctx)
	if err != nil {
		t.Fatalf("Directory after clear: %v", err)
	}
	if got := findTemplate(t, dir, "pt_int_request_template"); got.RequestTemplate != "" {
		t.Fatalf("directory requestTemplate after clear = %q, want empty", got.RequestTemplate)
	}
}
