package catalog

import (
	"encoding/json"
	"strings"
	"testing"
)

// ADR-008 §3 的读写契约（B4a-2）：两类证据必须【能被读到】，且 NULL 的语义要如实表达。
//
// 背景（判据）：迁移 031 加了 doc_ref / observed_evidence 两列、033 为 8 条内置协议写了 doc_ref，
// 但在此改动之前，**Go 代码里没有任何引用**（`git grep doc_ref services/production` 只命中迁移 SQL）
// ⇒ 数据在库里却读不出来：没有结构体字段、没有 SELECT、没有 JSON。
// 本文件锁住"读得出来"这件事的对外形态。

func TestProtocolTemplateExposesEvidenceFields(t *testing.T) {
	tpl := ProtocolTemplate{
		ID:               "pt_x",
		DocRef:           json.RawMessage(`{"source":"official","url":"https://example.test/doc"}`),
		ObservedEvidence: json.RawMessage(`{"observedStatusEnum":["Preparing","Success"]}`),
	}
	b, err := json.Marshal(tpl)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	got := string(b)
	for _, want := range []string{`"docRef"`, `"observedEvidence"`, "example.test/doc", "observedStatusEnum"} {
		if !strings.Contains(got, want) {
			t.Fatalf("JSON 应含 %s，实际 %s", want, got)
		}
	}
}

// NULL 语义：doc_ref / observed_evidence 为 NULL（尚未对齐文档 / 尚未实测）时，
// 字段应**整体缺席**而不是出现 `null` 或空对象 —— 让读取方一眼看出"还没有"，而不是"有但是空的"。
func TestProtocolTemplateOmitsUnsetEvidence(t *testing.T) {
	b, err := json.Marshal(ProtocolTemplate{ID: "pt_y"})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	got := string(b)
	if strings.Contains(got, "docRef") || strings.Contains(got, "observedEvidence") {
		t.Fatalf("未设置的证据字段应被省略（omitempty），实际 %s", got)
	}
}

// 两类证据必须能【同时】出现在同一行 —— ADR-008 的核心是"并列"而不是"二选一"：
// 冲突时以实测为准，但差异要保留可见，所以两者都得读得出来。
func TestProtocolTemplateCarriesBothEvidenceKinds(t *testing.T) {
	tpl := ProtocolTemplate{
		ID:               "pt_both",
		DocRef:           json.RawMessage(`{"source":"cloud","docVersion":"2026-09"}`),
		ObservedEvidence: json.RawMessage(`{"lastProbedAt":"2026-10-10T00:00:00Z","discrepancies":[{"field":"statusEnum"}]}`),
	}
	b, _ := json.Marshal(tpl)
	var back map[string]any
	if err := json.Unmarshal(b, &back); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if back["docRef"] == nil || back["observedEvidence"] == nil {
		t.Fatalf("两类证据应同时出现，实际 %v", back)
	}
}
