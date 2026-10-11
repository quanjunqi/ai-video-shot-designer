package catalog

import (
	"context"
	"testing"
)

// ADR-009 Phase B2 的核心判据：**A 工作区的东西，B 工作区看不见**。
// 这条测试就是"多租户隔离"的可执行定义 —— 不是靠注释保证。
func TestIntegrationWorkspaceScopeIsolation(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()

	if _, err := s.Pool.Exec(ctx, `INSERT INTO model_channels (id, name, kind, base_url, auth_type) VALUES ('ch_scope','作用域渠道','aggregator','https://up.example.com','bearer')`); err != nil {
		t.Fatal(err)
	}
	seed := func(id, family, name, ws string, sort int) {
		t.Helper()
		if _, err := s.Pool.Exec(ctx, `INSERT INTO model_catalog (id, channel_id, family, name, provider_model, type, status, sort, protocol_template_id, request_path, method, workspace_id)
			VALUES ($1,'ch_scope',$2,$3,$3,'image','enabled',$4,'pt_x','/x','POST',$5)`, id, family, name, sort, ws); err != nil {
			t.Fatal(err)
		}
	}
	// 平台共享：fam_shared（会被 ws_a 覆盖）+ fam_platform（无人覆盖）
	seed("m_shared", "fam_shared", "平台版", "", 1)
	seed("m_platform", "fam_platform", "平台独有", "", 2)
	// ws_a：覆盖 fam_shared + 独有一行
	seed("m_a_override", "fam_shared", "A 的版本", "ws_a", 1)
	seed("m_a_only", "fam_a", "A 独有", "ws_a", 3)
	// ws_b：独有一行（A 不应看到）
	seed("m_b_only", "fam_b", "B 独有", "ws_b", 4)

	names := func(ws string) map[string]string {
		t.Helper()
		dir, err := s.Directory(ctx, ws)
		if err != nil {
			t.Fatal(err)
		}
		out := map[string]string{}
		for _, m := range dir.Models {
			out[m.Family] = m.Name
		}
		return out
	}

	a := names("ws_a")
	if a["fam_shared"] != "A 的版本" {
		t.Fatalf("ws_a 视图里 fam_shared 应被 A 的行覆盖，实际 %q", a["fam_shared"])
	}
	if a["fam_platform"] != "平台独有" {
		t.Fatalf("ws_a 应能看到平台共享行，实际 %q", a["fam_platform"])
	}
	if a["fam_a"] != "A 独有" {
		t.Fatalf("ws_a 应能看到自己的行，实际 %q", a["fam_a"])
	}
	if _, ok := a["fam_b"]; ok {
		t.Fatal("★ ws_a 不应看到 ws_b 的行（隔离失败）")
	}

	b := names("ws_b")
	if b["fam_shared"] != "平台版" {
		t.Fatalf("ws_b 未覆盖 fam_shared ⇒ 应看到平台版，实际 %q", b["fam_shared"])
	}
	if _, ok := b["fam_a"]; ok {
		t.Fatal("★ ws_b 不应看到 ws_a 的行（隔离失败）")
	}

	platform := names("")
	if platform["fam_shared"] != "平台版" {
		t.Fatalf("平台视角（\"\"）应只看到平台行，实际 %q", platform["fam_shared"])
	}
	if _, ok := platform["fam_a"]; ok {
		t.Fatal("平台视角不应看到任何工作区私有的行")
	}

	// 供给池也要隔离：同一 (channel, provider) 上，工作区行覆盖平台行，且互相不可见
	for _, row := range []struct{ ws, display string }{{"", "平台池"}, {"ws_a", "A 的池"}, {"ws_b", "B 的池"}} {
		if _, err := s.Pool.Exec(ctx, `INSERT INTO channel_models (channel_id, provider_model, display_name, workspace_id) VALUES ('ch_scope','same-model',$1,$2)`, row.display, row.ws); err != nil {
			t.Fatal(err)
		}
	}
	supply := func(ws string) map[string]string {
		t.Helper()
		items, err := s.ListSupply(ctx, ws, "ch_scope", true)
		if err != nil {
			t.Fatal(err)
		}
		out := map[string]string{}
		for _, it := range items {
			out[it.ProviderModel] = it.DisplayName
		}
		return out
	}
	if got := supply("ws_a"); got["same-model"] != "A 的池" {
		t.Fatalf("ws_a 的供给池应被自己的工作区行覆盖，实际 %q", got["same-model"])
	}
	if got := supply("ws_b"); got["same-model"] != "B 的池" {
		t.Fatalf("ws_b 的供给池应是自己的行，实际 %q", got["same-model"])
	}
	if got := supply(""); got["same-model"] != "平台池" {
		t.Fatalf("平台视角应是平台行，实际 %q", got["same-model"])
	}
}
