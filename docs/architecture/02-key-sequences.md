# 关键链路时序图

> 本文件回答：**一次请求或一次生成，到底经过哪些步骤**。
> 所有时序均来自代码实证，事实来源见 [README](README.md#事实来源可复现校验)。

## 为什么这四张图最要紧

系统对外只暴露两件事：**读数据**与**生成内容**。前者决定用户体验，后者决定成本与可审计性。
四条链路覆盖了全部关键路径，也是排障与容量评估的入口。

---

## 时序 1 · 同步生成（网关完整链路）

适用：模板 `async.enabled = false`（如文本对话、同步图片生成）。这是**最完整的链路**，异步链路是它的子集。

```mermaid
sequenceDiagram
    autonumber
    participant U as 浏览器
    participant W as web (Nginx)
    participant B as web-bff :8080
    participant X as execution :8085
    participant P as production :18081
    participant S as workspace :18082
    participant A as 外部 AI 后端
    participant DB as execution 库

    U->>W: POST /api/v1/generate
    W->>B: 代理 /api/v1/*
    Note over B: 取出固定开发身份<br/>BFF_DEV_WORKSPACE_ID / BFF_DEV_ACTOR_ID
    B->>S: 授权校验该身份
    alt 授权失败
        S-->>B: 拒绝
        B-->>U: 403
    else 授权通过
        B->>X: POST /v1/generate<br/>Bearer EXECUTION_INTERNAL_TOKEN<br/>X-Workspace-Id / X-Actor-Id
    end

    Note over X: 校验内部令牌（常量时间比较）
    X->>P: 取 Catalog 快照（模型 + 协议模板）
    P-->>X: dir{models, templates}
    Note over X: 解析模型 → 协议模板 → capability 校验

    X->>X: 合并 input+parameters → 应用参数映射引擎（模板驱动）
    X->>X: 校验必填参数 / 图生图必须带 reference_images

    X->>S: Reveal 渠道凭据（ws, channelId）
    S-->>X: baseUrl / authType / apiKey

    X->>A: engine.Run：按模板组装请求并调用
    alt 2xx 且可解析
        A-->>X: 响应体
        X->>X: 按 responseParams 提取字段
        X->>DB: 写 gateway_audit_logs（status=success）
        X-->>B: 200 {ok:true, run:{extracted}}
    else 上游错误 / 非 JSON / 提取失败
        A-->>X: 错误响应
        X->>DB: 写 gateway_audit_logs（status=failed）
        X-->>B: 200 {ok:false, error}
    end
    B-->>W: 透传
    W-->>U: 结果
```

**关键设计点**

| 点 | 说明 |
|---|---|
| 审计**同步**写入 | 与业务同请求内完成，不依赖异步管道（`services/execution/internal/httpapi/handler.go`） |
| 上游失败返回 **200 + ok:false** | 不是 5xx：这是「调用已完成但业务失败」，避免调用方误判为网关不可用 |
| 参数映射**模板驱动** | `mapping.NewEngine(tmpl.Capabilities)`；无硬编码映射，符合 AGENTS.md §3.2 |
| 路径优先级 | model 覆盖 > capability 配置 > 模板默认（`handler.go:555`） |
| ⚠️ 路径约定不一致 | 网关路由是 `POST /v1/generate`（`services/execution/internal/httpapi/handler.go:61`），**不在** execution 其余路由所用的 `/internal/v1/*` 约定内。契约已按代码如实记录，但建议统一（改名属破坏性变更，见 [`openapi/README.md`](../../openapi/README.md)） |

> ⚠️ **已知缺陷（待修）**：审计写入的返回值被丢弃 —— `_ = h.AuditStore.Insert(...)`，注释为「audit failure should not block main flow」。
> 这使「审计日志同步写入、不异步丢失」（AGENTS.md §3.4）在**写入失败时退化为静默丢失**。
> 审计是治理事实源，静默丢失会破坏可追溯性。建议：至少记录错误日志/指标；对合规敏感场景改为失败即拒绝或进入重试队列。

---

## 时序 2 · 异步生成（提交 → worker 执行 → 终态）

适用：模板 `async.enabled = true`（视频、长任务）。网关**只负责受理**，真正执行交给 worker。

```mermaid
sequenceDiagram
    autonumber
    participant U as 浏览器
    participant B as web-bff
    participant X as execution :8085
    participant P as production :18081
    participant DB as execution 库
    participant WK as runWorker（同进程 goroutine）
    participant S as workspace
    participant A as 外部 AI 后端

    U->>B: POST /api/v1/generate（异步模板）
    B->>X: POST /v1/generate
    X->>P: 取 Catalog 快照
    P-->>X: dir
    X->>X: 参数映射 + 必填校验
    X->>DB: 创建 Job（status=queued）
    X->>DB: 写审计（status=queued, job_id）
    X-->>B: 202 {task_id, status, poll_url}
    B-->>U: 202 + 任务 ID

    loop 每 2 秒 ticker
        WK->>DB: 认领 queued Job（置 running，记 attempt）
    end
    WK->>S: Reveal 渠道凭据
    S-->>WK: 凭据
    alt 模板异步
        WK->>A: engine.RunAsync：提交 → 轮询 → 终态
    else 模板同步
        WK->>A: engine.Run：单次调用
    end
    A-->>WK: 结果 / 错误
    WK->>DB: 更新 Job（succeeded / failed，写 progress、error）

    loop 前端轮询
        U->>B: GET /api/v1/tasks/{id}
        B->>X: GET /internal/v1/tasks/{id}
        X->>DB: 读 Job
        X-->>U: 当前状态与进度
    end
```

**关键设计点**

| 点 | 说明 |
|---|---|
| 认领模型 | `queued → running`，记录 `attempt`，避免多 worker 重复执行 |
| worker 位置 | 与 HTTP 服务**同进程**（`cmd/server/main.go:68` `go runWorker(...)`），非独立部署单元 |
| 轮询间隔 | 固定 **2 秒** ticker（`cmd/server/main.go:76`） |
| 执行分流 | 按模板决定 `engine.RunAsync` 或 `engine.Run`（`cmd/server/main.go:223/225`） |
| 幂等 | `jobs.idempotency_key` + `request_hash` 唯一约束，重复提交不产生重复任务 |

> ✅ **已修复（阶段 1 第 2 项）**：worker 现有**并发闸门**（`EXECUTION_MAX_CONCURRENT_JOBS`，
> 默认 8）；闸门满时本轮不派发，任务保持 `running` 由下一轮 ticker 重试，不会永久滞留。
> 失败也不再是终态：`Store.FailOrRetry` 做**指数退避重试**（5s 起、上限 5min、20% 抖动），
> 达 `max_attempts` 才进**死信**（`dead_lettered_at`）。

---

## 时序 3 · 前端读数据（BFF 授权转发）

适用：项目列表/详情、资产列表等所有读路径。**前端永远不直连领域服务。**

```mermaid
sequenceDiagram
    autonumber
    participant U as 浏览器
    participant B as web-bff
    participant S as workspace
    participant P as production
    participant A as asset
    participant DB as 对应领域库

    U->>B: GET /api/v1/comic-projects
    Note over B: 身份 = BFF_DEV_*（当前无 OIDC）
    B->>S: 授权校验
    alt 未授权
        S-->>B: 拒绝
        B-->>U: 403
    else 已授权
        B->>P: GET /internal/v1/comic-projects<br/>Bearer PRODUCTION_INTERNAL_TOKEN
        P->>DB: 查询（按 workspace 隔离）
        DB-->>P: 行集
        P-->>B: JSON
        B-->>U: JSON
    end
```

**要点**：`workspace` 是**授权事实源**，其他服务只做数据隔离（按 `workspace_id` 过滤），不各自实现权限模型 —— 对应 AGENTS.md §3.1 服务边界。

---

## 时序 4 · outbox 事件投递（事务性消息）

适用：需要「业务写入」与「消息投递」原子一致的场景。**避免分布式事务**。

```mermaid
sequenceDiagram
    autonumber
    participant P as production :18081
    participant DB as production 库
    participant OB as outbox-relay
    participant X as execution :8085

    Note over P,DB: 业务请求内：同一事务写业务表 + outbox_events
    P->>DB: BEGIN
    P->>DB: INSERT 业务行
    P->>DB: INSERT outbox_events（payload, available_at）
    P->>DB: COMMIT

    loop 轮询
        OB->>DB: SELECT ... FROM outbox_events
        Note over OB,DB: FOR UPDATE SKIP LOCKED 语义<br/>置 locked_at / locked_by / attempts+1
    end
    OB->>X: POST 投递（转换后的事件）
    alt 投递成功
        OB->>DB: published_at = now()，清锁
    else 可重试失败
        OB->>DB: available_at = now() + backoff，attempts 保留，写 last_error
    else 超过重试上限
        OB->>DB: dead_lettered_at = now()，写 last_error（进死信）
    end
```

**关键设计点**：投递语义为 **at-least-once**，消费方必须幂等；`attempts` + 退避 + 死信构成可观测的失败闭环（`services/outbox-relay/cmd/server/main.go`）。

---

## 相关文档

- 系统边界与信任模型见 [01-c4-context-container.md](01-c4-context-container.md)
- 这些时序涉及的表结构见 [03-data-model.md](03-data-model.md)
- Job 与产物的状态流转见 [04-state-machines.md](04-state-machines.md)
