package catalog

import (
	"context"
	"encoding/json"
	"reflect"
	"sort"
	"strings"
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

	// 断言 ③：MiniMax 视频 —— 本用例只锁【迁移 029 的 pollPath 与字段集合】。
	//
	// ★ 终态取值**不在**本用例的契约内（它由 TestPostgresProtocolTemplateAsyncTerminalValues
	//   专门锁，涉及 030 与 032 两次演进）。此前这里对整个结构体做 DeepEqual、并把
	//   doneValue/failValue 硬编码为 030 的单值，于是 032 把它们扩成候选并集后
	//   **本用例连带变红** —— 一个用例锁了两个契约，任一演进都会让另一个误报。
	//   现在把这两个字段摘出来、用与专用用例**同一个 helper** 判定，期望值不再写两遍。
	minimax, ok := loadAsync(t, "pt_builtin_minimax_video")
	if !ok {
		t.Error("pt_builtin_minimax_video: async 缺 pollPath（迁移 029 未生效）")
	}
	assertSameCandidateSet(t, "doneValue", minimax.DoneValue, []string{"completed", "Success"})
	assertSameCandidateSet(t, "failValue", minimax.FailValue, []string{"failed", "Fail"})

	wantMinimax := ProtocolAsync{
		Enabled:     true,
		TaskIDField: "task_id",
		StatusField: "status",
		PollPath:    "/v1/query/video_generation?task_id={task_id}",
	}
	// 终态两字段已单独判过 ⇒ 这里置空，使结构体比较聚焦于"本用例的契约"（字段集合 + pollPath）
	minimax.DoneValue, minimax.FailValue = "", ""
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

// TestPostgresProtocolTemplateAsyncTerminalValues 锁定迁移 030 的数据契约。
//
// 全量迁移应用到一个全新库后断言：
//  1. pt_builtin_minimax_video 的 async->>'doneValue' / ->>'failValue' 的**候选集合**
//     恰好是两套【已文档化】的取值：
//     · 030 依据国际站 v2 文档写入 completed / failed；
//     · 032 核实后指出本模板 pollPath 是 legacy 端点，其官方文档写 Success / Fail。
//     同一产品不同文档页给出冲突枚举 ⇒ 032 把两套都列为候选（执行器 matchesTerminalValue
//     支持逗号分隔 + 大小写不敏感），这样无论实际返回哪一套都能被识别为终态。
//     ⇒ 本断言是【集合相等】而非【等于某一个字面量】：后者会把 032 之后正确且更宽容的
//     实现误判为回归（本文件此前正是如此，详见 032 的注释）。
//     queued/in_progress 仍是有意的「继续轮询」态，不在终态候选内。
//  2. jsonb_set 只覆盖这两个键：该行 async 仍是 6 个字段（一个都没丢），pollPath 未被破坏。
//  3. 全表带 failValue 的行恰好是这两个异步模板；其余 6 个内置模板 async 仍为 '{}'
//     —— 即「只改了该改的」。
//
// 未设置 PRODUCTION_TEST_DATABASE_URL 时跳过（与既有集成测试一致）。
func TestPostgresProtocolTemplateAsyncTerminalValues(t *testing.T) {
	store := testPostgresStore(t)
	ctx := context.Background()

	// 断言 ①②：只改 doneValue/failValue 两个键，字段数与其它字段不变。
	var failValue, doneValue, pollPath string
	var keyCount int
	if err := store.Pool.QueryRow(ctx,
		`SELECT async->>'failValue', async->>'doneValue', coalesce(async->>'pollPath', ''),
		        (SELECT count(*) FROM jsonb_object_keys(async))
		   FROM protocol_templates WHERE id = 'pt_builtin_minimax_video'`).
		Scan(&failValue, &doneValue, &pollPath, &keyCount); err != nil {
		t.Fatalf("load pt_builtin_minimax_video async: %v", err)
	}
	assertSameCandidateSet(t, "doneValue", doneValue, []string{"completed", "Success"})
	assertSameCandidateSet(t, "failValue", failValue, []string{"failed", "Fail"})
	if keyCount != 6 {
		t.Errorf("minimax async 字段数 = %d, want 6（jsonb_set 只改两个键，不得丢字段）", keyCount)
	}
	if pollPath != "/v1/query/video_generation?task_id={task_id}" {
		t.Errorf("minimax pollPath = %q, 被 030 破坏", pollPath)
	}

	// 断言 ③：带 failValue 的行恰好是这两个异步模板；其余 6 个内置模板 async 仍为 '{}'。
	rows, err := store.Pool.Query(ctx,
		`SELECT id FROM protocol_templates WHERE jsonb_exists(async, 'failValue') ORDER BY id`)
	if err != nil {
		t.Fatalf("query rows with failValue: %v", err)
	}
	defer rows.Close()
	var withFailValue []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			t.Fatalf("scan id: %v", err)
		}
		withFailValue = append(withFailValue, id)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate rows: %v", err)
	}
	wantWithFailValue := []string{"pt_builtin_jimeng_video", "pt_builtin_minimax_video"}
	if !reflect.DeepEqual(withFailValue, wantWithFailValue) {
		t.Errorf("带 failValue 的模板集合:\n got: %v\nwant: %v", withFailValue, wantWithFailValue)
	}

	emptyRows, err := store.Pool.Query(ctx,
		`SELECT id FROM protocol_templates WHERE async = '{}'::jsonb ORDER BY id`)
	if err != nil {
		t.Fatalf("query rows with empty async: %v", err)
	}
	defer emptyRows.Close()
	var emptyAsync []string
	for emptyRows.Next() {
		var id string
		if err := emptyRows.Scan(&id); err != nil {
			t.Fatalf("scan id: %v", err)
		}
		emptyAsync = append(emptyAsync, id)
	}
	if err := emptyRows.Err(); err != nil {
		t.Fatalf("iterate rows: %v", err)
	}
	wantEmptyAsync := []string{
		"pt_builtin_comfyui",
		"pt_builtin_grsai",
		"pt_builtin_jimeng_image",
		"pt_builtin_minimax_text",
		"pt_builtin_openai",
		"pt_builtin_openai_img",
	}
	if !reflect.DeepEqual(emptyAsync, wantEmptyAsync) {
		t.Errorf("async 仍为 {} 的模板集合:\n got: %v\nwant: %v", emptyAsync, wantEmptyAsync)
	}
}

// assertSameCandidateSet 断言"逗号分隔的候选集合"与期望集合**相等**（大小写不敏感、与顺序无关）。
//
// 为什么不是"包含"：包含会把多写的垃圾候选也放过；而这里两套取值都是**有文档依据**的，
// 集合相等既锁住"两套都在"（032 的目的），也锁住"没多写"（避免悄悄加入未被文档支持的终态）。
func assertSameCandidateSet(t *testing.T, field, got string, want []string) {
	t.Helper()
	norm := func(in []string) []string {
		out := make([]string, 0, len(in))
		for _, v := range in {
			v = strings.ToLower(strings.TrimSpace(v))
			if v != "" {
				out = append(out, v)
			}
		}
		sort.Strings(out)
		return out
	}
	gotSet := norm(strings.Split(got, ","))
	wantSet := norm(want)
	if !reflect.DeepEqual(gotSet, wantSet) {
		t.Errorf("minimax %s 候选集合 = %v, want %v（030 的官方值 + 032 依 legacy 文档补充的候选）", field, gotSet, wantSet)
	}
}
