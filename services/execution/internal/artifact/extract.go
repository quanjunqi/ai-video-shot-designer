// Package artifact 提供「上游产物 URL → asset 服务（MinIO）落盘」的转存能力。
//
// 背景：上游（可灵/Vidu 等）返回的产物 URL 有有效期（可灵 30 天清理、Vidu 24 小时
// 过期），"生成成功但图打不开"是通病。本包在任务成功路径上把 URL 下载后经 asset
// 上传会话落盘，返回稳定的 asset_id / object_key / asset_url。
//
// 设计约束：
//   - 转存是 best-effort：失败只记录、绝不阻塞任务成功（生成是主流程，落盘是增强）。
//   - 下载上游 URL 走 netguard SSRF 防护（上游 URL 用户可控，威胁模型见 netguard 包）；
//     调用 asset 内部 API 不走防护（内网服务，套防护会自断链路）。
package artifact

import (
	"fmt"
	"net/url"
	"strings"
)

// 产物 URL 的约定键。第一刀做浅层提取：按顺序检查 Extracted 的顶层键，
// 命中第一个 http(s) 字符串即视为产物 URL。协议模板的字段标注（responseParams
// 语义标记）留待下一刀。
var artifactKeys = []string{"image_url", "video_url", "url", "result"}

// ExtractURL 从引擎提取结果（RunResult.Extracted）中找出产物 URL。
//
// 规则：
//   - 只检查约定键，第一个命中「非空字符串且 http(s)」的即返回；
//   - 键存在但值不是字符串 / 不是 http(s) → 跳过继续找；
//   - 都没有 → 返回空串（调用方据此跳过转存，任务仍成功）。
func ExtractURL(extracted map[string]any) string {
	for _, k := range artifactKeys {
		v, ok := extracted[k]
		if !ok {
			continue
		}
		s, ok := v.(string)
		if !ok || strings.TrimSpace(s) == "" {
			continue
		}
		u, err := url.Parse(strings.TrimSpace(s))
		if err != nil {
			continue
		}
		if u.Scheme == "http" || u.Scheme == "https" {
			return u.String()
		}
	}
	return ""
}

// URLWithReason 与 ExtractURL 相同，但额外给出未命中的原因（用于审计日志）。
func URLWithReason(extracted map[string]any) (string, string) {
	if len(extracted) == 0 {
		return "", "extracted is empty"
	}
	for _, k := range artifactKeys {
		v, ok := extracted[k]
		if !ok {
			continue
		}
		s, ok := v.(string)
		if !ok {
			return "", fmt.Sprintf("key %q is not a string", k)
		}
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		u, err := url.Parse(s)
		if err != nil {
			return "", fmt.Sprintf("key %q is not a valid URL: %v", k, err)
		}
		if u.Scheme == "http" || u.Scheme == "https" {
			return u.String(), ""
		}
		return "", fmt.Sprintf("key %q scheme %q not allowed", k, u.Scheme)
	}
	return "", "no artifact key (image_url/video_url/url/result) found"
}
