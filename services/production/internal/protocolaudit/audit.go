// Package protocolaudit 对协议模板定义做三方一致性审计（TASK-PROTOCOL-004）。
//
// 动机：本仓协议模板定义来源不统一——注册表 Go 代码（protocol_registry.go）与 DB 行
// （protocol_templates）并行维护，实测 2026-10-16 发现 `pt_builtin_openai_video` 只在 DB、
// 不在注册表（漂移）。本包把漂移升级为**可自动检出**的门禁。
//
// 检查项：
//  1. id 集合：注册表 id 集 vs DB id 集（db-only = 漂移检出；registry-only = MergeTemplates 补齐态）
//  2. 能力键词表：DB capabilities 的键必须 ∈ 允许枚举（061 确立：
//     text-chat / text-to-image / image-to-image / text-to-video / image-to-video），
//     例外模板（comfyui：工作流自定义，协议层无法静态声明）允许空
//  3. 缺失提示：builtin 且 capabilities 为空（例外模板除外）→ 提示（渐进补齐原则，非阻断）
//
// 纯函数：输入 = 注册表 id 集 + DB 行快照 + 词表，输出 = Report；不连库（快照由调用方提供，
// 见 testdata/protocol_templates_snapshot.json——真库 2026-10-17 快照）。
package protocolaudit

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// Row 是协议模板的 DB 行快照（protocol_templates 的子集）。
type Row struct {
	ID           string          `json:"id"`
	Label        string          `json:"label"`
	Type         string          `json:"type"`
	Method       string          `json:"method"`
	RequestPath  string          `json:"request_path"`
	Capabilities json.RawMessage `json:"capabilities"`
	Builtin      bool            `json:"builtin"`
	Enabled      bool            `json:"enabled"`
}

// CapViolation 是能力键词表违规。
type CapViolation struct {
	TemplateID string   `json:"template_id"`
	Keys       []string `json:"keys"`
}

// Report 是审计输出。
type Report struct {
	RegistryOnly          []string       `json:"registry_only"`           // 注册表有、DB 无（MergeTemplates 补齐态）
	DBOnly                []string       `json:"db_only"`                 // DB 有、注册表无（漂移检出）
	Both                  []string       `json:"both"`                    // 双侧一致
	CapabilityViolations  []CapViolation `json:"capability_violations"`   // 能力键不在允许枚举
	MissingCapabilityHint []string       `json:"missing_capability_hint"` // builtin 且空（例外除外）
	Notes                 []string       `json:"notes"`                   // 附加说明
}

// Audit 执行三方一致性审计。
//
//   - registryIDs：注册表定义的模板 id 集（catalog.ProtocolDefinitions() 提取）
//   - rows：DB 行快照
//   - allowedCapKeys：允许的能力键枚举（061）
//   - emptyCapOK：允许 capabilities 为空的模板 id 集（comfyui 例外）
func Audit(registryIDs []string, rows []Row, allowedCapKeys []string, emptyCapOK map[string]bool) Report {
	var rep Report
	regSet := map[string]bool{}
	for _, id := range registryIDs {
		regSet[id] = true
	}
	allowed := map[string]bool{}
	for _, k := range allowedCapKeys {
		allowed[k] = true
	}
	for _, r := range rows {
		switch {
		case regSet[r.ID]:
			rep.Both = append(rep.Both, r.ID)
		default:
			rep.DBOnly = append(rep.DBOnly, r.ID)
		}
		// 能力键词表
		var caps map[string]any
		if len(r.Capabilities) > 0 && string(r.Capabilities) != "{}" && string(r.Capabilities) != "null" {
			if err := json.Unmarshal(r.Capabilities, &caps); err != nil {
				rep.Notes = append(rep.Notes, fmt.Sprintf("%s: capabilities 解析失败: %v", r.ID, err))
				continue
			}
			keys := make([]string, 0, len(caps))
			for k := range caps {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			var bad []string
			for _, k := range keys {
				if !allowed[k] {
					bad = append(bad, k)
				}
			}
			if len(bad) > 0 {
				rep.CapabilityViolations = append(rep.CapabilityViolations, CapViolation{TemplateID: r.ID, Keys: bad})
			}
		} else if r.Builtin && !emptyCapOK[r.ID] {
			rep.MissingCapabilityHint = append(rep.MissingCapabilityHint, r.ID)
		}
	}
	// 注册表有、DB 无
	for _, id := range registryIDs {
		if !contains(rows, id) {
			rep.RegistryOnly = append(rep.RegistryOnly, id)
		}
	}
	sort.Strings(rep.RegistryOnly)
	sort.Strings(rep.DBOnly)
	sort.Strings(rep.Both)
	// 备注：已知漂移上下文
	for _, id := range rep.DBOnly {
		rep.Notes = append(rep.Notes, fmt.Sprintf("漂移检出: %s 只在 DB、不在注册表（协议定义来源不统一，见 docs/how-to/protocol-onboarding.md）", id))
	}
	if len(rep.CapabilityViolations) > 0 {
		rep.Notes = append(rep.Notes, "能力键违规：新键必须与 061 枚举同源（064 教训：词表与调用方同源）")
	}
	return rep
}

// String 输出人读报告。
func (r Report) String() string {
	var b strings.Builder
	fmt.Fprintf(&b, "协议模板一致性审计报告\n")
	fmt.Fprintf(&b, "  双侧一致 (both): %d %v\n", len(r.Both), r.Both)
	fmt.Fprintf(&b, "  漂移 (db_only): %d %v\n", len(r.DBOnly), r.DBOnly)
	fmt.Fprintf(&b, "  注册表补齐态 (registry_only): %d %v\n", len(r.RegistryOnly), r.RegistryOnly)
	fmt.Fprintf(&b, "  能力键违规: %d\n", len(r.CapabilityViolations))
	for _, v := range r.CapabilityViolations {
		fmt.Fprintf(&b, "    - %s: %v\n", v.TemplateID, v.Keys)
	}
	fmt.Fprintf(&b, "  空能力提示: %d %v\n", len(r.MissingCapabilityHint), r.MissingCapabilityHint)
	for _, n := range r.Notes {
		fmt.Fprintf(&b, "  · %s\n", n)
	}
	return b.String()
}

func contains(rows []Row, id string) bool {
	for _, r := range rows {
		if r.ID == id {
			return true
		}
	}
	return false
}
