// Package mapping 实现企业级网关的动态参数映射引擎。
// 根据协议模板的 capabilities 配置，将统一接口参数自动映射为模型特定参数。
// 支持路径映射（a.b.c）、数组索引映射（a[0].b）、条件映射（按mode选择）。
package mapping

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

// CapabilityConfig 单个能力的配置（如 text-to-image / image-to-image）
type CapabilityConfig struct {
	RequestPath     string            `json:"request_path"`
	Method          string            `json:"method"`
	RequiredParams  []string          `json:"required_params"`
	ParamMapping    map[string]string `json:"param_mapping"` // 源路径 -> 目标路径
	ResponseExtract map[string]string `json:"response_extract"`
}

// Capabilities 协议模板的能力声明
type Capabilities map[string]CapabilityConfig

// Engine 动态参数映射引擎
type Engine struct {
	caps Capabilities
}

// NewEngine 创建映射引擎
func NewEngine(capabilitiesJSON json.RawMessage) (*Engine, error) {
	var caps Capabilities
	if len(capabilitiesJSON) == 0 || string(capabilitiesJSON) == "null" {
		return &Engine{caps: Capabilities{}}, nil
	}
	if err := json.Unmarshal(capabilitiesJSON, &caps); err != nil {
		return nil, fmt.Errorf("parse capabilities: %w", err)
	}
	return &Engine{caps: caps}, nil
}

// HasCapability 检查是否支持指定mode
func (e *Engine) HasCapability(mode string) bool {
	_, ok := e.caps[mode]
	return ok
}

// GetCapability 获取指定mode的能力配置
func (e *Engine) GetCapability(mode string) (CapabilityConfig, bool) {
	c, ok := e.caps[mode]
	return c, ok
}

// GetRequestPath 获取指定mode的请求路径
func (e *Engine) GetRequestPath(mode string, defaultPath string) string {
	if c, ok := e.caps[mode]; ok && c.RequestPath != "" {
		return c.RequestPath
	}
	return defaultPath
}

// ValidateRequired 校验必填参数
func (e *Engine) ValidateRequired(mode string, input map[string]any) error {
	c, ok := e.caps[mode]
	if !ok {
		return nil // 无能力配置时跳过校验
	}
	for _, param := range c.RequiredParams {
		// 检查映射后的目标参数是否存在于input中
		// 先找源路径，再找目标路径
		found := false
		for src, dst := range c.ParamMapping {
			if dst == param {
				if v := getNestedValue(input, src); v != nil {
					found = true
					break
				}
			}
		}
		// 也检查input中是否直接有这个参数
		if !found {
			if v := getNestedValue(input, param); v != nil {
				found = true
			}
		}
		if !found {
			return fmt.Errorf("required parameter missing: %s", param)
		}
	}
	return nil
}

// ApplyMapping 应用参数映射，将统一接口参数转换为模型特定参数
// input: 统一接口的输入参数（如 prompt, reference_images, aspect_ratio 等）
// mode: 能力模式（如 text-to-image, image-to-image）
// 返回映射后的参数 map
func (e *Engine) ApplyMapping(input map[string]any, mode string) (map[string]any, error) {
	c, ok := e.caps[mode]
	if !ok || len(c.ParamMapping) == 0 {
		// 无映射配置时，直接返回input的浅拷贝
		result := make(map[string]any, len(input))
		for k, v := range input {
			result[k] = v
		}
		return result, nil
	}

	result := make(map[string]any)
	for srcPath, dstPath := range c.ParamMapping {
		value := getNestedValue(input, srcPath)
		if value == nil {
			continue // 源参数不存在，跳过
		}
		setNestedValue(result, dstPath, value)
	}
	return result, nil
}

// ExtractResponse 从响应中提取指定字段
// response: 上游API的响应
// mode: 能力模式
// 返回提取后的字段 map
func (e *Engine) ExtractResponse(response map[string]any, mode string) map[string]string {
	c, ok := e.caps[mode]
	if !ok || len(c.ResponseExtract) == 0 {
		return nil
	}
	result := make(map[string]string, len(c.ResponseExtract))
	for name, path := range c.ResponseExtract {
		if v := getNestedValue(response, path); v != nil {
			result[name] = fmt.Sprintf("%v", v)
		}
	}
	return result
}

// getNestedValue 从嵌套map中按路径获取值
// 支持 a.b.c 和 a[0].b 格式
func getNestedValue(data map[string]any, path string) any {
	parts := parsePath(path)
	var current any = data
	for _, part := range parts {
		switch p := part.(type) {
		case string:
			m, ok := current.(map[string]any)
			if !ok {
				return nil
			}
			current, ok = m[p]
			if !ok {
				return nil
			}
		case int:
			arr, ok := current.([]any)
			if !ok || p < 0 || p >= len(arr) {
				return nil
			}
			current = arr[p]
		}
	}
	return current
}

// setNestedValue 按路径设置嵌套map中的值
// 支持 a.b.c 和 a[0].b 格式
func setNestedValue(data map[string]any, path string, value any) {
	parts := parsePath(path)
	if len(parts) == 0 {
		return
	}

	current := data
	for i, part := range parts[:len(parts)-1] {
		switch p := part.(type) {
		case string:
			next, ok := current[p]
			if !ok {
				// 判断下一部分是数组还是map
				if _, isInt := parts[i+1].(int); isInt {
					next = make([]any, 0)
				} else {
					next = make(map[string]any)
				}
				current[p] = next
			}
			current, ok = next.(map[string]any)
			if !ok {
				return // 类型不匹配，跳过
			}
		case int:
			// 数组索引路径暂不支持自动创建数组
			return
		}
	}

	// 设置最后一级
	last := parts[len(parts)-1]
	switch p := last.(type) {
	case string:
		current[p] = value
	case int:
		// 数组索引路径暂不支持
	}
}

// parsePath 解析路径，返回字符串键和整数索引的混合切片
// 例如 "reference_images[0].url" -> ["reference_images", 0, "url"]
func parsePath(path string) []any {
	var result []any
	var current strings.Builder

	for i := 0; i < len(path); i++ {
		c := path[i]
		switch c {
		case '.':
			if current.Len() > 0 {
				result = append(result, current.String())
				current.Reset()
			}
		case '[':
			if current.Len() > 0 {
				result = append(result, current.String())
				current.Reset()
			}
			// 读取索引
			j := i + 1
			for j < len(path) && path[j] != ']' {
				current.WriteByte(path[j])
				j++
			}
			if idx, err := strconv.Atoi(current.String()); err == nil {
				result = append(result, idx)
			}
			current.Reset()
			i = j // 跳过 ']'
		default:
			current.WriteByte(c)
		}
	}
	if current.Len() > 0 {
		result = append(result, current.String())
	}
	return result
}
