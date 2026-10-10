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
	// 并发闸门：原先每任务直接起 goroutine、**无上限**，一次批量提交就会同时
	// 打满上游配额并耗尽本进程连接/内存。容量可配，默认 8。
	maxConcurrent := envInt("EXECUTION_MAX_CONCURRENT_JOBS", 8)
	gate := job.NewSemaphore(maxConcurrent)
	log.Printf("execution: worker 并发上限 = %d", gate.Cap())
	go runWorker(store, catalogClient, credsClient, engineClient, gate)
	log.Printf("execution service listening on %s", addr)
	log.Fatal((&http.Server{Addr: addr, Handler: httpapi.Handler{Store: store, Token: token, Ready: pool.Ping, Catalog: catalogClient, Creds: credsClient, EngineClient: engineClient, AuditStore: auditStore}.Routes(), ReadHeaderTimeout: 5 * time.Second}).ListenAndServe())
}

// runWorker dispatches queued jobs and executes them via the engine.
// It flips queued -> running, then executes each running job via engine.Run/RunAsync.
func runWorker(s job.Store, cat *catalog.Client, cred *creds.Client, client *http.Client, gate *job.Semaphore) {
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
				executeJob(ctx, s, cat, cred, client, job)
			}(j, jobCtx, jobCancel)
		}
	}
}

// executeJob runs a single job through the engine and updates its status.
func executeJob(ctx context.Context, s job.Store, cat *catalog.Client, cred *creds.Client, client *http.Client, j job.Job) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("execution worker: panic in job %s: %v", j.ID, r)
			_ = s.Complete(ctx, j.ID, false, nil, fmt.Sprintf("internal panic: %v", r))
		}
	}()

	if cat == nil || cred == nil {
		_ = s.Complete(ctx, j.ID, false, nil, "execution engine not configured")
		return
	}

	// Parse payload
	var payload jobPayload
	if len(j.IntentPayload) > 0 && string(j.IntentPayload) != "null" {
		if err := json.Unmarshal(j.IntentPayload, &payload); err != nil {
			_ = s.Complete(ctx, j.ID, false, nil, "invalid job payload: "+err.Error())
			return
		}
	}
	if payload.ModelID == "" {
		_ = s.Complete(ctx, j.ID, false, nil, "missing modelId in payload")
		return
	}

	// Get model directory (use dev workspace/actor)
	dir, err := cat.Get(ctx, "ws_dev", "user_dev")
	if err != nil {
		failOrRetry(ctx, s, j, "catalog unavailable: "+err.Error())
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
		_ = s.Complete(ctx, j.ID, false, nil, "model not found in directory")
		return
	}
	if model.ProtocolTemplateID == "" {
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
		_ = s.Complete(ctx, j.ID, false, nil, "protocol template not found")
		return
	}

	// Get credentials
	credentials, err := cred.Reveal(ctx, "ws_dev", model.ChannelID)
	if err != nil {
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
		ProtocolTemplate: engine.Template{ID: tmpl.ID, Label: tmpl.Label, Method: tmpl.Method, RequestPath: tmpl.RequestPath, Params: tmpl.Params, ResponseParams: tmpl.ResponseParams, Async: tmpl.Async},
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
	if isAsync {
		result, err = engine.RunAsync(ctx, engine.Credentials{BaseURL: credentials.BaseURL, AuthType: credentials.AuthType, APIKey: credentials.APIKey}, req, client)
	} else {
		result, err = engine.Run(ctx, engine.Credentials{BaseURL: credentials.BaseURL, AuthType: credentials.AuthType, APIKey: credentials.APIKey}, req, client)
	}

	if err != nil {
		failOrRetry(ctx, s, j, err.Error())
		return
	}

	// Store result
	payload.Result = result.Extracted
	resultBytes, marshalErr := json.Marshal(payload)
	if marshalErr != nil {
		log.Printf("execution worker: job %s marshal payload error: %v", j.ID, marshalErr)
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
		_ = s.Complete(ctx, j.ID, false, resultBytes, "model returned no image URL")
		return
	}

	completeErr := s.Complete(ctx, j.ID, true, resultBytes, "")
	if completeErr != nil {
		log.Printf("execution worker: job %s complete error: %v", j.ID, completeErr)
	}
	log.Printf("execution worker: job %s completed (model=%s)", j.ID, payload.ModelID)
}

// envInt 读取整型环境变量，缺省或非法时返回 def。
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
func failOrRetry(ctx context.Context, s job.Store, j job.Job, msg string) {
	cfg := job.DefaultRetryConfig()
	backoff := cfg.Backoff(j.Attempt, rand.New(rand.NewSource(time.Now().UnixNano())))
	retried, err := s.FailOrRetry(ctx, j.ID, msg, backoff.Seconds())
	switch {
	case err != nil:
		log.Printf("execution worker: FailOrRetry job=%s err=%v（回退为标记失败）", j.ID, err)
		_ = s.Complete(ctx, j.ID, false, nil, msg)
	case retried:
		log.Printf("execution worker: job=%s 第 %d 次失败，%s 后重试: %s", j.ID, j.Attempt, backoff.Round(time.Second), msg)
	default:
		log.Printf("execution worker: job=%s 重试耗尽（attempt=%d），进入死信: %s", j.ID, j.Attempt, msg)
	}
}
