# 可观测性规范

> 本文件定义日志、指标、追踪与健康检查的统一要求。
> 与审计的关系：**审计是治理事实（写数据库，不可丢）；日志是诊断信息（尽力而为）** —— 两者不可互相替代。

## 0. 现状（2026-10-10 实测）

| 能力 | 现状 | 评级 |
|---|---|---|
| 结构化日志 | **混用**：`log.Printf` 32 处、`log.Fatal` 24 处、`slog.` 13 处、`log.Error` 1 处 | ❌ 不统一 |
| 请求上下文关联 | 无统一 `request_id` 贯穿日志 | ❌ 缺失 |
| 健康检查 | 仅 `"/ready"` 一个端点 | ⚠️ 不完整 |
| 指标（Metrics） | **完全没有** | ❌ 缺失 |
| 分布式追踪 | **完全没有** | ❌ 缺失 |
| 告警 | 无 | ❌ 缺失 |

**结论**：可观测性是当前最薄弱的一块。本文件给出**目标规范**与**增量落地路径**，不假装已具备。

---

## 1. 日志

### 1.1 统一使用 `log/slog`

`log/slog` 自 Go 1.21 起属**标准库**，天然结构化，符合 AGENTS.md「标准库优先」。
**新代码一律使用 `slog`；存量 `log.*` 随改动逐步替换**（不要求一次性重构）。

> 注：AGENTS.md §4.2 原写「标准 `log` 包」，本文件生效后以 `log/slog` 为准，AGENTS.md 已同步。

### 1.2 级别约定

| 级别 | 用途 | 示例 |
|---|---|---|
| `Debug` | 仅本地排障，生产默认关闭 | 请求/响应体摘要（**脱敏后**） |
| `Info` | 正常业务里程碑 | 服务启动、Job 终态、迁移完成 |
| `Warn` | 可自愈但需关注 | 上游重试、降级、审计写入失败 |
| `Error` | 需要人工介入 | 依赖不可用、数据不一致、迁移失败 |

### 1.3 必需字段（结构化键值对）

所有 `Info` 及以上日志必须携带：

| 字段 | 说明 |
|---|---|
| `service` | 服务名（`workspace` / `production` / `execution` / `asset` / `web-bff` / `outbox-relay`） |
| `request_id` | 请求级关联 ID；跨服务透传（见 §3） |
| `workspace_id` | 租户上下文（可用时） |
| `actor_id` | 操作者（可用时） |

业务事件建议附加 `model_id`、`job_id`、`provider_task_id`、`latency_ms` 等 —— 与
`gateway_audit_logs` 字段命名保持一致，便于日志与审计互相印证。

### 1.4 绝对禁止写入日志的内容

| 禁止项 | 原因 |
|---|---|
| 渠道凭据（API Key / Secret / `key_ciphertext`） | 安全；凭据只允许存在于 workspace 密文与运行时内存 |
| 完整 `Authorization` 头 | 同上 |
| 用户隐私原文（未脱敏的剧本全文/对白） | 合规；需要时记长度与哈希，不记内容 |
| DSN 中的密码 | 安全；打印连接信息时必须去掉密码段 |

> 已有先例：`services/web-bff/cmd/server/main.go` 对探测请求打印的是 `Bearer <REDACTED>`，请保持该习惯。

### 1.5 审计写入失败必须可见（**当前缺陷**）

现有代码 `_ = h.AuditStore.Insert(...)` 静默吞掉错误，仅靠注释说明「不阻塞主流程」。
在补齐前，至少要做到**可观测**：

```go
if err := h.AuditStore.Insert(ctx, log); err != nil {
    // 审计是治理事实，失败必须可见（不可静默）
    slog.ErrorContext(ctx, "audit insert failed",
        "request_id", log.RequestID, "status", log.Status, "err", err)
    auditFailuresTotal.Add(ctx, 1)   // 待引入指标后
}
```

**原则**：是否阻塞主流程可以讨论，但**静默必须消除**。详见
[architecture/02-key-sequences.md](architecture/02-key-sequences.md)。

---

## 2. 指标（Metrics）

### 2.1 暴露方式

约定 `GET /metrics`（Prometheus 文本格式），与业务端口分离以避免外部暴露 —— 生产由
ServiceMonitor / 采集侧访问，**不通过 BFF 或网关对外**。

**当前未实现**，落地建议引入 `promhttp` + `prometheus/client_golang`。

### 2.2 最小指标集（RED 框架）

| 指标 | 类型 | 标签 | 用途 |
|---|---|---|---|
| `http_requests_total` | Counter | `service`, `route`, `method`, `status` | 流量与错误率 |
| `http_request_duration_seconds` | Histogram | `service`, `route`, `method` | 延迟分布（算 P95/P99） |
| `http_requests_in_flight` | Gauge | `service` | 并发压力 |
| `gateway_calls_total` | Counter | `model_id`, `mode`, `status` | **AI 调用量与成败** |
| `gateway_call_duration_seconds` | Histogram | `model_id`, `mode` | 模型侧延迟 |
| `gateway_upstream_errors_total` | Counter | `model_id`, `code` | 上游错误分类 |
| `gateway_tokens_total` | Counter | `model_id`, `direction` | Token 用量（成本核算依据） |
| `jobs_total` | Counter | `kind`, `status` | 任务量与终态分布 |
| `job_queue_depth` | Gauge | `kind` | 待处理积压（**异步 worker 扩容依据**） |
| `job_oldest_pending_seconds` | Gauge | `kind` | 最老待处理时长（比深度更能反映卡顿） |
| `outbox_pending_total` / `outbox_dead_lettered_total` | Gauge/Counter | — | 消息投递健康度 |
| `audit_insert_failures_total` | Counter | — | **审计丢失告警依据** |

**命名**：`<域>_<对象>_<单位>`，单位用基本单位（秒、字节），不要用毫秒/分。
**标签基数**：禁止把 `request_id`、`job_id`、用户 ID 作为标签（会撑爆基数）。

### 2.3 建议告警阈值（起点，随实测调整）

| 条件 | 级别 |
|---|---|
| `audit_insert_failures_total` 增长 > 0 | **P1 立即**（审计丢失） |
| `gateway_upstream_errors_total` 5 分钟错误率 > 20% | P1 |
| `job_oldest_pending_seconds` > 300s | P2（队列卡住） |
| `outbox_dead_lettered_total` 增长 > 0 | P2 |
| `http_request_duration_seconds` P99 > 5s 持续 10 分钟 | P3 |

---

## 3. 追踪（Tracing）

- **传播标准**：W3C `traceparent` / `tracestate`。BFF 在入口生成或沿用上游 trace 上下文，向下游转发。
- **与审计对齐**：把 `trace_id` 与 `request_id` 一并写入 `gateway_audit_logs`（该表已有 `request_id`），
  实现「一条审计记录 ↔ 一条完整链路」的互相跳转。
- **采样**：默认采样率可低（如 1%），但**错误与失败请求 100% 采样** —— 失败样本才有诊断价值。
- **当前未实现**，落地建议 OpenTelemetry Go SDK + OTLP 导出。

---

## 4. 健康检查

每个可部署单元必须同时提供两个端点，语义严格区分：

| 端点 | 语义 | 依赖 | 用途 |
|---|---|---|---|
| `GET /healthz`（存活） | 进程活着即可返回 200 | **不检查下游** | 容器重启判定（livenessProbe） |
| `GET /readyz`（就绪） | 能承载流量才返回 200 | 检查**本服务必需**依赖（如数据库连通） | 流量摘除判定（readinessProbe） |

**常见错误**：把数据库检查放进 `healthz` —— 依赖抖动会导致容器被反复重启，放大故障。
**当前现状**：仅 execution 暴露 `/ready`，其余服务缺失；命名也不统一。落地时统一为上述两个端点。

---

## 5. 增量落地路径（不要一次性重构）

| 阶段 | 动作 | 完成标志 |
|---|---|---|
| **1（当前轮）** | 审计写入失败不再静默；新代码统一 `slog` 并带 `service`/`request_id` | 日志中可查到审计失败 |
| **2** | 统一 `request_id` 在 BFF 生成并透传；补齐 `/healthz` `/readyz` | 可用一个 ID 串起一次请求 |
| **3** | 引入 `/metrics` + RED 指标 + 审计失败计数 | 可在面板看到流量/错误/延迟 |
| **4** | 引入 OpenTelemetry 追踪 + 告警规则 | 失败请求可端到端定位 |

---

## 相关文档

- 信任边界与信任模型：[architecture/01-c4-context-container.md](architecture/01-c4-context-container.md)
- 审计发生在哪些链路：[architecture/02-key-sequences.md](architecture/02-key-sequences.md)
- 审计表字段：[architecture/03-data-model.md](architecture/03-data-model.md)
- 安全基线：[`../SECURITY.md`](../SECURITY.md)
