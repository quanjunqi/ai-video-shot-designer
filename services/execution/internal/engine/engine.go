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
package engine

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
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
func (r RunResult) withElapsed(start time.Time) RunResult {
	d := time.Since(start).Round(time.Millisecond)
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
func replaceLastPathSeg(path, seg string) string {
	parts := strings.Split(path, ".")
	if len(parts) == 0 {
		return seg
	}
	parts[len(parts)-1] = seg
	return strings.Join(parts, ".")
}

// parseJSONValue coerces a template default string into a JSON value:
// numbers / booleans / arrays / objects stay typed, everything else is a string.
func parseJSONValue(v string) any {
	var probe any
	if json.Unmarshal([]byte(v), &probe) == nil {
		switch probe.(type) {
		case string:
			// a quoted string stays a string; bare words are treated as strings below
			return probe
		case float64, bool, []any, map[string]any:
			return probe
		}
	}
	return v
}

// extractPath walks a dotted path with array indexes: choices.0.message.content,
// data.0.url, usage.total_tokens.
func extractPath(doc any, path string) (any, bool) {
	cur := doc
	for _, seg := range strings.Split(path, ".") {
		if cur == nil {
			return nil, false
		}
		switch node := cur.(type) {
		case map[string]any:
			v, ok := node[seg]
			if !ok {
				return nil, false
			}
			cur = v
		case []any:
			idx, err := strconv.Atoi(seg)
			if err != nil || idx < 0 || idx >= len(node) {
				return nil, false
			}
			cur = node[idx]
		default:
			return nil, false
		}
	}
	return cur, true
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

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
		pollResp.Body.Close()
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

// buildRequest assembles the URL and request body for a model call (async submit path).
func buildRequest(creds Credentials, req RunRequest) (string, []byte, error) {
	url := buildURL(creds, req)
	raw, err := assembleBody(req, "")
	if err != nil {
		return "", nil, err
	}
	return url, raw, nil
}

// buildURL 组装 endpoint（渠道 base_url + 模型级/模板级路径），同步与异步路径共用。
// 逐字等价于重构前两处各自内联的实现（base 去尾斜杠；path 为空则用模板 request_path；
// 以 "/" 开头直接拼接，否则补一个 "/"）。
func buildURL(creds Credentials, req RunRequest) string {
	base := strings.TrimRight(creds.BaseURL, "/")
	path := strings.TrimSpace(req.ModelRequestPath)
	if path == "" {
		path = strings.TrimSpace(req.ProtocolTemplate.RequestPath)
	}
	url := base
	if path != "" {
		if strings.HasPrefix(path, "/") {
			url += path
		} else {
			url += "/" + path
		}
	}
	return url
}

// assembleBody 是**唯一的请求体装配点**，同步（Run）与异步（RunAsync → buildRequest）
// 两条路径都调用它，避免同一段装配逻辑在两处各自演化（ADR-007 D3 的硬要求）。
//
// 两种形态并存（迁移 028）：
//
//   - RequestTemplate 为空 → params[] 组装（assembleParamsBody），**逐字保持改动前行为**；
//   - RequestTemplate 非空 → 渲染模板作为请求体（RenderRequestTemplate）。
//
// 动态注入（task_type / runtime["__passthrough"]）对两种形态一视同仁，因此把某个定义切到
// 模板形态不会**悄悄丢掉**参数映射引擎产生的动态参数（网关层把映射结果放进 __passthrough）。
// taskType 非空时先于 __passthrough 写入：passthrough 仍可覆盖它（与改动前顺序一致）。
//
// 模板形态下的两条路径：
//   - 无需动态注入 → 渲染文本**逐字**作为请求体（multipart / 非 JSON 形态因此可用）；
//   - 需要动态注入 → 渲染结果必须是 JSON 对象，注入后重新序列化；否则返回明确错误，
//     而不是发出一个静默残缺的请求体。
//
// 返回值已序列化（json.Marshal 或模板原文），因为异步路径需要在字节层面再注入
// task_type=async（既有行为，未改动）。
func assembleBody(req RunRequest, taskType string) ([]byte, error) {
	if strings.TrimSpace(req.ProtocolTemplate.RequestTemplate) == "" {
		body := assembleParamsBody(req)
		injectDynamic(body, taskType, req)
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("engine: body marshal: %w", err)
		}
		logOutboundBody(req, raw)
		return raw, nil
	}

	rendered, err := RenderRequestTemplate(req.ProtocolTemplate.RequestTemplate, resolveTemplateValues(req))
	if err != nil {
		return nil, fmt.Errorf("engine: request template %q: %w", req.ProtocolTemplate.ID, err)
	}
	if taskType == "" && !hasPassthrough(req) {
		raw := []byte(rendered)
		logOutboundBody(req, raw)
		return raw, nil
	}
	var body map[string]any
	if err := json.Unmarshal([]byte(rendered), &body); err != nil {
		return nil, fmt.Errorf("engine: request template %q must render a JSON object to apply task_type/__passthrough: %w", req.ProtocolTemplate.ID, err)
	}
	injectDynamic(body, taskType, req)
	raw, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("engine: body marshal: %w", err)
	}
	logOutboundBody(req, raw)
	return raw, nil
}

// logOutboundBody 按需记录**实际发往上游的请求体**。
//
// 为什么需要：上游报「请求参数有误 / 类型不符」这类问题时，唯一可靠的判据是**实际发出的字节** ——
// 审计里的 request_payload 记的是业务入参，两者不是一回事（T7 就因此绕过一次弯路）。
//
// 为什么默认关闭：请求体可能含提示词与业务文本 ⇒ 只在显式开启时记录。
func logOutboundBody(req RunRequest, raw []byte) {
	if os.Getenv("EXECUTION_LOG_REQUEST_BODY") != "1" {
		return
	}
	slog.Info("engine outbound body",
		"template", req.ProtocolTemplate.ID,
		"model", req.ProviderModel,
		"path", req.ProtocolTemplate.RequestPath,
		"bytes", len(raw),
		"body", string(raw))
}

// resolvedParam 是一条已声明参数按 role 解析后的取值。
type resolvedParam struct {
	Key   string
	Value any
	// Present 表示该字段在 params[] 形态下会被写入请求体。为 false 时模板形态也不把
	// 它放进取值表 —— 占位符取值缺失会**响亮报错**，而不是插入空串（见 RenderRequestTemplate）。
	Present bool
}

// resolveParams 是 params[]「三分类」取值的**唯一实现**，params[] 组装与模板取值表共用，
// 避免两套 role 语义各自演化：
//
//	static  → runtime["__key"] 覆盖值优先；否则 parseJSONValue(默认值)；空默认值 = 不发送
//	model   → 执行器注入的 providerModel
//	runtime → 业务输入 runtime[key]；缺省 = 不发送（执行器没产出该字段）
//
// 模型级 params 只覆盖模板里已声明的 key（不新增字段），与改动前一致；顺序沿用模板声明顺序。
func resolveParams(req RunRequest) []resolvedParam {
	byKey := map[string]Param{}
	for _, p := range req.ProtocolTemplate.Params {
		byKey[p.Key] = p
	}
	for _, p := range req.ModelParams {
		if p.Key != "" {
			byKey[p.Key] = p // model wins (value + role stay as given)
		}
	}
	out := make([]resolvedParam, 0, len(req.ProtocolTemplate.Params))
	for _, p := range req.ProtocolTemplate.Params {
		spec, ok := byKey[p.Key]
		if !ok || p.Key == "" {
			continue
		}
		switch spec.Role {
		case "model":
			out = append(out, resolvedParam{Key: p.Key, Value: req.ProviderModel, Present: true})
		case "runtime":
			if v, has := req.Runtime[p.Key]; has {
				out = append(out, resolvedParam{Key: p.Key, Value: coerceByType(v, spec.Type), Present: true})
			}
			// absent runtime field -> omit (executor did not produce it)
		default: // static
			if v, has := req.Runtime["__"+p.Key]; has {
				out = append(out, resolvedParam{Key: p.Key, Value: coerceByType(v, spec.Type), Present: true})
				continue
			}
			if val := strings.TrimSpace(spec.Value); val != "" {
				out = append(out, resolvedParam{Key: p.Key, Value: parseJSONValue(val), Present: true})
			}
		}
	}
	return out
}

// coerceByType 按协议模板声明的 type，把业务值规范成**正确的 JSON 类型**。
//
// 为什么必须有这一步（T7 真机事故）：界面表单天然产出字符串（`Record<string, string>`），
// 而严格的上游按 JSON 类型校验 —— 实测某中转站对 `"max_tokens":"32"` / `"temperature":"0.7"` /
// `"stream":"false"` 一律返回 `503 请求参数有误`，而数字/布尔形式返回 200。
// 此前只有 static 默认值走了 parseJSONValue 转换，**业务覆盖值（runtime 与 __ 覆盖）被原样透传**。
//
// 边界（刻意保守，不猜）：
//   - 值已经是 JSON 类型（数字/布尔/数组/对象）⇒ 原样返回；
//   - 未声明 type，或声明为 string ⇒ 原样返回（**不**做"看起来像数字就转"的推断：
//     那会把 "007"、"+86" 这类字符串静默改写）；
//   - 声明了 type 但解析失败 ⇒ 原样返回，让上游如实报错，而不是悄悄换成一个"能过"的值。
func coerceByType(v any, typ string) any {
	s, ok := v.(string)
	if !ok {
		return v
	}
	switch strings.ToLower(strings.TrimSpace(typ)) {
	case "number":
		if f, err := strconv.ParseFloat(strings.TrimSpace(s), 64); err == nil {
			return f
		}
	case "bool", "boolean":
		if b, err := strconv.ParseBool(strings.TrimSpace(s)); err == nil {
			return b
		}
	case "array", "object":
		var probe any
		if json.Unmarshal([]byte(s), &probe) == nil {
			switch probe.(type) {
			case []any, map[string]any:
				return probe
			}
		}
	}
	return v
}

// assembleParamsBody 是 params[] 形态的请求体（改动前 Run / buildRequest 里逐字相同的两段）。
func assembleParamsBody(req RunRequest) map[string]any {
	body := map[string]any{}
	for _, p := range resolveParams(req) {
		if p.Present {
			body[p.Key] = p.Value
		}
	}
	return body
}

// resolveTemplateValues 构造模板形态的 {{占位符}} 取值表。
//
// 取值来源（后者覆盖前者）：
//  1. params[]（模板声明 + 模型级覆盖）按 role 解析——与 params[] 形态共用 resolveParams，
//     因此两种形态的取值语义不会漂移；
//  2. runtime 里所有业务字段（去掉内部 `__` 前缀键，如 __passthrough / __request_path），
//     **不覆盖**第 1 步按 role 解析出的 key（与 params[] 形态的覆盖规则一致）；
//  3. runtime["__<key>"] 对已声明 params 的静态覆盖（已含在第 1 步）；
//  4. runtime["__passthrough"] 的动态参数（参数映射引擎的产物）。
//
// 「不进取值表」是刻意的：占位符取值缺失时 RenderRequestTemplate 报错，而不是插入空串。
func resolveTemplateValues(req RunRequest) map[string]any {
	values := map[string]any{}
	for _, p := range resolveParams(req) {
		if p.Present {
			values[p.Key] = p.Value
		}
	}

	// 业务输入里的其它字段：模板可以引用未在 params 里声明的 key（模板形态的自有取值面）。
	for k, v := range req.Runtime {
		if k == "" || strings.HasPrefix(k, "__") {
			continue
		}
		if _, declared := values[k]; declared {
			continue
		}
		values[k] = v
	}
	// 动态参数映射的产物同样可作为占位符取值。
	if pt, ok := req.Runtime["__passthrough"].(map[string]any); ok {
		for k, v := range pt {
			if k != "" && v != nil {
				values[k] = v
			}
		}
	}
	return values
}

// injectDynamic 把执行器层面的动态字段写入 body：
// task_type（同步/异步协议标记）与 runtime["__passthrough"]。
// 两者对 params[] 形态与模板形态完全一致，规则与改动前相同：跳过空 key 与 nil 值。
func injectDynamic(body map[string]any, taskType string, req RunRequest) {
	if taskType != "" {
		body["task_type"] = taskType
	}
	pt, ok := req.Runtime["__passthrough"].(map[string]any)
	if !ok {
		return
	}
	// ★ 动态参数同样要按模板声明的 type 规范化：参数映射引擎的产物来自用户输入，
	//   天然是字符串（`Record<string, string>`），而严格上游按 JSON 类型校验。
	//   T7 真机事故：`max_tokens` 走的就是这条路 —— 它**在组装之后覆盖** body，
	//   因此绕过了 resolveParams 里的转换（我第一版修复只改了 resolveParams，真机仍然 503）。
	types := declaredTypes(req.ProtocolTemplate.Params, req.ModelParams)
	for k, v := range pt {
		if k != "" && v != nil {
			body[k] = coerceByType(v, types[k])
		}
	}
}

// declaredTypes 汇总「参数名 → 声明类型」（模型级声明优先），只保留非空 type。
func declaredTypes(tpl []Param, model []Param) map[string]string {
	out := make(map[string]string, len(tpl)+len(model))
	for _, p := range tpl {
		if p.Key != "" && p.Type != "" {
			out[p.Key] = p.Type
		}
	}
	for _, p := range model {
		if p.Key != "" && p.Type != "" {
			out[p.Key] = p.Type
		}
	}
	return out
}

// hasPassthrough 报告本次调用是否存在会被注入的动态参数（与 injectDynamic 的过滤规则一致）。
func hasPassthrough(req RunRequest) bool {
	pt, ok := req.Runtime["__passthrough"].(map[string]any)
	if !ok {
		return false
	}
	for k, v := range pt {
		if k != "" && v != nil {
			return true
		}
	}
	return false
}

// applyAuth writes the channel's auth header onto req.
//
// Data-driven path (ADR-007 D2): a non-empty AuthHeader wins outright and the
// value is AuthPrefix + APIKey. AuthPrefix may be empty on purpose — that is the
// "bare token" shape (Authorization: <key>), e.g. AutoDL's ComfyUI API.
//
// Fallback path (must stay byte-for-byte identical to the pre-ADR-007 behavior,
// because no stored row is backfilled):
//
//	none / ""          → no header at all (local or unauthenticated channels)
//	bearer/apikey/sign → Authorization: "Bearer " + key
//	token              → Authorization: key (no prefix)
//	anything else      → Bearer (the historical default must not shift)
//
// 既有渠道的行为不得改变：新增 AuthHeader/AuthPrefix 之前，所有调用点都只会
// 走 fallback 分支，而这些分支的输出与改动前逐字一致。
func applyAuth(req *http.Request, creds Credentials) {
	if creds.AuthHeader != "" {
		req.Header.Set(creds.AuthHeader, creds.AuthPrefix+creds.APIKey)
		return
	}
	switch creds.AuthType {
	case "none", "":
		return
	case "token":
		req.Header.Set("Authorization", creds.APIKey)
	default:
		req.Header.Set("Authorization", "Bearer "+creds.APIKey)
	}
}
