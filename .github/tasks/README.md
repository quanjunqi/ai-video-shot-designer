# 任务卡台账

> 本目录存放**任务卡**（开工前填写，见 `.github/TASK_TEMPLATE.md`）、其**验收清单**与**开发日志**。
> 本文件是人读索引（每卡一行）；机器可读视图见 **`ledger.json`**（AC-011，审计 agent 消费，与本表同步维护）。
> **状态**与**验收清单**是 Owner 抽查的依据。

## 约定

| 项 | 约定 |
|---|---|
| 任务工作区 | **一个任务一个文件夹**：`.github/tasks/<TASK-ID>/`（新任务必用；存量平铺渐进迁移） |
| 任务卡 | `.github/tasks/<TASK-ID>/task.md`（YAML front-matter：status/priority/depends_on；无任务卡时用 `<日期>-<简述>/`） |
| 验收清单 | `.github/tasks/<TASK-ID>/acceptance.md`（规则见 `.agents/skills/acceptance-checklist/SKILL.md` AC-008） |
| 开发日志 | `.github/tasks/<TASK-ID>/devlog.md` + `devlog.events.json`（AC-010/AC-011） |
| 状态取值 | `待开工` / `进行中` / `待验收` / `已验收` / `已关闭`（写在任务卡 front-matter，本表随之同步） |
| 与 PR 的关系 | PR body 必填「🎯 验收勾对」小节（AC-005），勾对明细在验收清单文件里 |

## 索引（40 张）

| 任务 ID | 标题 | 优先级 | 状态 | 验收清单 | 文件 |
|---|---|---|---|---|---|
| PLAN-a-and-adr008-2026-10-10 | 实施清单：设置导航收敛（方案 A）＋ 协议文档对齐（ADR-008） | — | — | — | [PLAN-a-and-adr008-2026-10-10.md](PLAN-a-and-adr008-2026-10-10.md) |
| TASK-ASSET-001 | execution 产物落盘 MinIO（第一刀） | P0（ROADMAP #3，明确"建议提前做"） | 已验收（b8b9a31 已合并） | — | [TASK-ASSET-001-artifact-persist.md](TASK-ASSET-001-artifact-persist.md) |
| TASK-AUDIT-001 | 审计能力实施清单（④ 如何做好审计） | P0（排期第一批第 5 刀） | 已验收（PR #197 已合并，2d32e05；D1–D7 全过，D8 访问控制归 AUTH-001，D9 不做） | ✅ | [TASK-AUDIT-001/task.md](TASK-AUDIT-001/task.md) |
| TASK-AUDIT-002 | 审计业务归因列（T1） | — | 已验收（PR #165 已合并） | — | [TASK-AUDIT-002-attribution-columns.md](TASK-AUDIT-002-attribution-columns.md) |
| TASK-AUTH-001 | 模型中心权限矩阵（三角色，T13 判据 5；Owner 2026-10-15 拍板提 P0，推翻「暂不含多角色管理」） | **P0** | 已合并（PR #203，fbffb64；判据 1/2/4/5 ✅、判据 3 ✅△、判据 6 ⏳ 待 Owner 真机走查） | ✅ | [TASK-AUTH-001/task.md](TASK-AUTH-001/task.md) |
| TASK-CREATE-001 | 能力驱动的生成参数控件 schema | P1 | — | — | [TASK-CREATE-001-capability-driven-controls.md](TASK-CREATE-001-capability-driven-controls.md) |
| TASK-CREATE-002 | 智能创作 Composer 布局与结果主舞台 | P1 | — | — | [TASK-CREATE-002-composer-layout.md](TASK-CREATE-002-composer-layout.md) |
| TASK-CREATE-003 | 结果元数据、参数复用与取消/重试 | P1 | — | — | [TASK-CREATE-003-result-detail-reuse.md](TASK-CREATE-003-result-detail-reuse.md) |
| TASK-CREATE-004 | 草稿持久化（按工作台分桶） | P1 | — | — | [TASK-CREATE-004-draft-persistence.md](TASK-CREATE-004-draft-persistence.md) |
| TASK-CREATE-005 | 风格库与镜头语言库接入提示词 | P2 | — | — | [TASK-CREATE-005-style-lens-presets.md](TASK-CREATE-005-style-lens-presets.md) |
| TASK-CREATE-006 | 参数三级披露 + 字段说明 + 表单/JSON 双视图 | P1 | — | — | [TASK-CREATE-006-param-tiers-and-json-view.md](TASK-CREATE-006-param-tiers-and-json-view.md) |
| TASK-FIX-001 | 修复 project_characters 缺失建表迁移与 020 重复主键缺陷 | P0（阻塞级） | 已验收（e38b033 已合并；Docker 三类验证 2026-10-15） | ✅ | [TASK-FIX-001-project-characters-migration.md](TASK-FIX-001-project-characters-migration.md) |
| TASK-FIX-002 | 状态模型三处不一致的约束修复 | — | — | — | [TASK-FIX-002-status-model-alignment.md](TASK-FIX-002-status-model-alignment.md) |
| TASK-FIX-003 | 协议模板补齐 `pollPath`（异步轮询路径） | — | — | — | [TASK-FIX-003-protocol-poll-path.md](TASK-FIX-003-protocol-poll-path.md) |
| TASK-FIX-004 | 任务中心 /tasks 崩溃修复（KIND_META 缺 kind=text，T13 验收缺口 1） | P0 | 已验收（PR #186 已合并，1d498cc） | — | [TASK-FIX-004-task-center-kind-crash.md](TASK-FIX-004-task-center-kind-crash.md) |
| TASK-FIX-005 | 创建页积分 NaN/undefined 兜底（T13 验收缺口 2） | P1 | 已验收（PR #186 已合并，1d498cc） | — | [TASK-FIX-005-credit-nan-display.md](TASK-FIX-005-credit-nan-display.md) |
| TASK-IA-001 | 模型中心/设置中心信息架构整改（预算迁入成本与用量，方案 A；Owner 2026-10-15 拍板） | P1 | 待开工（排期第二批第 9 刀，设计稿先行） | 开工前产出 | [TASK-IA-001-ia-budget-relocation.md](TASK-IA-001-ia-budget-relocation.md) |
| TASK-INFRA-001 | 迁移执行器引入版本跟踪与校验和 | P0（基建） | 已验收（d612122 已合并；Docker 8 类场景验证 2026-10-15） | ✅ | [TASK-INFRA-001-migration-runner.md](TASK-INFRA-001-migration-runner.md) |
| TASK-INFRA-002 | CI 按改动范围执行 | — | — | — | [TASK-INFRA-002-ci-path-filtering.md](TASK-INFRA-002-ci-path-filtering.md) |
| TASK-INFRA-003 | worker 可靠性（重试 / 死信 / 并发闸门） | P0（排期第一批第 7 刀） | 已验收（PR #201 已合并，e5c710ab；8/8 验收标准） | ✅ | [TASK-INFRA-003/task.md](TASK-INFRA-003/task.md) |
| TASK-INFRA-004 | 把「渠道探测」抽成一份公共能力（B3a） | P1 | 已验收（PR #193 已合并；7/7 判据） | ✅ | [TASK-INFRA-004-probe-extraction.md](TASK-INFRA-004-probe-extraction.md) |
| TASK-INFRA-005 | P0 全链路集成验收（T13，dev-plan §9） | P0（M5 验收） | 已验收（判据 1/2/3/4 ✅；判据 5 依赖 AUTH-001 已建卡 P0，待开工） | — | [TASK-INFRA-005-p0-integration-acceptance.md](TASK-INFRA-005-p0-integration-acceptance.md) |
| TASK-MODEL-001 | T0 权威价格校准 | P0 | 已验收（PR #164 已合并） | — | [TASK-MODEL-001-price-calibration.md](TASK-MODEL-001-price-calibration.md) |
| TASK-MODEL-003 | T2-1 运营报表聚合查询 API | P0（A 轨 T2 第一刀） | 已验收（PR #166 已合并） | — | [TASK-MODEL-003-cost-stats-api.md](TASK-MODEL-003-cost-stats-api.md) |
| TASK-MODEL-004 | T2-2 成本看板页面 + 审计归因展示 | P0（A 轨 T2 第二刀） | 已验收（cb1ab7a 已合并） | — | [TASK-MODEL-004-cost-dashboard-page.md](TASK-MODEL-004-cost-dashboard-page.md) |
| TASK-MODEL-005 | T3 成本预算落地（budget_rules + 预扣/结算状态机） | P0（A 轨 M2） | 已验收（PR #181 已合并，314ec60） | ✅ | [TASK-MODEL-005-budget-rules.md](TASK-MODEL-005-budget-rules.md) |
| TASK-OBS-001 | 任务中心展示「请求参数 / 进度 / 产物」 | — | — | — | [TASK-OBS-001-task-center-detail.md](TASK-OBS-001-task-center-detail.md) |
| TASK-OBS-002 | T11 渠道健康面板 + 三类最小告警 | P0（A 轨 M4） | 已验收（PR #183 已合并，97df90e9） | ✅ | [TASK-OBS-002-channel-health-panel.md](TASK-OBS-002-channel-health-panel.md) |
| TASK-P2-001 | Phase 2.1 — 统一 Executor 接口定义 | P1 | — | — | [TASK-P2-001-executor-interface.md](TASK-P2-001-executor-interface.md) |
| TASK-PROC-001 | 规则流程治理：AC-009 UI 设计稿先行关卡 + 台账同步 | P1 | 已验收（PR #179 已合并） | — | [TASK-PROC-001-rule-governance.md](TASK-PROC-001-rule-governance.md) |
| TASK-PROC-002 | 开发日志机制落地（AC-010，审计可还原开发过程） | P1 | 已验收（PR #192 已合并） | ✅ | [TASK-PROC-002-devlog-mechanism.md](TASK-PROC-002-devlog-mechanism.md) |
| TASK-ROUTE-001 | 路由层表结构（逻辑模型 + 多渠道候选 + 租户策略） | — | 已验收（PR #145 已合并） | — | [TASK-ROUTE-001-routing-schema.md](TASK-ROUTE-001-routing-schema.md) |
| TASK-ROUTE-002 | 逻辑模型与候选绑定 API（production 服务） | — | 已验收（PR #145 已合并） | — | [TASK-ROUTE-002-logical-models-api.md](TASK-ROUTE-002-logical-models-api.md) |
| TASK-ROUTE-003 | T4 单元熔断三件套（channel_health + 错误码分类 + 多副本共享） | P0（A 轨 M2） | 已验收（PR #177 已合并） | — | [TASK-ROUTE-003-circuit-breaker.md](TASK-ROUTE-003-circuit-breaker.md) |
| TASK-SEC-001 | 模型网关出站 SSRF 防护 | P0（阶段1 第1项） | 已验收（PR #195 已合并，0b06a8d；8/8 验收标准） | ✅ | [TASK-SEC-001/task.md](TASK-SEC-001/task.md) |
| TASK-SEC-002 | 配额与限流（QPS 令牌桶 + 日/月成本上限） | P0（排期第一批第 6 刀） | 已验收（PR #<待开>；10/10 验收标准） | ✅ | [TASK-SEC-002/task.md](TASK-SEC-002/task.md) |
| TASK-SEC-003 | auth_type 增加 `token`（无前缀 Authorization） | — | — | — | [TASK-SEC-003-auth-type-token.md](TASK-SEC-003-auth-type-token.md) |
| TASK-SEC-004 | 鉴权改数据驱动（authHeader + authPrefix） | — | — | — | [TASK-SEC-004-auth-header-prefix.md](TASK-SEC-004-auth-header-prefix.md) |
| TASK-SUPPLY-001 | ① 算力接入（设置中心）实施计划 | — | 已验收（供给池各 PR 已合并） | — | [TASK-SUPPLY-001-supply-access-plan-2026-10-11.md](TASK-SUPPLY-001-supply-access-plan-2026-10-11.md) |
| TASK-UI-001 | UI 组件与设计 token 清单（专业级 · 可成长） | P1 | 进行中 | ✅ | [TASK-UI-001-component-inventory.md](TASK-UI-001-component-inventory.md) |
| TASK-UI-002 | 组件库展示页受众分离改版（产品/设计可用） | P1 | 进行中 | ✅ | [TASK-UI-002-ui-kit-redesign.md](TASK-UI-002-ui-kit-redesign.md) |
| TASK-UI-003 | 收敛字号离散步长（建立小字号尺度 token + 加门禁） | P2（不与功能开发抢道；但「加门禁」这一刀建议尽早，先止血） | 待验收 | ✅ | [TASK-UI-003-text-scale-convergence.md](TASK-UI-003-text-scale-convergence.md) |
| TASK-UI-004 | 死代码口径修正 + 零引用组件裁剪 | P2 | 待验收 | ✅ | [TASK-UI-004-dead-code-triage.md](TASK-UI-004-dead-code-triage.md) |

## 现状（自动统计，供 Owner 看缺口）

- 任务卡：**42** 张（含 1 张 PLAN）；写明 **优先级** 23 张、**状态** 20 张。
- 已验收：MODEL-001/003/004/**005**、AUDIT-002、ROUTE-001/002/**003**、ASSET-001、SUPPLY-001、UI-001~004、PROC-001/002、**INFRA-005（T13 验收）、FIX-001/004/005、INFRA-001/003/004、SEC-001/002、AUDIT-001**（共 24 张，代码/规则均已合并 develop）。
- 已合并（P0）：**AUTH-001（模型中心权限矩阵，T13 判据 5，PR #203 已合并 fbffb64）**；判据 6（Owner 真机三角色走查）待闭合
- 待走查：**AUTH-001 判据 6（T13 判据 5，TopBar dev 身份切换）**
- 待开工（P1）：**IA-001（导航整改，预算迁入成本与用量，设计稿先行）**；CREATE-001~006 / OBS-001 / FIX-002 / FIX-003 / P2-001 按排期推进。
- 排期唯一事实源：`docs/product/task-queue-plan-2026-10-15.md`（依赖链 + 批次 + 防重演约束）。
- 验收清单：**10** 个（约定每卡一个；缺口 = 「验收清单」列为 `—` 的行；**未开工的卡在开工前产出**）。
- 验收留痕机制自 `TASK-UI-001` 起启用。

