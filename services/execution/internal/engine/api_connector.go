package engine

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"
)

// 执行器层错误：接口层与各执行器实现共用，调用方用 errors.Is 判定。
var (
	// ErrExecutorNotImplemented 表示该执行器类型尚未实现此项能力。
	ErrExecutorNotImplemented = errors.New("engine: executor capability not implemented")
	// ErrUnknownExecutorType 表示渠道声明的执行器类型无法识别。
	ErrUnknownExecutorType = errors.New("engine: unknown executor type")
	// ErrCancelUnsupported 表示该后端不支持取消语义。
	ErrCancelUnsupported = errors.New("engine: cancel not supported")
)

// apiConnector 把现有的 HTTP 实现（Run / RunAsync）适配为统一 Executor。
//
// 能力边界与现有 engine 行为严格一致，不做额外承诺：
//   - Submit：Async=false 走 Run（单次请求）；Async=true 走 RunAsync
//     （提交 → 轮询 → 结果，内部阻塞至终态）。
//   - Poll / GetResult：HTTP 协议的轮询状态机内置于 RunAsync，不单独暴露；
//     ComfyUI 类执行器（Phase 2.2/2.3）才需要独立轮询。
//   - Cancel：HTTP 协议无取消语义。
type apiConnector struct {
	cfg    ExecutorConfig
	client *http.Client
}

// NewAPIConnector 创建 HTTP API 执行器。
// ExecutorConfig.HTTPClient 需为 *http.Client；传 nil 或其它类型时使用默认客户端。
func NewAPIConnector(cfg ExecutorConfig) Executor {
	client, _ := cfg.HTTPClient.(*http.Client)
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	return &apiConnector{cfg: cfg, client: client}
}

// Type 返回执行器类型。
func (c *apiConnector) Type() ExecutorType { return ExecutorTypeAPI }

// Submit 执行一次调用，语义与 engine.Run / engine.RunAsync 完全一致：
// 返回的 ExecutorResult 已是终态（异步协议也在此阻塞到终态）。
func (c *apiConnector) Submit(ctx context.Context, req ExecutorRequest) (ExecutorResult, error) {
	if req.Timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, req.Timeout)
		defer cancel()
	}

	runReq := buildRunRequest(req)
	submittedAt := time.Now()

	var (
		out RunResult
		err error
	)
	if req.Async {
		out, err = RunAsync(ctx, c.cfg.Credentials, runReq, c.client)
	} else {
		out, err = Run(ctx, c.cfg.Credentials, runReq, c.client)
	}

	res := ExecutorResult{
		Status:      statusFromRunResult(out, err),
		Extracted:   out.Extracted,
		RawBody:     out.RawBody,
		HTTPStatus:  out.Status,
		Duration:    time.Since(submittedAt),
		SubmittedAt: submittedAt,
	}
	if err != nil {
		res.Error = out.Error
		if res.Error == "" {
			res.Error = err.Error()
		}
		return res, err
	}

	// 优先采用 RunAsync 透出的提交期任务 ID（终态轮询响应里通常没有它）；
	// 同步协议或模板未声明时，回落为从提取结果中取值。
	res.TaskID = out.ProviderTaskID
	if res.TaskID == "" {
		res.TaskID = extractTaskID(out.Extracted, req.ProtocolTemplate)
	}
	res.ProviderTaskID = res.TaskID
	completedAt := time.Now()
	res.CompletedAt = &completedAt
	return res, nil
}

// Poll 未单独暴露：HTTP 协议的轮询已内置于 RunAsync。
func (c *apiConnector) Poll(context.Context, string, ExecutorRequest) (ExecutorResult, error) {
	return ExecutorResult{}, fmt.Errorf(
		"%w: %s 的轮询内置于 Submit(RunAsync)", ErrExecutorNotImplemented, ExecutorTypeAPI)
}

// Cancel 不受支持：HTTP 协议无取消语义。
func (c *apiConnector) Cancel(context.Context, string, ExecutorRequest) error {
	return fmt.Errorf("%w: %s", ErrCancelUnsupported, ExecutorTypeAPI)
}

// GetResult 未单独暴露：结果随 Submit 一并返回。
func (c *apiConnector) GetResult(context.Context, string, ExecutorRequest) (ExecutorResult, error) {
	return ExecutorResult{}, fmt.Errorf(
		"%w: %s 的结果由 Submit 返回", ErrExecutorNotImplemented, ExecutorTypeAPI)
}

// buildRunRequest 把统一 ExecutorRequest 翻译为现有 RunRequest。
//
// Runtime 组装规则与网关层（httpapi）保持一致：Input 与 Parameters 合并为运行时值，
// 供协议模板中 role=runtime 的参数取值；ModelRequestPath 注入 __request_path，
// 使执行路径由调用方决定，避免在 worker 内硬编码路径。
func buildRunRequest(req ExecutorRequest) RunRequest {
	runtime := make(map[string]any, len(req.Input)+len(req.Parameters)+1)
	for k, v := range req.Input {
		runtime[k] = v
	}
	for k, v := range req.Parameters {
		runtime[k] = v
	}
	if req.ModelRequestPath != "" {
		runtime["__request_path"] = req.ModelRequestPath
	}
	return RunRequest{
		ChannelID:        req.ChannelID,
		ProviderModel:    req.ProviderModel,
		ProtocolTemplate: req.ProtocolTemplate,
		ModelParams:      req.ModelParams,
		ModelRequestPath: req.ModelRequestPath,
		Runtime:          runtime,
	}
}

// statusFromRunResult 把 RunResult 映射为统一 TaskStatus。
// 注意：现有 Run / RunAsync 只在失败时返回 error，故 err==nil 即视为成功。
func statusFromRunResult(out RunResult, err error) TaskStatus {
	switch {
	case err != nil:
		return TaskStatusFailed
	case out.Status >= 200 && out.Status < 300:
		return TaskStatusSucceeded
	default:
		return TaskStatusFailed
	}
}

// extractTaskID 从提取结果中取异步任务 ID。
// 字段名取协议模板 async.taskIdField，缺省与 RunAsync 的默认值保持一致（task_id）。
func extractTaskID(extracted map[string]any, tmpl Template) string {
	field := "task_id"
	if len(tmpl.Async) > 0 {
		var async struct {
			TaskIDField string `json:"taskIdField"`
		}
		if err := json.Unmarshal(tmpl.Async, &async); err == nil && async.TaskIDField != "" {
			field = async.TaskIDField
		}
	}
	if v, ok := extracted[field]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}
