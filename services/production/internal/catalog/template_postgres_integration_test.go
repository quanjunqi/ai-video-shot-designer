package catalog

import (
	"context"
	"encoding/json"
	"reflect"
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

// TestPostgresProtocolTemplateAsyncPollPath 锁定迁移 029 的数据契约。
//
// 全量迁移应用到一个全新库后断言：
//  1. pt_builtin_jimeng_video 的 async->>'pollPath' = /v1/video/generations/{task_id}
//  2. 该行 async 的其它字段一个都没丢（整个 ProtocolAsync 逐字段 DeepEqual，
//     与迁移 008 写入的值完全一致；二者 doneValue/failValue 本就不同，不得被统一）
//  3. MiniMax 的 pollPath 亦已按探测证据补齐，且全表带 pollPath 的行**恰好只有**这两个
//     —— 即「只改了该改的」，没有波及其它模板。
//
// 未设置 PRODUCTION_TEST_DATABASE_URL 时跳过（与既有集成测试一致）。
func TestPostgresProtocolTemplateAsyncPollPath(t *testing.T) {
	store := testPostgresStore(t)
	ctx := context.Background()

	// loadAsync 读回 async 原文，既解成 ProtocolAsync（键名与执行器 engine.go 的匿名
	// 结构同形），也用 map 探针单独判断 pollPath 这个键**是否存在** —— PollPath 是
	// string，缺键与空串解出来都是 ""，只有看原始键集才分得清「没写」和「写了空串」。
	loadAsync := func(t *testing.T, id string) (ProtocolAsync, bool) {
		t.Helper()
		var raw []byte
		if err := store.Pool.QueryRow(ctx,
			`SELECT async FROM protocol_templates WHERE id = $1`, id).Scan(&raw); err != nil {
			t.Fatalf("load %s async: %v", id, err)
		}
		var probe map[string]json.RawMessage
		if err := json.Unmarshal(raw, &probe); err != nil {
			t.Fatalf("%s async is not a json object: %v (%s)", id, err, raw)
		}
		_, hasPollPath := probe["pollPath"]
		var async ProtocolAsync
		if err := json.Unmarshal(raw, &async); err != nil {
			t.Fatalf("%s async decode: %v (%s)", id, err, raw)
		}
		return async, hasPollPath
	}

	// 断言 ①②：即梦视频 —— pollPath 补齐，其余字段逐字段不变（值取自迁移 008）。
	jimeng, ok := loadAsync(t, "pt_builtin_jimeng_video")
	if !ok {
		t.Error("pt_builtin_jimeng_video: async 仍缺 pollPath（迁移 029 未生效）")
	}
	wantJimeng := ProtocolAsync{
		Enabled:     true,
		TaskIDField: "task_id",
		StatusField: "status",
		DoneValue:   "SUCCESS",
		FailValue:   "FAILED",
		PollPath:    "/v1/video/generations/{task_id}",
	}
	if !reflect.DeepEqual(jimeng, wantJimeng) {
		t.Errorf("pt_builtin_jimeng_video async:\n got: %+v\nwant: %+v", jimeng, wantJimeng)
	}

	// 断言 ③：MiniMax 视频 —— 同样只增 pollPath，doneValue/failValue 保持 Success/Failed。
	minimax, ok := loadAsync(t, "pt_builtin_minimax_video")
	if !ok {
		t.Error("pt_builtin_minimax_video: async 缺 pollPath（迁移 029 未生效）")
	}
	wantMinimax := ProtocolAsync{
		Enabled:     true,
		TaskIDField: "task_id",
		StatusField: "status",
		DoneValue:   "Success",
		FailValue:   "Failed",
		PollPath:    "/v1/query/video_generation?task_id={task_id}",
	}
	if !reflect.DeepEqual(minimax, wantMinimax) {
		t.Errorf("pt_builtin_minimax_video async:\n got: %+v\nwant: %+v", minimax, wantMinimax)
	}

	// 断言 ③ 的后半：全表带 pollPath 的行恰好是这两个 —— 029 只动了该动的行。
	rows, err := store.Pool.Query(ctx,
		`SELECT id FROM protocol_templates WHERE jsonb_exists(async, 'pollPath') ORDER BY id`)
	if err != nil {
		t.Fatalf("query rows with pollPath: %v", err)
	}
	defer rows.Close()
	var withPollPath []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			t.Fatalf("scan id: %v", err)
		}
		withPollPath = append(withPollPath, id)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate rows: %v", err)
	}
	wantWithPollPath := []string{"pt_builtin_jimeng_video", "pt_builtin_minimax_video"}
	if !reflect.DeepEqual(withPollPath, wantWithPollPath) {
		t.Errorf("带 pollPath 的模板集合:\n got: %v\nwant: %v", withPollPath, wantWithPollPath)
	}
}
