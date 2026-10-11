package catalog

import (
	"context"
	"testing"
)

// 回归护栏：**目录必须能容忍"没有协议模板"的模型行**。
//
// 真实事故（D2 真机验证暴露）：人工策展允许不选协议模板 ⇒ `protocol_template_id` 落库为 NULL；
// 而 Directory/GetModel/UpdateModel 的扫描目标是非指针 `string` ⇒
// `can't scan into dest[9]: cannot scan NULL into *string` ⇒ **整个目录接口 503**。
// 既有 18 行都带模板，所以这个雷一直没被踩到 —— 一次"没选模板"的策展就能让全站目录不可用。
func TestIntegrationDirectoryToleratesNullProtocolTemplate(t *testing.T) {
	s := testPostgresStore(t)
	ctx := context.Background()
	if _, err := s.Pool.Exec(ctx, `INSERT INTO model_channels (id, name, kind, base_url, auth_type) VALUES ('ch_null_tpl','无模板渠道','aggregator','https://up.example.com','bearer')`); err != nil {
		t.Fatal(err)
	}
	// 刻意不写 protocol_template_id ⇒ NULL（人工策展时的真实情况）
	if _, err := s.Pool.Exec(ctx, `INSERT INTO model_catalog (id, channel_id, family, name, provider_model, type, status, sort, note, request_path, method, params, capability, workspace_id)
		VALUES ('m_null_tpl','ch_null_tpl','fam_null','无模板模型','m-null','image','enabled',1,'',' /x','POST','[]','{}','')`); err != nil {
		t.Fatal(err)
	}

	dir, err := s.Directory(ctx, "")
	if err != nil {
		t.Fatalf("★ 目录必须能容忍没有协议模板的行（否则一次策展会让整个目录 503）：%v", err)
	}
	found := false
	for _, m := range dir.Models {
		if m.ID == "m_null_tpl" {
			found = true
			if m.ProtocolTemplateID != "" {
				t.Fatalf("NULL 应被归一化为空串，实际 %q", m.ProtocolTemplateID)
			}
		}
	}
	if !found {
		t.Fatal("该行应出现在目录里（不是被过滤掉）")
	}

	// 同形的另一条读路径也必须容忍（否则"只修一处"会留下同样的事故）
	if _, err := s.GetModel(ctx, "m_null_tpl"); err != nil {
		t.Fatalf("★ GetModel 同样要容忍 NULL 协议模板：%v", err)
	}
}
