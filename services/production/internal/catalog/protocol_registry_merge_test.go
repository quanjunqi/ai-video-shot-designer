// 协议模板合并/解析域测试（TASK-PROC-008：BE-SIZE-001「一个文件一个域」拆分）。
//
// 从 protocol_registry_test.go（659 行超上限）按域拆出：DB 覆盖内置的优先级、
// 按 ID 解析、合并结果的 JSON 兼容性、以及 request_template 字段。
// **纯搬移**：测试函数体与断言逐字未改；共享的断言辅助仍在 protocol_registry_test.go（同包可见）。
package catalog

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestMergeTemplatesPrecedence(t *testing.T) {
	base := map[string]ProtocolTemplate{}
	for _, tmpl := range RegistryTemplates() {
		base[tmpl.ID] = tmpl
	}

	// DB 行：① 被管理员改过的内置行 ② 未改动的内置行 ③ 自定义模板；
	// 故意让 pt_builtin_jimeng_video 在 DB 中缺失，用于验证注册表补齐。
	editedOpenAI := base["pt_builtin_openai"]
	editedOpenAI.Label = "管理员覆盖的 OpenAI"
	editedOpenAI.RequestPath = "/v1/chat/completions/admin"
	editedOpenAI.Version = 9
	editedOpenAI.Source = ""
	custom := ProtocolTemplate{
		ID: "pt_custom_demo", Label: "自定义协议", Desc: "专家自定义", Type: "text",
		Method: "POST", RequestPath: "/custom", Params: json.RawMessage(`[]`),
		ResponseParams: json.RawMessage(`[]`), Async: json.RawMessage(`{}`),
		Capabilities: json.RawMessage(`{}`), Builtin: false, Enabled: true, Version: 4,
	}
	db := []ProtocolTemplate{editedOpenAI, base["pt_builtin_comfyui"], custom}

	merged := MergeTemplates(db)

	// 9 个内置 + 1 个自定义 = 10（DB 缺的 1 个内置由注册表补齐）。
	if len(merged) != 10 {
		t.Fatalf("merged length = %d, want 10", len(merged))
	}
	byID := map[string]ProtocolTemplate{}
	for _, tmpl := range merged {
		if _, dup := byID[tmpl.ID]; dup {
			t.Errorf("duplicate id %q in merged output", tmpl.ID)
		}
		byID[tmpl.ID] = tmpl
	}

	// 规则 1：DB 行优先（覆盖注册表默认值）。
	openai, ok := byID["pt_builtin_openai"]
	if !ok {
		t.Fatal("pt_builtin_openai missing from merged output")
	}
	if openai.Label != "管理员覆盖的 OpenAI" || openai.RequestPath != "/v1/chat/completions/admin" || openai.Version != 9 {
		t.Errorf("DB row did not win for pt_builtin_openai: %+v", openai)
	}
	if openai.Source != TemplateSourceBuiltin {
		t.Errorf("pt_builtin_openai source = %q, want %q", openai.Source, TemplateSourceBuiltin)
	}

	// 规则 2：DB 缺失的 id 由注册表补齐（builtin=true）。
	jimengVideo, ok := byID["pt_builtin_jimeng_video"]
	if !ok {
		t.Fatal("pt_builtin_jimeng_video was not backfilled from the registry")
	}
	if !jimengVideo.Builtin || jimengVideo.Source != TemplateSourceBuiltin {
		t.Errorf("backfilled template must be builtin: %+v", jimengVideo)
	}
	if !reflect.DeepEqual(jimengVideo, base["pt_builtin_jimeng_video"]) {
		t.Errorf("backfilled template differs from registry:\n got: %+v\nwant: %+v", jimengVideo, base["pt_builtin_jimeng_video"])
	}

	// 规则 3：自定义模板原样保留。
	gotCustom, ok := byID["pt_custom_demo"]
	if !ok {
		t.Fatal("custom template was dropped by the merge")
	}
	if gotCustom.Source != TemplateSourceCustom {
		t.Errorf("custom template source = %q, want %q", gotCustom.Source, TemplateSourceCustom)
	}
	custom.Source = TemplateSourceCustom // 合并只补 source，其余字段必须逐字段相等
	if !reflect.DeepEqual(gotCustom, custom) {
		t.Errorf("custom template was modified:\n got: %+v\nwant: %+v", gotCustom, custom)
	}

	// 规则 4：结果按 id 稳定排序，且多次调用输出一致。
	for i := 1; i < len(merged); i++ {
		if merged[i-1].ID >= merged[i].ID {
			t.Errorf("merged output not sorted by id: %q >= %q", merged[i-1].ID, merged[i].ID)
		}
	}
	if again := MergeTemplates(db); !reflect.DeepEqual(merged, again) {
		t.Error("MergeTemplates is not deterministic for identical input")
	}
	// 合并不得就地修改入参（Directory 里传的是刚扫描出来的行）。
	if db[0].Source != "" {
		t.Errorf("MergeTemplates mutated its input: source = %q", db[0].Source)
	}
	if again := MergeTemplates(nil); len(again) != len(builtinTemplateIDs) {
		t.Errorf("merge with empty DB: got %d templates, want %d", len(again), len(builtinTemplateIDs))
	}
}

func TestResolveTemplateByID(t *testing.T) {
	def, ok := ProtocolDefinitionByID("pt_builtin_openai")
	if !ok {
		t.Fatal("pt_builtin_openai missing from registry")
	}
	edited := def.Template()
	edited.Label = "覆盖后的标签"
	edited.Source = ""
	db := []ProtocolTemplate{edited}

	got, ok := ResolveTemplateByID(db, "pt_builtin_openai")
	if !ok || got.Label != "覆盖后的标签" || got.Source != TemplateSourceBuiltin {
		t.Errorf("DB hit should win and get builtin source: %+v (ok=%v)", got, ok)
	}

	got, ok = ResolveTemplateByID(db, "pt_builtin_jimeng_video")
	if !ok || !got.Builtin || got.RequestPath != "/v1/videos/generations" {
		t.Errorf("registry fallback failed: %+v (ok=%v)", got, ok)
	}

	if _, ok := ResolveTemplateByID(db, "pt_unknown"); ok {
		t.Error("unknown id unexpectedly resolved")
	}
}

// TestMergedTemplatesJSONCompatibility 保证新增的 source 字段是追加式的、
// 且非异步模板的 async 仍序列化为 {}（既有 JSON 消费者不受影响）。
func TestMergedTemplatesJSONCompatibility(t *testing.T) {
	encoded, err := json.Marshal(MergeTemplates(nil))
	if err != nil {
		t.Fatalf("marshal merged templates: %v", err)
	}
	var rows []map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &rows); err != nil {
		t.Fatalf("unmarshal merged templates: %v", err)
	}
	if len(rows) != len(builtinTemplateIDs) {
		t.Fatalf("encoded %d templates, want %d", len(rows), len(builtinTemplateIDs))
	}
	for _, row := range rows {
		var id string
		if err := json.Unmarshal(row["id"], &id); err != nil {
			t.Fatalf("template id invalid: %v (%s)", err, row["id"])
		}
		var source string
		if err := json.Unmarshal(row["source"], &source); err != nil {
			t.Fatalf("source missing or invalid: %v", err)
		}
		if source != TemplateSourceBuiltin {
			t.Errorf("source = %q, want %q", source, TemplateSourceBuiltin)
		}
		var async ProtocolAsync
		if err := json.Unmarshal(row["async"], &async); err != nil {
			t.Fatalf("async invalid: %v", err)
		}
		if !async.Enabled && string(row["async"]) != "{}" {
			t.Errorf("non-async template async = %s, want {}", row["async"])
		}
		// requestTemplate 是追加式 + omitempty：空模板不得出现该键（既有消费者不受影响），
		// 非空模板必须出现且逐字等于注册表值。
		raw, present := row["requestTemplate"]
		def, ok := ProtocolDefinitionByID(id)
		if !ok {
			t.Fatalf("encoded template id not in registry: %s", id)
		}
		if def.RequestTemplate == "" {
			if present {
				t.Errorf("%s: empty requestTemplate must be omitted from JSON, got %s", def.ID, raw)
			}
			continue
		}
		if !present {
			t.Errorf("%s: requestTemplate missing from JSON", def.ID)
			continue
		}
		var decoded string
		if err := json.Unmarshal(raw, &decoded); err != nil {
			t.Fatalf("%s: requestTemplate invalid: %v", def.ID, err)
		}
		if decoded != def.RequestTemplate {
			t.Errorf("%s: requestTemplate = %q, want %q", def.ID, decoded, def.RequestTemplate)
		}
	}
}

// TestProtocolDefinitionsRequestTemplate 是 ADR-007 D3（请求模板）的台账：
// 本切片只迁移**一个**内置定义用于等价性证明，其余 7 个必须保持 params[] 形态（空模板）。
//
// 断言形式与 TestProtocolDefinitionsAsyncConsistency 一致：把当前允许的迁移集合写死，
// 谁新增/删除一个模板形态都会失败并提示更新台账，避免「迁移悄悄扩散」。
func TestProtocolDefinitionsRequestTemplate(t *testing.T) {
	// 台账（唯一允许携带请求模板的内置定义 → 模板文本）。
	// 文本必须与 services/execution/internal/engine/request_template_test.go 里
	// 等价性用例使用的文本逐字一致：那边证明「渲染结果 ≡ params[] 组装结果」。
	want := map[string]string{
		"pt_builtin_minimax_text": `{"stream":{{stream}},"task_type":"sync"}`,
	}

	got := map[string]string{}
	for _, def := range ProtocolDefinitions() {
		if def.RequestTemplate == "" {
			continue
		}
		got[def.ID] = def.RequestTemplate
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("请求模板迁移台账发生变化，请同步更新本表：\n got: %v\nwant: %v", got, want)
	}

	// Template() 必须把模板透出（否则执行器永远收不到它）；空模板保持空串。
	for _, tmpl := range RegistryTemplates() {
		if tmpl.RequestTemplate != want[tmpl.ID] {
			t.Errorf("%s: Template().RequestTemplate = %q, want %q", tmpl.ID, tmpl.RequestTemplate, want[tmpl.ID])
		}
	}

	// 迁移到模板形态的定义必须**保留** params：占位符取值仍由 params 的三分类解析
	// （本切片不做「模板自带全部静态字面量」的形态）。
	def, ok := ProtocolDefinitionByID("pt_builtin_minimax_text")
	if !ok {
		t.Fatal("pt_builtin_minimax_text missing from registry")
	}
	if len(def.Params) == 0 {
		t.Error("pt_builtin_minimax_text: 迁移到请求模板后 params 不能为空（{{stream}} 取值来源）")
	}
}
