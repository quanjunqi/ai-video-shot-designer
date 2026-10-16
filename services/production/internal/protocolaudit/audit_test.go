package protocolaudit

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// 061 确立的能力键枚举（词表与调用方同源）。
var allowedCapKeys = []string{
	"text-chat", "text-to-image", "image-to-image", "text-to-video", "image-to-video",
}

// comfyui 例外：本地工作流自定义，协议层无法静态声明能力。
var emptyCapOK = map[string]bool{"pt_builtin_comfyui": true}

// 注册表 id 集（catalog.ProtocolDefinitions() 实测：8 个，不含 openai_video——后者只在 DB）。
var registryIDs = []string{
	"pt_builtin_comfyui", "pt_builtin_grsai", "pt_builtin_jimeng_image", "pt_builtin_jimeng_video",
	"pt_builtin_minimax_text", "pt_builtin_minimax_video", "pt_builtin_openai", "pt_builtin_openai_img",
	// TASK-PROTOCOL-005：注册表已补 canonical 定义（此前只在 DB——漂移已修复）。
	"pt_builtin_openai_video",
}

func row(id string, caps map[string]any) Row {
	raw, _ := json.Marshal(caps)
	return Row{ID: id, Capabilities: raw, Builtin: true}
}

// TestAuditDetectsDBOnlyDrift：db-only 漂移检出（判据 1——openai_video 场景）。
func TestAuditDetectsDBOnlyDrift(t *testing.T) {
	rows := []Row{
		row("pt_builtin_openai", map[string]any{"text-chat": map[string]any{}}),
		row("pt_builtin_ghost", map[string]any{"text-to-video": map[string]any{}}),
	}
	rep := Audit(registryIDs, rows, allowedCapKeys, emptyCapOK)
	if !reflect.DeepEqual(rep.DBOnly, []string{"pt_builtin_ghost"}) {
		t.Fatalf("db-only 检出失败: %v", rep.DBOnly)
	}
}

// TestAuditClean：干净场景（注册表与 DB 同集、词表合法）无违规。
func TestAuditClean(t *testing.T) {
	rows := []Row{
		row("pt_builtin_comfyui", nil), // 例外：空
		row("pt_builtin_openai", map[string]any{"text-chat": map[string]any{}}),
		row("pt_builtin_openai_img", map[string]any{"text-to-image": map[string]any{}}),
	}
	rep := Audit(registryIDs, rows, allowedCapKeys, emptyCapOK)
	if len(rep.DBOnly) != 0 || len(rep.CapabilityViolations) != 0 {
		t.Fatalf("干净场景不应有违规: %+v", rep)
	}
	if len(rep.MissingCapabilityHint) != 0 {
		// openai 与 openai_img 有能力；comfyui 例外——只有 registryIDs 里缺失的不会进来
		t.Fatalf("不应有缺失提示: %v", rep.MissingCapabilityHint)
	}
}

// TestAuditCapabilityKeyViolation：能力键不在枚举 → 违规检出（判据 2）。
func TestAuditCapabilityKeyViolation(t *testing.T) {
	rows := []Row{row("pt_builtin_openai", map[string]any{"bad-mode": map[string]any{}})}
	rep := Audit(registryIDs, rows, allowedCapKeys, emptyCapOK)
	if len(rep.CapabilityViolations) != 1 {
		t.Fatalf("应检出 1 条违规: %+v", rep.CapabilityViolations)
	}
	if !reflect.DeepEqual(rep.CapabilityViolations[0].Keys, []string{"bad-mode"}) {
		t.Fatalf("违规键记录错误: %+v", rep.CapabilityViolations[0])
	}
}

// TestAuditMissingCapabilityHint：builtin 且空能力（非例外）→ 提示。
func TestAuditMissingCapabilityHint(t *testing.T) {
	rows := []Row{row("pt_builtin_openai", nil)}
	rep := Audit(registryIDs, rows, allowedCapKeys, emptyCapOK)
	if !reflect.DeepEqual(rep.MissingCapabilityHint, []string{"pt_builtin_openai"}) {
		t.Fatalf("缺失提示失败: %v", rep.MissingCapabilityHint)
	}
}

// TestAuditRegistryOnly：注册表有、DB 无 → MergeTemplates 补齐态（registry-only）。
func TestAuditRegistryOnly(t *testing.T) {
	rows := []Row{row("pt_builtin_openai", map[string]any{"text-chat": map[string]any{}})}
	rep := Audit(registryIDs, rows, allowedCapKeys, emptyCapOK)
	if len(rep.RegistryOnly) == 0 {
		t.Fatalf("应检出 registry-only: %+v", rep.RegistryOnly)
	}
}

// TestAuditSnapshotRealDB：真库快照（2026-10-17）——已知漂移自证门禁。
// 断言：快照 9 行；db-only = [pt_builtin_openai_video]（已知漂移，防回归）；无能力键违规。
func TestAuditSnapshotRealDB(t *testing.T) {
	b, err := os.ReadFile(filepath.Join("testdata", "protocol_templates_snapshot.json"))
	if err != nil {
		t.Fatalf("读快照: %v", err)
	}
	var snap struct {
		Templates []Row `json:"templates"`
	}
	if err := json.Unmarshal(b, &snap); err != nil {
		t.Fatalf("解析快照: %v", err)
	}
	if len(snap.Templates) != 9 {
		t.Fatalf("快照应为 9 个模板，got %d", len(snap.Templates))
	}
	rep := Audit(registryIDs, snap.Templates, allowedCapKeys, emptyCapOK)
	// TASK-PROTOCOL-005：注册表已补 openai_video canonical 定义 → 漂移归零（db-only 为空）。
	if len(rep.DBOnly) != 0 {
		t.Fatalf("快照不应有漂移（openai_video 已入注册表）: %v", rep.DBOnly)
	}
	if len(rep.Both) != 9 {
		t.Fatalf("双侧一致应为 9 个（含 openai_video）: %v", rep.Both)
	}
	if len(rep.CapabilityViolations) != 0 {
		t.Fatalf("快照不应有能力键违规: %+v", rep.CapabilityViolations)
	}
	t.Logf("快照审计:\n%s", rep.String())
}
