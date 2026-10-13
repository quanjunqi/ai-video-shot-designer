# TASK-AUDIT-002 审计业务归因列（T1）

> 目标：`gateway_audit_logs` 可回答「钱花在哪个项目/分镜/功能」。
> dev-plan v1.3 §7 T1；方案 §3.7 透传协议。

## 目标（一句话）

为 `gateway_audit_logs` 补齐 `shot_id`/`feature` 归因列，并让新增 AI 调用（同步 + 异步提交路径）的审计行携带完整业务归因（project/episode/shot/feature）。

## 背景与相关文件

- **缺口（已探查确认）**：
  - `gateway_audit_logs` 已有 `project_id/episode_id/asset_id`，缺 `shot_id`、`feature`；
  - `job.Input/Job` 已有 `ShotID`，无 `Feature`；`jobs` 表有 `shot_id` 列，无 `feature` 列；
  - 同步路径（`/v1/generate`）归因取自 `in.Metadata`，只提取 project/episode/asset，不提取 shot/feature；
  - **异步提交路径（`POST /internal/v1/execution-intents`、`POST /internal/v1/tasks`）不写审计行**（worker `UpdateResultByJobID` n==0 日志证实）⇒ 异步（视频类长任务，主要付费路径）无审计、无归因、T0 成本也无处回写；
  - `createFromIntent` 请求体未解析 `shot_id`；`create` 解析了 `shot_id` 但无 `feature`。
- **相关文件**：
  - `services/execution/internal/audit/store.go`（Log/Insert）
  - `services/execution/internal/job/store.go`（Input/Job/INSERT/RETURNING/scan）
  - `services/execution/internal/httpapi/handler.go`（createFromIntent/create/writeAudit）
  - `services/execution/cmd/server/main.go`（auditTerminalT，worker 终态更新，无需改）
  - `services/execution/migrations/013_audit_attribution.sql`（新）

## 范围 / 非范围

**范围**：
1. 迁移 013：`gateway_audit_logs` + `shot_id TEXT`、`feature TEXT`；`jobs` + `feature TEXT`（与 episode/shot 同构，`feature` 非空校验不设——缺失容忍）
2. audit Log + Insert 支持 shot_id/feature 列
3. job Input/Job 贯穿 feature（jobs 表 feature 列 + INSERT/RETURNING/scan）
4. 同步路径：`writeAudit` 从 metadata 提取 `shot_id`/`feature` 写入
5. **异步提交路径创建 submit-time 审计行**（status=`queued`，含归因 + job_id），worker 终态更新（T0 已接，本次受益）：终结「异步任务零审计」
6. createFromIntent/create 请求体补 `shot_id`/`feature` 解析
7. **迁移 014（验收暴露）**：`channel_id`/`provider_model` 从身份字段移入可回填完成字段 —— 011 触发器曾拦截 worker 终态补齐供给单元（真机 ERROR: identity columns are immutable）
8. **failOrRetry 终态补齐（验收暴露）**：命中模型后的失败/死信终态也带 channel/provider（空串不覆盖）

**非范围**：
- 存量审计归因回填（§3.7：置空可容忍，P1 可选后台任务）
- 归因明细查询权限落码（T10：GATE-4 矩阵）
- 审计保留期/归档（P1）
- 报表聚合（T2）
- 异步 worker 文本任务「无 image URL 即失败」的既有缺陷（验收发现：文本异步调用上游成功但被图片提取逻辑误判失败；记入 backlog，独立于 T1）
- seed 模型 provider_model 缺失 / 模板参数映射不完整等本地数据问题（验收已用本地 UPDATE 回填，属开发数据修复）

## 验收标准（判据四要素）

| # | 判据 | 对象 | 例外 |
|---|---|---|---|
| 1 | 迁移 013+014 可应用（execution-migrate 实机，校验和执行器） | 本地 execution 库 schema_migrations | 本地 compose 未起时由 CI 把关（本任务将实机跑） |
| 2 | 同步调用（/v1/generate）审计行含 shot_id/feature（metadata 携带时） | handler_test 断言 Insert 参数或契约测试 | metadata 缺字段时置空不报错 |
| 3 | intent/tasks 提交创建审计行（status=queued，含归因+job_id） | 集成测试断言（真库） | 提交即失败路径（校验失败）不创建 |
| 4 | 异步终态更新命中 submit-time 行并**补齐供给单元**（channel_id/provider_model） | 集成测试 TestTerminalFillsSupplyUnit + 真机验收（channel=minimax/provider=MiniMax-Text-01） | 历史任务（无 submit-time 行）仍 n==0 |
| 5 | 缺失归因字段不报错、不阻塞失败路径 | 集成测试双断言（含归因持久化 + 缺省置空容忍） | — |
| 6 | `go build ./... && go vet ./... && go test ./... -race` 绿 | execution 全包 | CI 6 道关为准 |
| 7 | 真机验收：本地服务启动后提交真实 intent，审计行归因完整、终态回填供给单元 | ws_dev/user_dev + execution 8085 | 上游真实调用失败不影响审计链路验收（失败终态同样回填） |

## 测试命令

```bash
cd services/execution && go build ./... && go vet ./... && go test ./... -race
cd services/production && go build ./... && go test ./...   # 如涉及
```

## 约束与禁止事项

- 迁移只增不改（号段 execution 013，011/012 已用）
- 禁 `git add -A`；按路径 add + `git diff --cached --name-only` 核对
- submit-time 审计 status 用 `queued`（契约 openapi 词），不得自造词
- 归因缺失一律置空，禁止报错/阻塞主流程（含失败路径）
- 审计写入失败仍不得阻断主流程（D1），但必须打日志
- 不引入新服务/新表；不动 ADR-003 候选上限与审计不变量

## 输出

- 分支 `feature/t1-attribution-1013` → PR → develop（merge commit）→ 删分支/worktree
- 任务卡 `.github/tasks/TASK-AUDIT-002-attribution-columns.md`
