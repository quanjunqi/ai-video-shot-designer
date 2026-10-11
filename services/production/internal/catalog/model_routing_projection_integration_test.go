package catalog

import (
	"context"
	"testing"
)

// P3-1 的投影判据：目录必须暴露 logicalModelId / routePriority ——
// execution 靠它一次拉取就在本地解析候选（ADR-003 §3.1），不必再加一次内部调用。
// 同时钉住向后兼容：未纳入路由的存量行投影为 "" / 默认优先级，行为等同改动前。
func TestIntegrationDirectoryExposesRoutingFields(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	if _, err := s.Pool.Exec(ctx, `INSERT INTO model_channels (id, name, kind, base_url, auth_type) VALUES ('ch_route','路由渠道','aggregator','https://up.example.com','bearer')`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Pool.Exec(ctx, `INSERT INTO logical_models (id, label, type) VALUES ('lm_route','路由逻辑模型','image')`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Pool.Exec(ctx, `INSERT INTO model_catalog (id, channel_id, family, name, provider_model, type, status, sort, protocol_template_id, request_path, method, logical_model_id, route_priority)
		VALUES ('mod_route','ch_route','fam_route','路由模型','gpt-x','image','enabled',1,'pt_x','/x','POST','lm_route',10)`); err != nil {
		t.Fatal(err)
	}
	// 存量形态：没有逻辑模型的行
	if _, err := s.Pool.Exec(ctx, `INSERT INTO model_catalog (id, channel_id, family, name, provider_model, type, status, sort, protocol_template_id, request_path, method)
		VALUES ('mod_plain','ch_route','fam_plain','存量模型','gpt-y','image','enabled',2,'pt_x','/x','POST')`); err != nil {
		t.Fatal(err)
	}

	dir, err := s.Directory(ctx, "")
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]Model{}
	for _, m := range dir.Models {
		seen[m.ID] = m
	}
	routed, ok := seen["mod_route"]
	if !ok {
		t.Fatal("目录应含 mod_route")
	}
	if routed.LogicalModelID != "lm_route" || routed.RoutePriority != 10 {
		t.Fatalf("路由字段未被投影：%+v", routed)
	}
	plain, ok := seen["mod_plain"]
	if !ok {
		t.Fatal("目录应含 mod_plain")
	}
	if plain.LogicalModelID != "" {
		t.Fatalf("未纳入路由的存量行应投影为空逻辑模型 id，实际 %q", plain.LogicalModelID)
	}
}
