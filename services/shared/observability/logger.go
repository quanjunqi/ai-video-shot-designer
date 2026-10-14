// Package observability 提供后端服务的统一可观测性基础设施：
// 结构化 JSON 日志（slog）、请求日志中间件（request_id 透传 + 必带字段）、
// Prometheus text 格式 /metrics 端点（零第三方依赖）。
//
// 规范见 docs/how-to/observability.md。
package observability

import (
	"log/slog"
	"os"
)

// NewJSONLogger 返回带 service 字段的结构化 JSON 日志器。
// 生产默认 Info 级别；LOG_LEVEL=debug 可开 Debug（本地排障用）。
func NewJSONLogger(service string) *slog.Logger {
	level := slog.LevelInfo
	if os.Getenv("LOG_LEVEL") == "debug" {
		level = slog.LevelDebug
	}
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level})).With("service", service)
}
