# ADR-009：工作区级供给池与策展（Workspace-scoped supply pool & curation）

- 状态：**已接受**（Owner 于 2026-10-11 确认「按照你的建议执行」，四项决定全部按建议通过）
- 关联：ADR-003（逻辑模型路由层）· ADR-004（中转站与供给池）· 迁移 `038_workspace_scoped_pool.sql`
- 号段认领：production 迁移 **038**（在既有 024–039 段内）· ADR **009** · 任务卡见 `.github/tasks/`

## 1. 问题

平台本质是**多工作区**，每个工作区可能接**自己的中转站**。但供给池与目录都是平台级：

| 事实 | 判据（2026-10-11） |
|---|---|
| 三张关键表都没有 `workspace_id` | `channel_models` PK=`(channel_id, provider_model)` · `model_catalog` UNIQUE=`(family, channel_id)` · `channel_model_syncs` IDX=`(channel_id, started_at DESC)` |
| 凭据按 `(workspace_id, channel_id)` reveal | workspace 的 `channel_credentials` · execution/production 的 reveal 调用 |
| 逻辑模型也无线索 | `logical_models` PK=`(id)` |

由此产生两个真问题：

1. **互相污染**：各工作区的上游会灌进同一张 `channel_models`（今天 79 行全是平台级）
2. **F3 耦合**：凭据按 `(workspace_id, channel_id)` 取，而供给池是平台级 ⇒ 实际做法退化成
   "**平台渠道行的 id 必须等于工作区凭据的 id**"，否则取不到密钥 ⇒ 而"只有凭据、没有平台渠道行"
   恰恰是中转站的常态（本轮实测：`pearapi` 就是这种情况，只能靠手建同 id 的平台行绕过）

## 2. 决定

| # | 决定 | 理由 |
|---|---|---|
| **1** | **`workspace_id = ''`（空串）= 平台共享**，非空 = 工作区私有 | 保留"平台内置渠道给所有工作区用"这一现状；实现上用 `NOT NULL DEFAULT ''` 而非 NULL，因为 `channel_models` 的主键要纳入该列，而主键列不允许 NULL（四张表统一口径） |
| **2** | **同步配置放在 workspace 的 `user_channels`**（配置跟着渠道走），production 通过既有 workspace API 读取 | 渠道归 workspace（AGENTS §3.1）；production 本来就要调 workspace 的 reveal ⇒ 不新增依赖方向；避免"配置与渠道分居两个服务" |
| **3** | **逻辑模型 id 保持全局唯一**，`workspace_id` 只用于归属与筛选 | `025` 原文「一旦对外使用即为契约，不得改名」⇒ 全局唯一保护对外契约 |
| **4** | 工作区服务的迁移号段：**借用/新开 001–009**，并把 AGENTS §12.3 表更新作为**草稿报 Owner 批准** | §9.0：改 AGENTS.md 属待命区 |

补充（实现约束，取证得出）：
- `model_catalog.id` **被 `model_catalog_versions.id` 外键引用** ⇒ 主键**不可改** ⇒ 行 id 仍全局唯一；
  策展新行生成 `mod_xxx`，不得复用他工作区的 id
- execution 取目录时**已经发送** `X-Workspace-Id` / `X-Actor-Id`（`client.go:72-79`）⇒
  跨服务契约**无需改动**，只需 production 开始使用它

## 3. 分阶段实施（每阶段一个 PR，均可独立回滚）

| 阶段 | 内容 | 验收判据 |
|---|---|---|
| **A** | 迁移 038：四表加 `workspace_id`；`channel_models` 主键改 `(workspace_id, channel_id, provider_model)`；`model_catalog` 唯一键改 `(workspace_id, family, channel_id)`；补索引与列注释。**不改任何读写** | 一次性库上：迁移成功 · 现有行数不变（79/18/7/2）· 全部回填为 `''` · 同 `(workspace_id, family, channel_id)` 重复被拒 **且不同工作区可各存一行** |
| **B** | `workspace.user_channels` 加 `sync_kind/sync_models_path/sync_pricing_path/trust_note`；production 目录/池/策展按传入工作区**合并**（工作区行覆盖平台行） | A 工作区同步 ⇒ 行带 `workspace_id=A` · **B 工作区的池与目录不受影响**（SQL 断言） |
| **C** | production 返回该工作区合并后的目录；`Resolve` 不改；顺手修 worker 里 `cred.Reveal(ctx,"ws_dev",…)` 的硬编码工作区 | A 的 job 只解析到 A 的行 + 平台行 · 真实生成仍成功 |
| **D** | 策展界面（未策展 → 写 `model_catalog`）+ 渠道页同步配置入口 | A 策展后 B 看不到 · 渠道页可自行配同步并点成功 |

## 4. 回滚

四阶段全部是**加列/加索引/读路径**，无 `DROP TABLE`/`DELETE`/`ALTER … DROP COLUMN`：

- 阶段 A 回滚：`ALTER TABLE … DROP COLUMN workspace_id`（在确认无代码读取后）
- 阶段 B/C 回滚：停止按工作区过滤（读路径退回 `workspace_id=''` 的平台集合）
- 无数据丢失风险：现有行始终保留，`workspace_id` 由 DEFAULT 回填

## 5. 风险与对策

| 风险 | 对策 |
|---|---|
| 线上表加/换主键与唯一约束会短暂持锁 | 先在**一次性库**上用**真实数据副本**演练（本仓库既有做法）；迁移只做 DDL、不做长事务 |
| 忘记某个读路径导致"看到别人工作区的模型" | 阶段 B 的验收判据就是**跨工作区不可见**断言；并复用"接线不变量"的测试思路 |
| worker 硬编码 `ws_dev` | 阶段 C 一并修（今天已取证） |
| 前端合并语义与后端不一致 | 已有前端不变量测试（`channel-sync.server.test.ts`）；阶段 B 同步补断言 |
