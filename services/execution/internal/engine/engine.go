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
	"net/http"
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
}

// Credentials are the decrypted tenant channel material, only ever materialized
// inside this process boundary; never returned to callers.
type Credentials struct {
	BaseURL  string
	AuthType string
	APIKey   string
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
	Error     string         `json:"error,omitempty"`
	// ProviderTaskID 是异步协议在提交响应中返回的任务 ID（同步协议为空）。
	// 提交响应与最终轮询响应是两个不同的文档，任务 ID 只在提交响应中出现，
	// 故单独透出供统一 Executor 层与审计追溯使用。
	ProviderTaskID string `json:"providerTaskId,omitempty"`
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
		return RunResult{Status: 0, Duration: time.Since(start).Round(time.Millisecond).String(), Error: err.Error()}, err
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

	// Merge params: template defaults, then model-level overrides by key.
	byKey := map[string]Param{}
	for _, p := range req.ProtocolTemplate.Params {
		byKey[p.Key] = p
	}
	for _, p := range req.ModelParams {
		if p.Key != "" {
			byKey[p.Key] = p // model wins (value + role stay as given)
		}
	}
	// Assemble body entries in template order.
	body := map[string]any{}
	order := []string{}
	for _, p := range req.ProtocolTemplate.Params {
		spec, ok := byKey[p.Key]
		if !ok {
			continue
		}
		if p.Key == "" {
			continue
		}
		order = append(order, p.Key)
		switch spec.Role {
		case "model":
			body[p.Key] = req.ProviderModel
		case "runtime":
			if v, has := req.Runtime[p.Key]; has {
				body[p.Key] = v
			}
			// absent runtime field -> omit (executor did not produce it)
		default: // static
			if v, has := req.Runtime["__"+p.Key]; has {
				body[p.Key] = v
				continue
			}
			val := strings.TrimSpace(spec.Value)
			if val == "" {
				continue // empty default, nothing to send
			}
			body[p.Key] = parseJSONValue(val)
		}
	}
	// Inject task_type=sync for protocols that support async mode (OpenAI-compatible Images API)
	if len(req.ProtocolTemplate.Async) > 0 {
		body["task_type"] = "sync"
	}
	// Dynamic passthrough: runtime["__passthrough"] map entries are injected directly
	// into the request body, enabling model-specific params not declared in the template
	// (e.g. image_url, mode, strength for image-to-image).
	if pt, ok := req.Runtime["__passthrough"].(map[string]any); ok {
		for k, v := range pt {
			if k != "" && v != nil {
				body[k] = v
			}
		}
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return fail(fmt.Errorf("engine: body marshal: %w", err))
	}

	hreq, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(raw))
	if err != nil {
		return fail(fmt.Errorf("engine: request build: %w", err))
	}
	hreq.Header.Set("Content-Type", "application/json")
	switch creds.AuthType {
	case "none", "":
		// local / no-auth channels carry no Authorization header
	default:
		hreq.Header.Set("Authorization", "Bearer "+creds.APIKey)
	}
	resp, err := client.Do(hreq)
	if err != nil {
		return fail(fmt.Errorf("engine: request failed: %w", err))
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))

	out := RunResult{Status: resp.StatusCode, Duration: time.Since(start).Round(time.Millisecond).String()}
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
		return RunResult{Status: 0, Duration: time.Since(start).Round(time.Millisecond).String(), Error: err.Error()}, err
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
	if creds.AuthType != "none" && creds.AuthType != "" {
		hreq.Header.Set("Authorization", "Bearer "+creds.APIKey)
	}
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
		if creds.AuthType != "none" && creds.AuthType != "" {
			pollReq.Header.Set("Authorization", "Bearer "+creds.APIKey)
		}
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
		if status == async.DoneValue {
			finalDoc = pollDoc
			break
		}
		if status == async.FailValue {
			return fail(fmt.Errorf("engine: async task failed: %s", truncate(string(pollBodyBytes), 300)))
		}
	}
	if finalDoc == nil {
		return fail(errors.New("engine: async task timed out after max polls"))
	}

	// === Step 3: Extract result from final response ===
	out := RunResult{Status: 200, Duration: time.Since(start).Round(time.Millisecond).String()}
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

// buildRequest assembles the URL and request body for a model call.
func buildRequest(creds Credentials, req RunRequest) (string, []byte, error) {
	method := strings.ToUpper(strings.TrimSpace(req.ProtocolTemplate.Method))
	if method == "" {
		method = http.MethodPost
	}
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

	byKey := map[string]Param{}
	for _, p := range req.ProtocolTemplate.Params {
		byKey[p.Key] = p
	}
	for _, p := range req.ModelParams {
		if p.Key != "" {
			byKey[p.Key] = p
		}
	}
	body := map[string]any{}
	for _, p := range req.ProtocolTemplate.Params {
		spec, ok := byKey[p.Key]
		if !ok || p.Key == "" {
			continue
		}
		switch spec.Role {
		case "model":
			body[p.Key] = req.ProviderModel
		case "runtime":
			if v, has := req.Runtime[p.Key]; has {
				body[p.Key] = v
			}
		default:
			if v, has := req.Runtime["__"+p.Key]; has {
				body[p.Key] = v
				continue
			}
			val := strings.TrimSpace(spec.Value)
			if val == "" {
				continue
			}
			body[p.Key] = parseJSONValue(val)
		}
	}
	// Dynamic passthrough: runtime["__passthrough"] map entries are injected directly
	// into the request body, enabling model-specific params not declared in the template.
	if pt, ok := req.Runtime["__passthrough"].(map[string]any); ok {
		for k, v := range pt {
			if k != "" && v != nil {
				body[k] = v
			}
		}
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return "", nil, fmt.Errorf("engine: body marshal: %w", err)
	}
	return url, raw, nil
}
