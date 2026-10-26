package

// Package engine assembles and executes real HTTP calls from the model
// directory contract (channel + model + protocol template).
//
// Assembly rule (source three-way classification):
//
//	static  -> template default value (overridden by model-level params)
//	model   -> providerModel injected by the executor
//	runtime -> constructed by the executor from business input (messages/tools…)
//
// The engine never fakes a dispatch: missing channel, credentials or protocol
// produces a clear error. Async-task protocols (video) are rejected here with
// an explicit reason until the polling state machine lands; sync text calls
// are fully supported.
engine

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"fmt"
	"io"
	"log"

	"net/http"
)

// Param is one entry of a protocol parameter spec table.
type Param struct {
	Key      string `json:"key"`
	Value    string `json:"value"`
	Type     string `json:"type,omitempty"`
	Role     string `json:"role,omitempty"` // static | model | runtime (default static)
	Required bool   `json:"required,omitempty"`
	Desc     string `json:"desc,omitempty"`
}

// Template is the minimal protocol-template projection the engine needs.
type Template struct {
	ID             string
	Label          string
	Method         string
	RequestPath    string
	Params         []Param
	ResponseParams []Param
	Async          json.RawMessage
	// RequestTemplate 是 ADR-007 D3 的请求模板（{{占位符}} 语法，迁移 028 的列）。
	// 非空时渲染它作为请求体（Params 仍用于解析占位符取值）；空则逐字沿用 Params 组装。
	RequestTemplate string
}

// Credentials are the decrypted tenant channel material, only ever materialized
// inside this process boundary; never returned to callers.
// Credentials carries the resolved upstream auth material for one channel.
//
// AuthHeader/AuthPrefix are the data-driven knobs (ADR-007 D2): when AuthHeader
// is non-empty the runtime writes exactly `AuthHeader: AuthPrefix + APIKey`, so
// a new header shape is a data change, not a code change. Empty AuthPrefix is
// meaningful — it means a bare value (e.g. AutoDL: `Authorization: <key>`).
type Credentials struct {
	BaseURL    string
	AuthType   string
	AuthHeader string
	AuthPrefix string
	APIKey     string
}

// RunRequest is a sync text execution against a configured model+protocol.
type RunRequest struct {
	ChannelID        string
	ProviderModel    string
	ProtocolTemplate Template
	ModelParams      []Param        // model-level overrides (only static keys take effect)
	ModelRequestPath string         // model-level path override
	Runtime          map[string]any // business values for role=runtime fields
}

// RunResult is the safe projection of a real call: HTTP status, extracted
// fields by response mapping, and raw body for diagnosis (never credentials).
type RunResult struct {
	Status    int            `json:"status"`
	Extracted map[string]any `json:"extracted"`
	RawBody   string         `json:"rawBody,omitempty"`
	Duration  string         `json:"duration"`
	// ElapsedMs 是同一个耗时的**有类型**形式（毫秒）。
	//
	// 为什么需要两个：`Duration` 是给人和 payload 看的字符串，
	// 而审计要把它写成 `latency_ms`（整型）—— 让调用方去 parse 一个自己刚格式化的
	// 字符串，是在把已经丢掉的信息再猜回来（本项目真实缺陷：worker 因此把耗时写成 0，
	// 导致**异步任务的耗时永远为 0**，而 P50/P95/平均耗时都只统计 latency_ms > 0 的行
	// ⇒ 异步长任务被整体排除在耗时分布之外）。
	ElapsedMs int    `json:"elapsedMs"`
	Error     string `json:"error,omitempty"`
	// ProviderTaskID 是异步协议在提交响应中返回的任务 ID（同步协议为空）。
	// 提交响应与最终轮询响应是两个不同的文档，任务 ID 只在提交响应中出现，
	// 故单独透出供统一 Executor 层与审计追溯使用。
	ProviderTaskID string `json:"providerTaskId,omitempty"`
}

// withElapsed 把本次调用的耗时【一次】写进两种形式：给人看的字符串 + 给审计用的毫秒。
// 4 个 RunResult 构造点原来各自重复 `time.Since(start).Round(time.Millisecond).String()`，
// 只写字符串 ⇒ 时间信息在格式化那一刻就丢了。
//
// ★ 为什么不能直接 Round 到 0（TASK-OBS-003 / V5c 实测根因）：
//
//	`audit/query.go` 规定 `latency_ms = 0` 的语义是【没有测量到】——聚合统计一律用
//	`latency_ms > 0` 排除零。而 `Round(time.Millisecond)` 会把 <0.5ms 的【已测到】耗时
//	抹成 0 ⇒ 与"没测到"混为一谈。
//	本地实测（scripts/stub-upstream.py，20 次采样）：往返中位数 0.351ms，17/20 低于 0.5ms
//	⇒ 经本地桩的调用**必然**被抹成 0，异步任务因此恒被排除在耗时分布之外（V5c）。
//	处置：耗时为正值但不足 1ms 时向上取整到 1ms —— 保住"测到了"这一事实，
//	且不误导为"瞬时完成"（1ms 已是本字段的表示精度下限）。
func (r RunResult) withElapsed(start time.Time) RunResult {
	elapsed := time.Since(start)
	d := elapsed.Round(time.Millisecond)
	if d == 0 && elapsed > 0 {
		d = time.Millisecond
	}
	r.Duration = d.String()
	r.ElapsedMs = int(d.Milliseconds())
	return r
}

var (
	ErrNoCredentials    = errors.New("engine: channel credentials not configured")
	ErrAsyncUnsupported = errors.New("engine: async-task protocol not supported in sync test; polling state machine pending")
	ErrBadResponse      = errors.New("engine: response extraction failed")
)

// Run assembles the request per source classification and performs the call.
//
// Deprecated: 新代码请经统一 Executor 接口调用（NewExecutor + Submit），
// 以便同一入口支持 ComfyUI 等其它后端。保留此函数以兼容现有调用方。
func Run(ctx context.Context, creds Credentials, req RunRequest, client *http.Client) (RunResult, error) {
	start := time.Now()
	fail := func(err error) (RunResult, error) {
		return RunResult{Status: 0, Error: err.Error()}.withElapsed(start), err
	}
	// Async protocols need submit->poll; the sync path refuses them loudly.
	var async struct {
		Enabled     bool   `json:"enabled"`
		TaskIDField string `json:"taskIdField"`
		StatusField string `json:"statusField"`
		DoneValue   string `json:"doneValue"`
		FailValue   string `json:"failValue"`
		PollPath    string `json:"pollPath"`
	}
	if len(req.ProtocolTemplate.Async) > 0 && json.Unmarshal(req.ProtocolTemplate.Async, &async) == nil && async.Enabled {
		return fail(fmt.Errorf("%w: template=%q", ErrAsyncUnsupported, req.ProtocolTemplate.Label))
	}
	if creds.BaseURL == "" {
		return fail(fmt.Errorf("%w: channel=%q", ErrNoCredentials, req.ChannelID))
	}
	if req.ProviderModel == "" {
		return fail(errors.New("engine: providerModel is required for model injection"))
	}
	method := strings.ToUpper(strings.TrimSpace(req.ProtocolTemplate.Method))
	if method == "" {
		method = http.MethodPost
	}
	url := buildURL(creds, req)

	// Body assembly is shared with the async path (assembleBody) so the two can never
	// drift. task_type is injected *before* __passthrough (pre-refactor order): a dynamic
	// passthrough entry may still override it.
	taskType := ""
	if len(req.ProtocolTemplate.Async) > 0 {
		taskType = "sync"
	}
	raw, err := assembleBody(req, taskType)
	if err != nil {
		return fail(err)
	}

	hreq, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(raw))
	if err != nil {
		return fail(fmt.Errorf("engine: request build: %w", err))
	}
	hreq.Header.Set("Content-Type", "application/json")
	applyAuth(hreq, creds)
	resp, err := client.Do(hreq)
	if err != nil {
		return fail(fmt.Errorf("engine: request failed: %w", err))
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))

	out := RunResult{Status: resp.StatusCode}.withElapsed(start)
	out.RawBody = string(respBody)
	if resp.StatusCode >= 400 {
		out.Error = fmt.Sprintf("upstream %d: %s", resp.StatusCode, truncate(string(respBody), 300))
		return out, fmt.Errorf("%s", out.Error)
	}
	var doc any
	if err := json.Unmarshal(respBody, &doc); err != nil {
		out.Error = "upstream returned non-JSON: " + truncate(string(respBody), 200)
		return out, fmt.Errorf("%w: %s", ErrBadResponse, out.Error)
	}
	out.Extracted = map[string]any{}
	for _, p := range req.ProtocolTemplate.ResponseParams {
		if p.Key == "" {
			continue
		}
		if v, ok := extractPath(doc, p.Key); ok {
			// 思考型模型容错：目标 key 命中 null 或空字符串时，回退同结构的 reasoning_content
			// （如 choices.0.message.content 为 null 但 reasoning_content 非空 —— deepseek 推理输出）
			if v == nil {
				if rv, rok := extractPath(doc, replaceLastPathSeg(p.Key, "reasoning_content")); rok {
					if rs, rstr := rv.(string); rstr && rs != "" {
						out.Extracted[p.Key] = rs
						continue
					}
				}
			} else if s, isStr := v.(string); isStr && s == "" {
				if rv, rok := extractPath(doc, replaceLastPathSeg(p.Key, "reasoning_content")); rok {
					if rs, rstr := rv.(string); rstr && rs != "" {
						out.Extracted[p.Key] = rs
						continue
					}
				}
			}
			out.Extracted[p.Key] = v
		}
	}
	return out, nil
}

// replaceLastPathSeg swaps the trailing path segment (e.g. content -> reasoning_content)
// while keeping array indexes intact (choices.0.message.content -> choices.0.message.reasoning_content).

// parseJSONValue coerces a template default string into a JSON value:
// numbers / booleans / arrays / objects stay typed, everything else is a string.

// a quoted string stays a string; bare words are treated as strings below

// extractPath walks a dotted path with array indexes: choices.0.message.content,
// data.0.url, usage.total_tokens.

// RunAsync executes an async-task protocol: submit -> poll -> result.
// It blocks until the task completes, fails, or the context times out.
//
// Deprecated: 新代码请经统一 Executor 接口调用（NewExecutor + Submit，Async=true），
// 以便同一入口支持 ComfyUI 等其它后端。保留此函数以兼容现有调用方。
func RunAsync(ctx context.Context, creds Credentials, req RunRequest, client *http.Client) (RunResult, error) {
	start := time.Now()
	fail := func(err error) (RunResult, error) {
		return RunResult{Status: 0, Error: err.Error()}.withElapsed(start), err
	}

	// Parse async config
	var async struct {
		Enabled     bool   `json:"enabled"`
		TaskIDField string `json:"taskIdField"`
		StatusField string `json:"statusField"`
		DoneValue   string `json:"doneValue"`
		FailValue   string `json:"failValue"`
		PollPath    string `json:"pollPath"`
	}
	if len(req.ProtocolTemplate.Async) > 0 {
		if err := json.Unmarshal(req.ProtocolTemplate.Async, &async); err != nil {
			return fail(fmt.Errorf("engine: invalid async config: %w", err))
		}
	}
	if !async.Enabled {
		return fail(errors.New("engine: async mode not enabled in template"))
	}
	// Apply sensible defaults for common OpenAI-compatible async APIs
	if async.TaskIDField == "" {
		async.TaskIDField = "task_id"
	}
	if async.StatusField == "" {
		async.StatusField = "status"
	}
	if async.DoneValue == "" {
		async.DoneValue = "SUCCESS"
	}
	if async.FailValue == "" {
		async.FailValue = "FAILED"
	}
	if async.PollPath == "" {
		async.PollPath = "/v1/images/tasks/{task_id}"
	}

	if creds.BaseURL == "" {
		return fail(fmt.Errorf("%w: channel=%q", ErrNoCredentials, req.ChannelID))
	}
	if req.ProviderModel == "" {
		return fail(errors.New("engine: providerModel is required for model injection"))
	}

	// === Step 1: Submit request ===
	submitURL, submitBody, err := buildRequest(creds, req)
	if err != nil {
		return fail(err)
	}
	// Inject task_type=async for async protocols (OpenAI-compatible Images API)
	var submitDoc map[string]any
	if err := json.Unmarshal(submitBody, &submitDoc); err == nil {
		submitDoc["task_type"] = "async"
		submitBody, _ = json.Marshal(submitDoc)
		log.Printf("engine RunAsync: injected task_type=async, body=%s", truncate(string(submitBody), 200))
	} else {
		log.Printf("engine RunAsync: failed to unmarshal submitBody: %v, body=%s", err, truncate(string(submitBody), 200))
	}
	hreq, err := http.NewRequestWithContext(ctx, strings.ToUpper(req.ProtocolTemplate.Method), submitURL, bytes.NewReader(submitBody))
	if err != nil {
		return fail(fmt.Errorf("engine: submit request build: %w", err))
	}
	hreq.Header.Set("Content-Type", "application/json")
	applyAuth(hreq, creds)
	submitResp, err := client.Do(hreq)
	if err != nil {
		return fail(fmt.Errorf("engine: submit request failed: %w", err))
	}
	defer submitResp.Body.Close()
	submitBodyBytes, _ := io.ReadAll(io.LimitReader(submitResp.Body, 4*1024*1024))
	if submitResp.StatusCode >= 400 {
		return fail(fmt.Errorf("engine: submit upstream %d: %s", submitResp.StatusCode, truncate(string(submitBodyBytes), 300)))
	}
	var submitRespDoc any
	if err := json.Unmarshal(submitBodyBytes, &submitRespDoc); err != nil {
		return fail(fmt.Errorf("engine: submit response non-JSON: %s", truncate(string(submitBodyBytes), 200)))
	}
	taskIDRaw, ok := extractPath(submitRespDoc, async.TaskIDField)
	if !ok {
		return fail(fmt.Errorf("engine: submit response missing task id field %q", async.TaskIDField))
	}
	taskID, ok := taskIDRaw.(string)
	if !ok {
		return fail(fmt.Errorf("engine: task id is not a string: %v", taskIDRaw))
	}

	// === Step 2: Poll until done ===
	pollInterval := 3 * time.Second
	maxPolls := 120 // 6 minutes max
	pollURL := strings.TrimRight(creds.BaseURL, "/") + strings.ReplaceAll(async.PollPath, "{task_id}", taskID)

	var finalDoc any
	for i := 0; i < maxPolls; i++ {
		select {
		case <-ctx.Done():
			return fail(fmt.Errorf("engine: polling cancelled: %w", ctx.Err()))
		case <-time.After(pollInterval):
		}

		pollReq, err := http.NewRequestWithContext(ctx, http.MethodGet, pollURL, nil)
		if err != nil {
			return fail(fmt.Errorf("engine: poll request build: %w", err))
		}
		applyAuth(pollReq, creds)
		pollResp, err := client.Do(pollReq)
		if err != nil {
			// Transient poll error, retry
			continue
		}
		pollBodyBytes, _ := io.ReadAll(io.LimitReader(pollResp.Body, 4*1024*1024))
		// 读完即可关闭；Close 的错误对后续判定没有意义（gosec G104：显式丢弃）
		_ = pollResp.Body.Close()
		if pollResp.StatusCode >= 400 {
			continue
		}
		var pollDoc any
		if err := json.Unmarshal(pollBodyBytes, &pollDoc); err != nil {
			continue
		}
		statusRaw, ok := extractPath(pollDoc, async.StatusField)
		if !ok {
			continue
		}
		status, _ := statusRaw.(string)
		// 终态匹配走 matchesTerminalValue：声明值支持逗号分隔候选 + 大小写不敏感。
		// 精确比较会让状态字面量的任何差异（大小写、同义拼写）被当成「未完成」，
		// 于是成功与失败都空转到 6 分钟超时（超时与失败在语义及重试策略上不同，
		// 误判会让阶段 1 的重试机制失效）。
		if matchesTerminalValue(status, async.DoneValue) {
			finalDoc = pollDoc
			break
		}
		if matchesTerminalValue(status, async.FailValue) {
			return fail(fmt.Errorf("engine: async task failed: %s", truncate(string(pollBodyBytes), 300)))
		}
	}
	if finalDoc == nil {
		return fail(errors.New("engine: async task timed out after max polls"))
	}

	// === Step 3: Extract result from final response ===
	out := RunResult{Status: 200}.withElapsed(start)
	out.Extracted = map[string]any{}
	out.ProviderTaskID = taskID
	log.Printf("engine RunAsync: responseParams count=%d, params=%v", len(req.ProtocolTemplate.ResponseParams), req.ProtocolTemplate.ResponseParams)
	for _, p := range req.ProtocolTemplate.ResponseParams {
		if p.Key == "" {
			continue
		}
		if v, ok := extractPath(finalDoc, p.Key); ok {
			out.Extracted[p.Key] = v
			log.Printf("engine RunAsync: extracted %s = %v", p.Key, v)
		} else {
			log.Printf("engine RunAsync: failed to extract %s", p.Key)
		}
	}
	log.Printf("engine RunAsync: final extracted = %v", out.Extracted)
	return out, nil
}

type resolvedParam struct {
	Key   string
	Value any
	// Present 表示该字段在 params[] 形态下会被写入请求体。为 false 时模板形态也不把
	// 它放进取值表 —— 占位符取值缺失会**响亮报错**，而不是插入空串（见 RenderRequestTemplate）。
	Present bool
}
