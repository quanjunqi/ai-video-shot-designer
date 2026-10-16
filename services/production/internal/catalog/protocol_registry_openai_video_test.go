package catalog

import (
	"encoding/json"
	"testing"
)

// TestRegistryFallbackOpenAIVideo：注册表必须含 pt_builtin_openai_video 的 canonical 定义
// （TASK-PROTOCOL-005：修漂移——此前 openai_video 只在 DB、不在注册表，DB 行被删即无兜底）。
func TestRegistryFallbackOpenAIVideo(t *testing.T) {
	def, ok := ProtocolDefinitionByID("pt_builtin_openai_video")
	if !ok {
		t.Fatal("注册表缺失 pt_builtin_openai_video 定义（漂移未修复）")
	}
	if def.Type != "video" || def.RequestPath != "/v1/videos/generations" {
		t.Fatalf("定义字段不符: type=%s path=%s", def.Type, def.RequestPath)
	}
	// 兜底定义必须完整（含轮询 timeout——否则 DB 缺行时异步行为退化）
	if !def.Async.Enabled || def.Async.TimeoutMinutes != 1440 || def.Async.PollIntervalSeconds != 15 {
		t.Fatalf("async 兜底定义不完整: %+v", def.Async)
	}
	// capabilities 必须与 061 同源（text-to-video + image-to-video）
	var caps map[string]any
	if err := json.Unmarshal(def.Capabilities, &caps); err != nil {
		t.Fatalf("capabilities 解析失败: %v", err)
	}
	for _, k := range []string{"text-to-video", "image-to-video"} {
		if _, ok := caps[k]; !ok {
			t.Fatalf("capabilities 缺 %s", k)
		}
	}
}

// TestRegistryFallbackMergeBehavior：DB 缺 openai_video 行时，MergeTemplates 由注册表兜底返回。
func TestRegistryFallbackMergeBehavior(t *testing.T) {
	// 模拟 DB 无 openai_video 行（仅 openai）
	out := MergeTemplates([]ProtocolTemplate{{ID: "pt_builtin_openai"}})
	found := false
	for _, tmpl := range out {
		if tmpl.ID == "pt_builtin_openai_video" {
			found = true
			var async map[string]any
			if err := json.Unmarshal(tmpl.Async, &async); err != nil {
				t.Fatalf("async 解析失败: %v", err)
			}
			if async["timeoutMinutes"] != float64(1440) {
				t.Fatalf("兜底 async 缺 timeoutMinutes: %v", async)
			}
			break
		}
	}
	if !found {
		t.Fatal("MergeTemplates 未由注册表兜底 openai_video（DB 缺行时应返回注册表定义）")
	}
}
