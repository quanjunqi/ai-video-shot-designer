package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"shotdesigner/services/execution/internal/audit"
	"shotdesigner/services/execution/internal/catalog"
	"shotdesigner/services/execution/internal/creds"
	"shotdesigner/services/execution/internal/engine"
	"shotdesigner/services/execution/internal/httpapi"
	"shotdesigner/services/execution/internal/job"
	"shotdesigner/services/execution/internal/netguard"
	"shotdesigner/services/execution/internal/probe"
	"shotdesigner/services/execution/internal/quota"
)

// jobPayload is the structured payload stored in job.intent_payload for model execution jobs.
type jobPayload struct {
	ModelID string                 `json:"modelId"`
	Runtime map[string]interface{} `json:"runtime"`
	Result  map[string]interface{} `json:"result"`
}

func main() {
	dsn := os.Getenv("EXECUTION_DATABASE_URL")
	token := os.Getenv("EXECUTION_INTERNAL_TOKEN")
	productionURL := os.Getenv("EXECUTION_PRODUCTION_URL")
	productionToken := os.Getenv("PRODUCTION_INTERNAL_TOKEN")
	workspaceURL := os.Getenv("EXECUTION_WORKSPACE_URL")
	workspaceToken := os.Getenv("WORKSPACE_INTERNAL_TOKEN")
	if dsn == "" || token == "" {
		log.Fatal("EXECUTION_DATABASE_URL and EXECUTION_INTERNAL_TOKEN must be set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		log.Fatal(err)
	}
	store := job.Store{Pool: pool}
	auditStore := &audit.Store{Pool: pool}
	addr := os.Getenv("EXECUTION_LISTEN_ADDR")
	if addr == "" {
		addr = "0.0.0.0:8085"
	}
	var catalogClient *catalog.Client
	var credsClient *creds.Client
	if productionURL != "" && productionToken != "" {
		catalogClient = catalog.NewClient(productionURL, productionToken)
	}
	if workspaceURL != "" && workspaceToken != "" {
		credsClient = creds.NewClient(workspaceURL, workspaceToken)
	}
	if catalogClient == nil || credsClient == nil {
		log.Printf("warning: execution engine partial config (catalog=%v creds=%v); /run unavailable", catalogClient != nil, credsClient != nil)
	}
	// 模型网关的 client 会请求「渠道凭据里的 base_url」——该 URL 由用户提供，
	// 因此必须带 SSRF 防护（见 internal/netguard 的威胁模型说明）。
	// 注意：catalog/creds 的内部调用走各自的 client，目标是私网内部服务，
	// **不能**套用本防护，否则会自断链路。
	upstreamPolicy := netguard.FromEnv(os.Getenv)
	engineClient := upstreamPolicy.NewClient(600 * time.Second)
	log.Printf("execution: upstream SSRF policy allow_private=%v allowed_hosts=%d",
		upstreamPolicy.AllowPrivate, len(upstreamPolicy.AllowedHosts))
	// 渠道探测（TASK-INFRA-004）：全仓唯一实现，base URL 只从服务端来源解析
	// （工作区用户渠道 / 凭据行 / 平台目录），出站走同一套 SSRF 防护。
	prober := probe.New(catalogClient, credsClient, upstreamPolicy, 5*time.Second)
	if catalogClient == nil && credsClient == nil {
		prober = nil
		log.Printf("warning: channel probe disabled (neither catalog nor workspace configured)")
	}
	// 并发闸门：原先每任务直接起 goroutine、**无上限**，一次批量提交就会同时
	// 打满上游配额并耗尽本进程连接/内存。容量可配，默认 8。
	// 配额与限流：QPS 令牌桶 + 日/月成本上限（默认 QPS 宽松、成本不限制）
	quotaCfg := quota.FromEnv(os.Getenv)
	quotaLimiter := quota.New(quotaCfg, auditStore)
	log.Printf("execution: 配额 qps=%v burst=%d 日上限=%v 月上限=%v",
		quotaCfg.QPS, quotaCfg.Burst, quotaCfg.DailyCostLimit, quotaCfg.MonthlyCostLimit)

	maxConcurrent := envInt("EXECUTION_MAX_CONCURRENT_JOBS", 8)
	gate := job.NewSemaphore(maxConcurrent)
	log.Printf("execution: worker 并发上限 = %d", gate.Cap())
	go runWorker(store, catalogClient, credsClient, engineClient, gate, auditStore)

	// D6：审计保留期清理。**默认关闭**（天数未设置 = 0）—— 清理是破坏性操作，
	// 在没有人类显式配置之前不启动，避免"部署一次就默默删掉历史审计"。
	successDays := envInt("EXECUTION_AUDIT_RETENTION_DAYS", 0)
	failureDays := envInt("EXECUTION_AUDIT_FAILURE_RETENTION_DAYS", 0)
	if successDays > 0 || failureDays > 0 {
		purgeInterval := envDuration("EXECUTION_AUDIT_PURGE_INTERVAL", 24*time.Hour)
		log.Printf("execution: 审计保留期清理【已启用】成功=%d天 失败=%d天 间隔=%s", successDays, failureDays, purgeInterval)
		go runAuditPurger(auditStore, successDays, failureDays, purgeInterval)
	} else {
		log.Printf("execution: 审计保留期清理【未启用】（需显式设置 EXECUTION_AUDIT_RETENTION_DAYS / EXECUTION_AUDIT_FAILURE_RETENTION_DAYS）")
	}
	log.Printf("execution service listening on %s", addr)
	log.Fatal((&http.Server{Addr: addr, Handler: httpapi.Handler{Store: store, Token: token, Ready: pool.Ping, Catalog: catalogClient, Creds: credsClient, EngineClient: engineClient, AuditStore: auditStore, Quota: quotaLimiter, Probe: prober}.Routes(), ReadHeaderTimeout: 5 * time.Second}).ListenAndServe())
}

// runWorker dispatches queued jobs and executes them via the engine.
// It flips queued -> running, then executes each running job via engine.Run/RunAsync.

// auditTerminal 把任务的【确定终态】写回审计（D2）。
//
// 背景（判据 = SQL）：改动前 worker 不持有 auditStore ⇒ 异步链【零审计】；
// 且提交时的审计行永远停在 queued（UpdateResult 零调用者）。异步任务主要是
// 视频类长任务，即主要付费路径 —— 所以这条链路的审计缺失最严重。
//
// 覆盖范围：executeJob 内 s.Complete(...) 的全部 11 处调用点（含 defer 里的 panic）。
// 【本片明确未覆盖】failOrRetry 触发的终态（重试耗尽 / 死信）：那两处是否终态只有
// failOrRetry 自己知道，需要它回报终态性 —— 属 D2b。
func auditTerminal(ctx context.Context, as *audit.Store, jobID string, ok bool, errMsg string, result []byte) {
	// 无用量场景（早退失败、panic 等）：用量本就为 0
	auditTerminalT(ctx, as, jobID, ok, errMsg, result, 0, 0, 0)
}

// auditTerminalUsage 在【引擎已返回】的终态上额外记录用量（D4c）。
//
// 为什么单独一个函数、而不是给 auditTerminal 加三个参数：
//
//	auditTerminal 有 14 处调用点，而【只有引擎成功返回之后】才可能有用量
//	⇒ 给全部调用点加三个恒为 0 的参数，只会让 12 处噪音掩盖 2 处真实。
//
// 为什么必须补（D4a 的缺口）：D4a 只在同步路径记录了 token，worker 传的是
//
//	0,0,0 ⇒ **异步任务的 token 恒为 0**，而异步主要是视频类长任务（主要付费路径）。
func auditTerminalUsage(ctx context.Context, as *audit.Store, jobID string, ok bool, errMsg string, result []byte, ex map[string]any) {
	in, out, cached := engine.UsageFromExtracted(ex)
	auditTerminalT(ctx, as, jobID, ok, errMsg, result, in, out, cached)
}

// auditTerminalT 是两条入口的公共实现。
func auditTerminalT(ctx context.Context, as *audit.Store, jobID string, ok bool, errMsg string, result []byte, tokenIn, tokenOut, tokenCached int) {
	if as == nil {
		return
	}
	status := "failed"
	if ok {
		status = "succeeded"
	}
	var payload json.RawMessage
	if len(result) > 0 {
		payload = json.RawMessage(result)
	}
	n, err := as.UpdateResultByJobID(ctx, jobID, status, payload, errMsg, 0, tokenIn, tokenOut, tokenCached, 0, "")
	if err != nil {
		log.Printf("execution worker: audit update failed for job %s: %v", jobID, err)
		return
	}
	if n == 0 {
		log.Printf("execution worker: job %s has NO submit-time audit row (status=%s) —— 该任务提交路径不写审计（D2 说明：经 /internal/v1/tasks 提交的任务属此列）", jobID, status)
	}
}

func runWorker(s job.Store, cat *catalog.Client, cred *creds.Client, client *http.Client, gate *job.Semaphore, as *audit.Store) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	// Track jobs currently being executed to avoid duplicate dispatch
	var executing sync.Map
	for range ticker.C {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		// Step 1: flip queued -> running
		if err := s.Advance(ctx, 10); err != nil {
			log.Printf("execution worker advance: %v", err)
		}
		cancel()

		// Step 2: execute running jobs
		listCtx, listCancel := context.WithTimeout(context.Background(), 10*time.Second)
		jobs, err := s.ListRunning(listCtx, 10)
		listCancel()
		if err != nil {
			log.Printf("execution worker list running: %v", err)
			continue
		}
		for _, j := range jobs {
			// Skip if already executing (prevents duplicate dispatch on each poll)
			if _, loaded := executing.LoadOrStore(j.ID, true); loaded {
				log.Printf("execution worker: job %s already executing, skipping", j.ID)
				continue
			}
			// 闸门已满则本轮不派发：任务保持 running，下一轮 ticker 会再次列出
			// （因此必须先撤销 executing 标记，否则它会被永久视为「已在执行」）
			if !gate.TryAcquire() {
				executing.Delete(j.ID)
				log.Printf("execution worker: 并发已达上限 %d，本轮不派发 job %s", gate.Cap(), j.ID)
				continue
			}
			log.Printf("execution worker: starting job %s", j.ID)
			// Each job gets its own context with 10 min timeout
			jobCtx, jobCancel := context.WithTimeout(context.Background(), 10*time.Minute)
			go func(job job.Job, ctx context.Context, cancel context.CancelFunc) {
				defer cancel()
				defer gate.Release()
				defer executing.Delete(job.ID)
				log.Printf("execution worker: goroutine finished for job %s", job.ID)
				executeJob(ctx, s, cat, cred, client, job, as)
			}(j, jobCtx, jobCancel)
		}
	}
}

// executeJob runs a single job through the engine and updates its status.
func executeJob(ctx context.Context, s job.Store, cat *catalog.Client, cred *creds.Client, client *http.Client, j job.Job, as *audit.Store) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("execution worker: panic in job %s: %v", j.ID, r)
			auditTerminal(ctx, as, j.ID, false, fmt.Sprintf("internal panic: %v", r), nil)
			_ = s.Complete(ctx, j.ID, false, nil, fmt.Sprintf("internal panic: %v", r))
		}
	}()

	if cat == nil || cred == nil {
		auditTerminal(ctx, as, j.ID, false, "execution engine not configured", nil)
		_ = s.Complete(ctx, j.ID, false, nil, "execution engine not configured")
		return
	}

	// Parse payload
	var payload jobPayload
	if len(j.IntentPayload) > 0 && string(j.IntentPayload) != "null" {
		if err := json.Unmarshal(j.IntentPayload, &payload); err != nil {
			auditTerminal(ctx, as, j.ID, false, "invalid job payload: "+err.Error(), nil)
			_ = s.Complete(ctx, j.ID, false, nil, "invalid job payload: "+err.Error())
			return
		}
	}
	if payload.ModelID == "" {
		auditTerminal(ctx, as, j.ID, false, "missing modelId in payload", nil)
		_ = s.Complete(ctx, j.ID, false, nil, "missing modelId in payload")
		return
	}

	// Get model directory (use dev workspace/actor)
	dir, err := cat.Get(ctx, "ws_dev", "user_dev")
	if err != nil {
		failOrRetry(ctx, s, j, "catalog unavailable: "+err.Error(), as)
		return
	}
	var model *catalog.Model
	for i := range dir.Models {
		if dir.Models[i].ID == payload.ModelID {
			model = &dir.Models[i]
			break
		}
	}
	if model == nil {
		auditTerminal(ctx, as, j.ID, false, "model not found in directory", nil)
		_ = s.Complete(ctx, j.ID, false, nil, "model not found in directory")
		return
	}
	if model.ProtocolTemplateID == "" {
		auditTerminal(ctx, as, j.ID, false, "model has no protocol template", nil)
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
		auditTerminal(ctx, as, j.ID, false, "protocol template not found", nil)
		_ = s.Complete(ctx, j.ID, false, nil, "protocol template not found")
		return
	}

	// Get credentials
	credentials, err := cred.Reveal(ctx, "ws_dev", model.ChannelID)
	if err != nil {
		auditTerminal(ctx, as, j.ID, false, "credentials missing: "+err.Error(), nil)
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
			log.Printf("execution worker: aspect_ratio=%s -> size=%s", ar, size)
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
		failOrRetry(ctx, s, j, err.Error(), as)
		return
	}

	// Store result
	payload.Result = result.Extracted
	resultBytes, marshalErr := json.Marshal(payload)
	if marshalErr != nil {
		log.Printf("execution worker: job %s marshal payload error: %v", j.ID, marshalErr)
		auditTerminal(ctx, as, j.ID, false, "marshal result error: "+marshalErr.Error(), nil)
		_ = s.Complete(ctx, j.ID, false, nil, "marshal result error: "+marshalErr.Error())
		return
	}
	extractedKeys := make([]string, 0, len(result.Extracted))
	for k := range result.Extracted {
		extractedKeys = append(extractedKeys, k)
	}
	log.Printf("execution worker: job %s resultBytes len=%d, extracted keys=%v", j.ID, len(resultBytes), extractedKeys)

	// 关键检查：如果没有提取到任何图片URL，应该标记为failed，而不是succeeded
	if len(result.Extracted) == 0 {
		log.Printf("execution worker: job %s WARNING: no image URL extracted, marking as failed", j.ID)
		auditTerminalUsage(ctx, as, j.ID, false, "model returned no image URL", resultBytes, result.Extracted)
		_ = s.Complete(ctx, j.ID, false, resultBytes, "model returned no image URL")
		return
	}

	auditTerminalUsage(ctx, as, j.ID, true, "", resultBytes, result.Extracted)

	completeErr := s.Complete(ctx, j.ID, true, resultBytes, "")
	if completeErr != nil {
		log.Printf("execution worker: job %s complete error: %v", j.ID, completeErr)
	}
	log.Printf("execution worker: job %s completed (model=%s)", j.ID, payload.ModelID)
}

// envInt 读取整型环境变量，缺省或非法时返回 def。
// runAuditPurger 按保留期定期清理审计（D6）。
//
// 为什么删除本身要写审计（审计的审计）：
//
//	审计系统必须能回答"谁在什么时候删掉了什么"。否则一旦有人打开开关，
//	历史就会【无声消失】——那正是审计最不该发生的事。
//	记录挂在 audit.SystemWorkspace 哨兵值下，不会污染任何租户的列表与聚合。
//
// 为什么清理失败不影响主流程：清理是后台维护动作，失败只记录并等下一轮；
// 绝不能因为它让服务不可用。
func runAuditPurger(as *audit.Store, successDays, failureDays int, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		n, err := as.Purge(ctx, successDays, failureDays)
		if err != nil {
			log.Printf("execution: 审计清理失败（等下一轮）: %v", err)
			cancel()
			continue
		}
		if n > 0 {
			rec := audit.Log{
				RequestID:   fmt.Sprintf("req_purge_%d", time.Now().UnixNano()),
				WorkspaceID: audit.SystemWorkspace,
				UserID:      "system",
				Product:     "system",
				Mode:        "audit_purge",
				Status:      "success",
				ResponsePayload: json.RawMessage(fmt.Sprintf(
					`{"deleted":%d,"successDays":%d,"failureDays":%d}`, n, successDays, failureDays)),
			}
			if err := as.Insert(ctx, rec); err != nil {
				log.Printf("execution: 清理记录写入审计失败: %v", err)
			}
		}
		log.Printf("execution: 审计清理完成，删除 %d 行（成功 >%d天 / 其他 >%d天）", n, successDays, failureDays)
		cancel()
	}
}

// envDuration 读一个 time.Duration 环境变量（如 24h / 30m）；非法或未设置时取默认值。
func envDuration(key string, def time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil && d > 0 {
			return d
		}
	}
	return def
}

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return def
}

// failOrRetry 用于**瞬态**失败（上游错误、内部依赖临时不可用）：
// 未达上限则退避重排，达到上限则进入死信。
// 配置类/永久性错误不走这里，而是直接 Complete(false) —— 否则会白白消耗尝试次数
// （例如「model not found」重试 3 次毫无意义）。
func failOrRetry(ctx context.Context, s job.Store, j job.Job, msg string, as *audit.Store) {
	cfg := job.DefaultRetryConfig()
	backoff := cfg.Backoff(j.Attempt, rand.New(rand.NewSource(time.Now().UnixNano())))
	retried, err := s.FailOrRetry(ctx, j.ID, msg, backoff.Seconds())
	switch {
	case err != nil:
		log.Printf("execution worker: FailOrRetry job=%s err=%v（回退为标记失败）", j.ID, err)
		// D2b：这是【终态】（回退为标记失败）
		auditTerminal(ctx, as, j.ID, false, msg, nil)
		_ = s.Complete(ctx, j.ID, false, nil, msg)
	case retried:
		log.Printf("execution worker: job=%s 第 %d 次失败，%s 后重试: %s", j.ID, j.Attempt, backoff.Round(time.Second), msg)
	default:
		log.Printf("execution worker: job=%s 重试耗尽（attempt=%d），进入死信: %s", j.ID, j.Attempt, msg)
		// D2b：这是【终态】（重试耗尽 → 死信）。
		// 上面的 case retried 分支【不写】—— 那个任务还会重试，不是终态；
		// 提前写会把"还在重试"记成"已失败"。
		auditTerminal(ctx, as, j.ID, false, msg, nil)
	}
}
