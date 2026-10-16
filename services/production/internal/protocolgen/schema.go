package protocolgen

import (
	"fmt"
	"sort"
	"strings"
)

// schemaNode 是解析后的 schema 节点（resolveSchemaNode 的输出）。
type schemaNode struct {
	Type        string
	Desc        string
	Properties  map[string]schemaProp
	OrderedKeys []string // properties 的确定性顺序（规范声明顺序）
	RequiredSet map[string]bool
	Items       *schemaProp // type=array 时的 items 元信息
}

type schemaProp struct {
	Type  string
	Desc  string
	Items *schemaProp // 仅数组属性的一层 items
}

// resolveSchemaNode 解析 schema 节点（含 $ref / allOf / oneOf / anyOf 展开）。
// requestBody/responses 顶层传入的必须是 schema 节点（map）。
func resolveSchemaNode(s Spec, node map[string]any) (*schemaNode, error) {
	n, err := resolveNode(s, node, map[string]bool{})
	if err != nil {
		return nil, err
	}
	return n, nil
}

// resolveNode 递归解析 schema 节点。
//
// 确定性规则：
//   - $ref → 文件内查找 components.schemas[name] → 递归；跨文件报 ErrUnsupportedRef
//   - allOf → 合并各分支：properties 并集（保持首个出现顺序）、required 并集、type 取首个非空
//   - oneOf/anyOf → 取第一个含 properties 的分支，其余跳过
//   - object + properties → 直接
//   - array + items → Items 元信息
//   - 其余 → 仅类型
func resolveNode(s Spec, node map[string]any, seen map[string]bool) (*schemaNode, error) {
	// 1. $ref
	if ref, _ := node["$ref"].(string); ref != "" {
		return resolveRef(s, ref, seen)
	}

	n := &schemaNode{
		Properties:  map[string]schemaProp{},
		RequiredSet: map[string]bool{},
	}

	// 2. allOf：合并分支
	if allOf, ok := node["allOf"].([]any); ok && len(allOf) > 0 {
		for _, part := range allOf {
			pm, ok := part.(map[string]any)
			if !ok {
				continue
			}
			child, err := resolveNode(s, pm, seen)
			if err != nil {
				return nil, err
			}
			mergeNode(n, child)
		}
		if n.Type == "" {
			n.Type = "object"
		}
		return n, nil
	}

	// 3. oneOf/anyOf：取第一个含 properties 的分支
	if comb, ok := node["oneOf"].([]any); ok && len(comb) > 0 {
		return firstCombinatorBranch(s, comb, seen)
	}
	if comb, ok := node["anyOf"].([]any); ok && len(comb) > 0 {
		return firstCombinatorBranch(s, comb, seen)
	}

	// 4. 描述
	if d, _ := node["description"].(string); d != "" {
		n.Desc = d
	}

	// 5. 类型与属性
	switch node["type"] {
	case "object":
		n.Type = "object"
		props, _ := node["properties"].(map[string]any)
		// 确定性：属性顺序按字母序（Go map 遍历顺序随机；规范声明顺序需 streaming 解析，超纲）
		keys := make([]string, 0, len(props))
		for k := range props {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			v := props[k]
			pv, _ := v.(map[string]any)
			if pv == nil {
				continue
			}
			prop := schemaProp{Type: "object"}
			if t, _ := pv["type"].(string); t != "" {
				prop.Type = t
			}
			if d, _ := pv["description"].(string); d != "" {
				prop.Desc = d
			}
			if prop.Type == "array" {
				if items, ok := pv["items"].(map[string]any); ok {
					it := &schemaProp{Type: "object"}
					if t, _ := items["type"].(string); t != "" {
						it.Type = t
					}
					if d, _ := items["description"].(string); d != "" {
						it.Desc = d
					}
					if it.Type == "object" {
						if itp, ok := items["properties"].(map[string]any); ok {
							// 数组 items 是对象：取字母序最小属性作为确定性语义提示（items 一层）
							ik := make([]string, 0, len(itp))
							for ikk := range itp {
								ik = append(ik, ikk)
							}
							sort.Strings(ik)
							if len(ik) > 0 {
								it.Desc = strings.TrimSpace(it.Desc + "（items 字段示例: " + ik[0] + "）")
							}
						}
					}
					prop.Items = it
				}
			}
			n.Properties[k] = prop
			n.OrderedKeys = append(n.OrderedKeys, k)
		}
		if req, ok := node["required"].([]any); ok {
			for _, r := range req {
				if rs, ok := r.(string); ok {
					n.RequiredSet[rs] = true
				}
			}
		}
		return n, nil
	case "array":
		n.Type = "array"
		if items, ok := node["items"].(map[string]any); ok {
			it := &schemaProp{Type: "object"}
			if t, _ := items["type"].(string); t != "" {
				it.Type = t
			}
			if d, _ := items["description"].(string); d != "" {
				it.Desc = d
			}
			n.Items = it
		}
		return n, nil
	default:
		if t, _ := node["type"].(string); t != "" {
			n.Type = t
		} else if node["enum"] != nil {
			n.Type = "string"
		} else {
			n.Type = "object"
		}
		return n, nil
	}
}

// resolveRef 解析文件内 $ref。
func resolveRef(s Spec, ref string, seen map[string]bool) (*schemaNode, error) {
	if !strings.HasPrefix(ref, "#/components/schemas/") {
		return nil, ErrUnsupportedRef{Ref: ref}
	}
	name := strings.TrimPrefix(ref, "#/components/schemas/")
	if seen[name] {
		return &schemaNode{Type: "object"}, nil // 循环引用：以 object 兜底，不深挖
	}
	seen[name] = true
	defer delete(seen, name)
	sc, ok := s.Components["schemas"]
	if !ok {
		return nil, fmt.Errorf("protocolgen: components.schemas 缺失（ref=%s）", ref)
	}
	target, ok := sc[name].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("protocolgen: schema 不存在: %s", name)
	}
	return resolveNode(s, target, seen)
}

// mergeNode 把 child 合并进 n（allOf 语义：properties 并集、required 并集、type 取首个非空）。
func mergeNode(n, child *schemaNode) {
	if n.Type == "" {
		n.Type = child.Type
	}
	if n.Desc == "" {
		n.Desc = child.Desc
	}
	for _, k := range child.OrderedKeys {
		if _, exists := n.Properties[k]; !exists {
			n.Properties[k] = child.Properties[k]
			n.OrderedKeys = append(n.OrderedKeys, k)
		}
	}
	for k := range child.RequiredSet {
		n.RequiredSet[k] = true
	}
	if n.Items == nil && child.Items != nil {
		n.Items = child.Items
	}
}

// firstCombinatorBranch 取 oneOf/anyOf 中第一个可解析为含 properties 的分支。
func firstCombinatorBranch(s Spec, comb []any, seen map[string]bool) (*schemaNode, error) {
	for _, part := range comb {
		pm, ok := part.(map[string]any)
		if !ok {
			continue
		}
		child, err := resolveNode(s, pm, seen)
		if err != nil {
			return nil, err
		}
		if len(child.Properties) > 0 || child.Type == "object" && (len(child.OrderedKeys) > 0) {
			return child, nil
		}
		if child.Type != "" {
			return child, nil
		}
	}
	return &schemaNode{Type: "object"}, nil
}
