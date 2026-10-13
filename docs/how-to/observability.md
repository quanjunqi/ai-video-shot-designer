# 日志与可观测性规范

本文定义后端服务的日志、健康检查规范。

## 日志

### 用 slog，不要用标准 log 包

新代码一律用 `log/slog`（Go 1.21+ 标准库）。旧代码随改动逐步替换。

### 日志级别

| 级别 | 什么时候用 |
|---|---|
| Debug | 本地排障，生产默认关闭 |
| Info | 正常业务事件（服务启动、任务完成） |
| Warn | 可自愈但需要关注的问题（重试、降级） |
| Error | 需要人工介入的问题（依赖挂了、数据不一致） |

### 日志必须带的字段

所有 Info 及以上日志必须带：

- `service` — 服务名
- `request_id` — 请求 ID，跨服务透传
- `workspace_id` — 租户 ID（可用时）
- `actor_id` — 操作者 ID（可用时）

### 日志里不能出现什么

- API Key、Secret、完整 Authorization 头
- 用户隐私原文（剧本全文等）
- 数据库连接串里的密码

## 健康检查

每个服务必须暴露两个端点：

| 端点 | 含义 | 检查什么 |
|---|---|---|
| `GET /healthz` | 存活 | 进程活着就行，不检查下游依赖 |
| `GET /readyz` | 就绪 | 检查数据库等必需依赖是否可用 |

不要把数据库检查放进 `/healthz`——数据库抖一下容器就重启，会放大故障。

## 审计日志

所有 AI 模型调用必须写审计日志（`gateway_audit_logs` 表）。
审计写入失败必须打 Error 日志，不能静默吞掉。

### 运营报表聚合查询（T2）

成本看板 / 运营报表的数据源，均为 `GET /internal/v1/audit/*` 内部端点（BFF 透传，前端不直连）：

| 端点 | 用途 | 关键参数 |
|---|---|---|
| `GET /internal/v1/audit/stats` | 四维排行 | `dimension=channel\|model\|project\|member`（必填）；`since`/`until`（RFC3339）；`status`/`model_id`/`channel_id`/`user_id`/`project_id`/`feature` 过滤；`limit`（默认 20，上限 50） |
| `GET /internal/v1/audit/stats/trend` | 时间序列 | `granularity=day\|week\|month`（必填）；`dimension`+`dimension_value` 可选下钻；筛选参数同上 |

指标口径（与代码注释一致，前端渲染必须遵守）：

- **调用量**：`calls` = 命中筛选的行数；`success_calls`/`failed_calls` 按状态切分。
  「成功」兼容历史行的 `succeeded` 写法（读侧归一，与列表筛选同口径）。
- **成功率**：`success_calls / calls`，由 handler 计算（0-100）。
- **P95 延迟**：只统计成功行的 `latency_ms` 95 分位（`percentile_cont` 连续插值）；
  无成功行时为 0。失败/超时行不入延迟统计。
- **成本双口径**（T0 语义）：
  - 已校准 `cost_calibrated` = `cost_amount > 0 AND cost_unit <> ''` 的行合计（可进入预算拦截）；
  - 预估 `cost_estimated_calls` = `cost_amount <= 0 OR cost_unit = ''` 的行数（不进入已校准合计）。
- **workspace 隔离**：所有查询以 `X-Workspace-Id` 为硬边界。

SLO：报表查询 P95 < 2s（>5 万行造数断言，本地一次性跑；数据量增大时以索引/聚合下推演进）。
