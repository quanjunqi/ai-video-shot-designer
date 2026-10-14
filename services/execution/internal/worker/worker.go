// Package worker 承载 execution 的异步任务执行面：worker 主循环、任务执行、
// 审计终态写回、重试/死信策略与审计保留期清理。
//
// 高内聚：worker 的全部业务收敛在本包；cmd/server 只做装配
// （BE-LAYER-002：cmd 只装配，不含业务）。
package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/rand"
	"net/http"
	"sync"
	"time"

	"shotdesigner/services/execution/internal/audit"
	"shotdesigner/services/execution/internal/catalog"
	"shotdesigner/services/execution/internal/creds"
	"shotdesigner/services/execution/internal/engine"
	"shotdesigner/services/execution/internal/job"
	"shotdesigner/shared/observability"
)

// Logger 是 worker/审计链路的统一结构化日志器（W5：可观测性深化）。
// 包级初始化（LOG_LEVEL 环境变量在进程早期已就绪）；cmd 装配时复用同一实例。
var Logger = observability.NewJSONLogger("execution")

// jobPayload is the structured payload stored in job.intent_payload for model execution jobs.
type jobPayload struct {
	ModelID string                 `json:"modelId"`
	Runtime map[string]interface{} `json:"runtime"`
	Result  map[string]interface{} `json:"result"`
}

// wsOf 取 job 的工作区：Phase C 之前 worker 拿不到它，只能硬编码/用哨兵值。
// 兼容历史行（没有 workspace_id）时仍退回哨兵值，但**日志里可见**（不静默）。
func wsOf(j job.Job) string {
	if j.WorkspaceID == "" {
		return audit.SystemWorkspace
	}
	return j.WorkspaceID
}

// Run 是 worker 主循环：轮询队列 → 翻转 queued→running → 执行 → 审计终态。
// 由 cmd 以 goroutine 启动（并发闸门与容量由调用方装配）。
func Run(s job.Store, cat *catalog.Client, cred *creds.Client, client *http.Client, gate *job.Semaphore, as *audit.Store) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	// Track jobs currently being executed to avoid duplicate dispatch
	var executing sync.Map
	for range ticker.C {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		// Step 1: flip queued -> running
		if err := s.Advance(ctx, 10); err != nil {
			Logger.Warn("execution worker advance failed", slog.Any("err", err))
		}
		cancel()

		// Step 2: execute running jobs
		listCtx, listCancel := context.WithTimeout(context.Background(), 10*time.Second)
		jobs, err := s.ListRunning(listCtx, 10)
		listCancel()
		if err != nil {
			Logger.Warn("execution worker list running failed", slog.Any("err", err))
			continue
		}
		for _, j := range jobs {
			// Skip if already executing (prevents duplicate dispatch on each poll)
			if _, loaded := executing.LoadOrStore(j.ID, true); loaded {
				Logger.Info("job already executing, skipping", "job_id", j.ID)
				continue
			}
			// 闸门已满则本轮不派发：任务保持 running，下一轮 ticker 会再次列出
			// （因此必须先撤销 executing 标记，否则它会被永久视为「已在执行」）
			if !gate.TryAcquire() {
				executing.Delete(j.ID)
				Logger.Info("并发已达上限，本轮不派发", "cap", gate.Cap(), "job_id", j.ID)
				continue
			}
			Logger.Info("starting job", "job_id", j.ID)
			// Each job gets its own context with 10 min timeout
			jobCtx, jobCancel := context.WithTimeout(context.Background(), 10*time.Minute)
			go func(job job.Job, ctx context.Context, cancel context.CancelFunc) {
				defer cancel()
				defer gate.Release()
				defer executing.Delete(job.ID)
				Logger.Info("goroutine finished", "job_id", job.ID)
				executeJob(ctx, s, cat, cred, client, job, as)
			}(j, jobCtx, jobCancel)
		}
	}
}

// executeJob runs a single job through the engine and updates its status.
func executeJob(ctx context.Context, s job.Store, cat *catalog.Client, cred *creds.Client, client *http.Client, j job.Job, as *audit.Store) {
	defer func() {
		if r := recover(); r != nil {
			Logger.Info("execution worker: panic in job %s: %v", j.ID, r)
			auditTerminal(ctx, as, j, false, fmt.Sprintf("internal panic: %v", r), nil)
			_ = s.Complete(ctx, j.ID, false, nil, fmt.Sprintf("internal panic: %v", r))
		}
	}()

	if cat == nil || cred == nil {
		auditTerminal(ctx, as, j, false, "execution engine not configured", nil)
		_ = s.Complete(ctx, j.ID, false, nil, "execution engine not configured")
		return
	}

	// Parse payload
	var payload jobPayload
	if len(j.IntentPayload) > 0 && string(j.IntentPayload) != "null" {
		if err := json.Unmarshal(j.IntentPayload, &payload); err != nil {
			auditTerminal(ctx, as, j, false, "invalid job payload: "+err.Error(), nil)
			_ = s.Complete(ctx, j.ID, false, nil, "invalid job payload: "+err.Error())
			return
		}
	}
	if payload.ModelID == "" {
		auditTerminal(ctx, as, j, false, "missing modelId in payload", nil)
		_ = s.Complete(ctx, j.ID, false, nil, "missing modelId in payload")
		return
	}

	// Get model directory (use job workspace rather than a hardcoded dev workspace)
	// Phase C：用 job 自己的工作区（而不是硬编码）—— 多租户下否则会把 A 的 job
	// 拿去 B 的目录上解析、并用 B 的凭据去上游调用。
	jobWorkspace := j.WorkspaceID
	if jobWorkspace == "" {
		// 兼容历史行（000/早期 job 没写 workspace_id）：退回审计哨兵值，并在日志里显式可见
		Logger.Info("execution worker: job %s 没有 workspace_id（历史行），退回 %q", j.ID, audit.SystemWorkspace)
		jobWorkspace = audit.SystemWorkspace
	}
	dir, err := cat.Get(ctx, jobWorkspace, "user_dev")
	if err != nil {
		// catalog 未命中：channel/provider 未知，传空（空串不覆盖，T1）
		failOrRetry(ctx, s, j, "catalog unavailable: "+err.Error(), as, "", "")
		return
	}
	// ADR-003 的候选解析：具体行 id 优先，否则按逻辑模型 id 取候选（priority 小者优先）。
	candidates, resolveErr := catalog.Resolve(dir, payload.ModelID)
	if resolveErr != nil {
		// 文案与改动前**逐字一致**：存量排障文档与断言依赖它。
		// 具体原因（既非行 id 也无启用候选）由 Resolve 的错误类型承载，另有单测覆盖。
		const msg = "model not found in directory"
		auditTerminal(ctx, as, j, false, msg, nil)
		_ = s.Complete(ctx, j.ID, false, nil, msg)
		return
	}
	// P3-2 失败切换：异步 worker 的重试由 job 的 attempt 机制驱动（failOrRetry + j.Attempt，
	// 已存在且持久化），因此这里按尝试次数**推进候选**即可 —— 第一次用首选，重试即换备用。
	// 不在这里再套一层同步循环：那会把这段长流程重构得更脆，而收益相同。
	chosen := catalog.PickForAttempt(candidates, j.Attempt)
	model := &chosen
	// T0：命中模型的权威成本（异步终态回写审计用；CostAmount=nil 表示未校准，
	// 保持 0 + 空 unit 的"预估"口径 —— T2 报表据此区分已校准/预估）。
	var hitCost float64
	var hitUnit string
	if model.CostAmount != nil {
		hitCost = *model.CostAmount
		hitUnit = model.CostUnit
	}
	// T1：命中模型即知供给单元（渠道×模型）——异步审计行终态补齐 channel_id/provider_model
	// （submit-time 行提交时未知；T2 报表按供给单元聚合依赖此字段）。
	hitChannelID := model.ChannelID
	hitProviderModel := model.ProviderModel
	if model.ProtocolTemplateID == "" {
		auditTerminal(ctx, as, j, false, "model has no protocol template", nil)
		_ = s.Complete(ctx, j.ID, false, nil, "model has no protocol template")
		return
	}
	var tmpl *catalog.Template
	for i := range dir.Templates {
		if dir.Templates[i].ID == model.ProtocolTemplateID {
			tmpl = &dir.Templates[i]
			break
		}
	}
	if tmpl == nil {
		auditTerminal(ctx, as, j, false, "protocol template not found", nil)
		_ = s.Complete(ctx, j.ID, false, nil, "protocol template not found")
		return
	}

	// Get credentials
	credentials, err := cred.Reveal(ctx, jobWorkspace, model.ChannelID)
	if err != nil {
		auditTerminal(ctx, as, j, false, "credentials missing: "+err.Error(), nil)
		_ = s.Complete(ctx, j.ID, false, nil, "credentials missing: "+err.Error())
		return
	}

	// 将 aspect_ratio 转换为 size（OpenAI Images API 只接受 size 参数）
	aspectSizeMap := map[string]string{
		"1:1":  "1024x1024",
		"2:3":  "1024x1536",
		"3:4":  "1024x1365",
		"9:16": "1024x1792",
		"16:9": "1792x1024",
		"4:3":  "1152x896",
		"3:2":  "1536x1024",
	}
	if ar, ok := payload.Runtime["aspect_ratio"].(string); ok && ar != "" {
		if size, ok := aspectSizeMap[ar]; ok {
			payload.Runtime["size"] = size
			Logger.Info("execution worker: aspect_ratio=%s -> size=%s", ar, size)
		}
	}

	// Determine request path from runtime (set by generate handler via mapping engine)
	// This avoids hardcoded path switching — the mapping engine decides the path based on mode
	finalRequestPath := model.RequestPath
	if rp, ok := payload.Runtime["__request_path"].(string); ok && rp != "" {
		finalRequestPath = rp
	}

	req := engine.RunRequest{
		ChannelID:        model.ChannelID,
		ProviderModel:    model.ProviderModel,
		ProtocolTemplate: engine.Template{ID: tmpl.ID, Label: tmpl.Label, Method: tmpl.Method, RequestPath: tmpl.RequestPath, Params: tmpl.Params, ResponseParams: tmpl.ResponseParams, Async: tmpl.Async, RequestTemplate: tmpl.RequestTemplate},
		ModelParams:      model.Params,
		ModelRequestPath: finalRequestPath,
		Runtime:          payload.Runtime,
	}

	// Check if async
	var asyncCfg struct {
		Enabled bool `json:"enabled"`
	}
	isAsync := len(tmpl.Async) > 0 && json.Unmarshal(tmpl.Async, &asyncCfg) == nil && asyncCfg.Enabled

	var result engine.RunResult
	// credentials is already engine.Credentials (including the data-driven
	// AuthHeader/AuthPrefix knobs), so pass it through untouched.
	if isAsync {
		result, err = engine.RunAsync(ctx, credentials, req, client)
	} else {
		result, err = engine.Run(ctx, credentials, req, client)
	}

	if err != nil {
		// T1：引擎失败但模型已命中 —— 终态审计行补齐 channel/provider（供给单元）
		failOrRetry(ctx, s, j, err.Error(), as, hitChannelID, hitProviderModel)
		return
	}

	// Store result
	payload.Result = result.Extracted
	resultBytes, marshalErr := json.Marshal(payload)
	if marshalErr != nil {
		Logger.Info("execution worker: job %s marshal payload error: %v", j.ID, marshalErr)
		auditTerminal(ctx, as, j, false, "marshal result error: "+marshalErr.Error(), nil)
		_ = s.Complete(ctx, j.ID, false, nil, "marshal result error: "+marshalErr.Error())
		return
	}
	extractedKeys := make([]string, 0, len(result.Extracted))
	for k := range result.Extracted {
		extractedKeys = append(extractedKeys, k)
	}
	Logger.Info("job result", "job_id", j.ID, "result_bytes", len(resultBytes), "extracted_keys", extractedKeys)

	// 关键检查：如果没有提取到任何图片URL，应该标记为failed，而不是succeeded
	if len(result.Extracted) == 0 {
		Logger.Warn("no image URL extracted, marking as failed", "job_id", j.ID)
		auditTerminalUsage(ctx, as, j, false, "model returned no image URL", resultBytes, result.Extracted, result.ElapsedMs, hitCost, hitUnit, hitChannelID, hitProviderModel)
		_ = s.Complete(ctx, j.ID, false, resultBytes, "model returned no image URL")
		return
	}

	auditTerminalUsage(ctx, as, j, true, "", resultBytes, result.Extracted, result.ElapsedMs, hitCost, hitUnit, hitChannelID, hitProviderModel)

	completeErr := s.Complete(ctx, j.ID, true, resultBytes, "")
	if completeErr != nil {
		Logger.Info("execution worker: job %s complete error: %v", j.ID, completeErr)
	}
	Logger.Info("execution worker: job %s completed (model=%s)", j.ID, payload.ModelID)
}

// failOrRetry 用于**瞬态**失败（上游错误、内部依赖临时不可用）：
// 未达上限则退避重排，达到上限则进入死信。
// 配置类/永久性错误不走这里，而是直接 Complete(false) —— 否则会白白消耗尝试次数
// （例如「model not found」重试 3 次毫无意义）。
func failOrRetry(ctx context.Context, s job.Store, j job.Job, msg string, as *audit.Store, channelID, providerModel string) {
	cfg := job.DefaultRetryConfig()
	backoff := cfg.Backoff(j.Attempt, rand.New(rand.NewSource(time.Now().UnixNano())))
	retried, err := s.FailOrRetry(ctx, j.ID, msg, backoff.Seconds())
	switch {
	case err != nil:
		Logger.Warn("FailOrRetry 失败，回退为标记失败", "job_id", j.ID, slog.Any("err", err))
		// D2b：这是【终态】（回退为标记失败）
		// T1：命中模型后的失败终态也补齐 channel/provider（空串不覆盖，供 T2 按供给单元聚合）
		auditTerminalT(ctx, as, j, false, msg, nil, 0, 0, 0, 0, 0, "", channelID, providerModel)
		_ = s.Complete(ctx, j.ID, false, nil, msg)
	case retried:
		Logger.Warn("第 N 次失败，稍后重试", "job_id", j.ID, "attempt", j.Attempt, "backoff", backoff.Round(time.Second).String(), "reason", msg)
	default:
		Logger.Warn("重试耗尽，进入死信", "job_id", j.ID, "attempt", j.Attempt, "reason", msg)
		// D2b：这是【终态】（重试耗尽 → 死信）。
		// 上面的 case retried 分支【不写】—— 那个任务还会重试，不是终态；
		// 提前写会把"还在重试"记成"已失败"。
		// T1：命中模型后的死信终态同样补齐 channel/provider
		auditTerminalT(ctx, as, j, false, msg, nil, 0, 0, 0, 0, 0, "", channelID, providerModel)
	}
}
