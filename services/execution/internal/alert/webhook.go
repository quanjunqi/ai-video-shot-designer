package alert

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

// maxWebhookAttempts 是 webhook 发送重试上限（task 卡 §6：简单 POST + 重试上限，不引入告警服务）。
const maxWebhookAttempts = 3

// webhookTimeout 是单次 webhook POST 超时（失败可快速进入重试）。
const webhookTimeout = 5 * time.Second

// WebhookClient 负责向 webhook_url POST 告警载荷（简单实现 + 有上限重试）。
// HTTPClient 可注入（测试用）；nil 时用默认 client。
type WebhookClient struct {
	HTTPClient *http.Client
	Log        *slog.Logger
}

// NewWebhookClient 构造 webhook 客户端。log 为 nil 时用默认 logger。
func NewWebhookClient(log *slog.Logger) *WebhookClient {
	if log == nil {
		log = slog.Default()
	}
	return &WebhookClient{Log: log}
}

// Payload 是发往 webhook 的告警载荷（字段与前端/日志对齐）。
type Payload struct {
	Kind         string  `json:"kind"`                     // error_rate_spike / circuit_breaker / sync_failure
	WorkspaceID  string  `json:"workspace_id"`             // 触发告警的租户
	Unit         string  `json:"unit,omitempty"`           // 供给单元 channel/model（熔断/同步）；错误率突增可空（全局）
	Message      string  `json:"message"`                  // 人类可读描述
	ErrorRatePct float64 `json:"error_rate_pct,omitempty"` // 错误率突增：窗口错误率（0-100）
	TriggeredAt  string  `json:"triggered_at"`             // ISO8601（服务端 now）
}

// Send POST 载荷到 webhook_url，最多 maxWebhookAttempts 次（指数退避）。
// 发送失败只记日志（best-effort 通知；告警不是合规留痕，丢失可接受——审计日志才是权威）。
// 返回是否成功（测试断言用）。
func (w *WebhookClient) Send(ctx context.Context, url string, p Payload) bool {
	if w == nil || url == "" {
		return false
	}
	body, err := json.Marshal(p)
	if err != nil {
		w.Log.Warn("alert: webhook marshal failed", "err", err)
		return false
	}
	client := w.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: webhookTimeout}
	}
	backoff := 500 * time.Millisecond
	for attempt := 1; attempt <= maxWebhookAttempts; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
		if err != nil {
			w.Log.Warn("alert: webhook request build failed", "err", err)
			return false
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(req)
		if err == nil {
			_ = resp.Body.Close()
			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				w.Log.Info("alert: webhook sent", "kind", p.Kind, "workspace", p.WorkspaceID, "url", url, "attempt", attempt)
				return true
			}
			err = fmt.Errorf("webhook non-2xx: %d", resp.StatusCode)
		}
		w.Log.Warn("alert: webhook attempt failed", "kind", p.Kind, "workspace", p.WorkspaceID, "attempt", attempt, "err", err)
		if attempt < maxWebhookAttempts {
			select {
			case <-time.After(backoff):
			case <-ctx.Done():
				return false
			}
			backoff *= 2
		}
	}
	return false
}

// errWebhookDisabled 表示配置缺失/关闭（调用方跳过，非错误）。
var errWebhookDisabled = errors.New("alert: webhook not configured or disabled")
