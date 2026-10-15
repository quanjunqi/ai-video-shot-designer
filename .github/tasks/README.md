# 任务卡台账

> 本目录存放**任务卡**（开工前填写，见 `.github/TASK_TEMPLATE.md`）与其**验收清单**。
> 本文件是索引：新增任务卡后同步一行；**状态**与**验收清单**是 Owner 抽查的依据。

## 约定

| 项 | 约定 |
|---|---|
| 任务卡命名 | `<TASK-ID>-<简述>.md`（如 `TASK-SEC-001-ssrf-guard.md`） |
| 验收清单命名 | `<TASK-ID>-acceptance.md`（与任务卡同目录；规则见 `.agents/skills/acceptance-checklist/SKILL.md` AC-008） |
| 状态取值 | `待开工` / `进行中` / `待验收` / `已验收` / `已关闭`（写在任务卡基本信息的 `**状态**：`，本表随之同步） |
| 与 PR 的关系 | PR body 必填「🎯 验收勾对」小节（AC-005），勾对明细在验收清单文件里 |

## 索引（38 张）

| 任务 ID | 标题 | 优先级 | 状态 | 验收清单 | 文件 |
|---|---|---|---|---|---|
| PLAN-a-and-adr008-2026-10-10 | 实施清单：设置导航收敛（方案 A）＋ 协议文档对齐（ADR-008） | — | — | — | [PLAN-a-and-adr008-2026-10-10.md](PLAN-a-and-adr008-2026-10-10.md) |
| TASK-ASSET-001 | execution 产物落盘 MinIO（第一刀） | P0（ROADMAP #3，明确"建议提前做"） | 已验收（b8b9a31 已合并） | — | [TASK-ASSET-001-artifact-persist.md](TASK-ASSET-001-artifact-persist.md) |
| TASK-AUDIT-001 | 审计能力实施清单（④ 如何做好审计） | — | 待 Owner 确认（本卡只出清单，不动代码） | — | [TASK-AUDIT-001-audit-capability-plan.md](TASK-AUDIT-001-audit-capability-plan.md) |
| TASK-AUDIT-002 | 审计业务归因列（T1） | — | 已验收（PR #165 已合并） | — | [TASK-AUDIT-002-attribution-columns.md](TASK-AUDIT-002-attribution-columns.md) |
| TASK-CREATE-001 | 能力驱动的生成参数控件 schema | P1 | — | — | [TASK-CREATE-001-capability-driven-controls.md](TASK-CREATE-001-capability-driven-controls.md) |
| TASK-CREATE-002 | 智能创作 Composer 布局与结果主舞台 | P1 | — | — | [TASK-CREATE-002-composer-layout.md](TASK-CREATE-002-composer-layout.md) |
| TASK-CREATE-003 | 结果元数据、参数复用与取消/重试 | P1 | — | — | [TASK-CREATE-003-result-detail-reuse.md](TASK-CREATE-003-result-detail-reuse.md) |
| TASK-CREATE-004 | 草稿持久化（按工作台分桶） | P1 | — | — | [TASK-CREATE-004-draft-persistence.md](TASK-CREATE-004-draft-persistence.md) |
| TASK-CREATE-005 | 风格库与镜头语言库接入提示词 | P2 | — | — | [TASK-CREATE-005-style-lens-presets.md](TASK-CREATE-005-style-lens-presets.md) |
| TASK-CREATE-006 | 参数三级披露 + 字段说明 + 表单/JSON 双视图 | P1 | — | — | [TASK-CREATE-006-param-tiers-and-json-view.md](TASK-CREATE-006-param-tiers-and-json-view.md) |
| TASK-FIX-001 | 修复 project_characters 缺失建表迁移与 020 重复主键缺陷 | — | — | — | [TASK-FIX-001-project-characters-migration.md](TASK-FIX-001-project-characters-migration.md) |
| TASK-FIX-002 | 状态模型三处不一致的约束修复 | — | — | — | [TASK-FIX-002-status-model-alignment.md](TASK-FIX-002-status-model-alignment.md) |
| TASK-FIX-003 | 协议模板补齐 `pollPath`（异步轮询路径） | — | — | — | [TASK-FIX-003-protocol-poll-path.md](TASK-FIX-003-protocol-poll-path.md) |
| TASK-INFRA-001 | 迁移执行器引入版本跟踪与校验和 | — | — | — | [TASK-INFRA-001-migration-runner.md](TASK-INFRA-001-migration-runner.md) |
| TASK-INFRA-002 | CI 按改动范围执行 | — | — | — | [TASK-INFRA-002-ci-path-filtering.md](TASK-INFRA-002-ci-path-filtering.md) |
| TASK-INFRA-003 | worker 可靠性（重试 / 死信 / 并发闸门） | — | — | — | [TASK-INFRA-003-worker-reliability.md](TASK-INFRA-003-worker-reliability.md) |
| TASK-INFRA-004 | 把「渠道探测」抽成一份公共能力（B3a） | — | **已确认，可开工**（Owner 2026-10-10：① 直接合并本清… | — | [TASK-INFRA-004-probe-extraction.md](TASK-INFRA-004-probe-extraction.md) |
| TASK-INFRA-005 | P0 全链路集成验收（T13，dev-plan §9） | P0（M5 验收） | 待开工 | — | [TASK-INFRA-005-p0-integration-acceptance.md](TASK-INFRA-005-p0-integration-acceptance.md) |
| TASK-MODEL-001 | T0 权威价格校准 | P0 | 已验收（PR #164 已合并） | — | [TASK-MODEL-001-price-calibration.md](TASK-MODEL-001-price-calibration.md) |
| TASK-MODEL-003 | T2-1 运营报表聚合查询 API | P0（A 轨 T2 第一刀） | 已验收（PR #166 已合并） | — | [TASK-MODEL-003-cost-stats-api.md](TASK-MODEL-003-cost-stats-api.md) |
| TASK-MODEL-004 | T2-2 成本看板页面 + 审计归因展示 | P0（A 轨 T2 第二刀） | 已验收（cb1ab7a 已合并） | — | [TASK-MODEL-004-cost-dashboard-page.md](TASK-MODEL-004-cost-dashboard-page.md) |
| TASK-MODEL-005 | T3 成本预算落地（budget_rules + 预扣/结算状态机） | P0（A 轨 M2） | 已验收（PR #181 已合并，314ec60） | ✅ | [TASK-MODEL-005-budget-rules.md](TASK-MODEL-005-budget-rules.md) |
| TASK-OBS-001 | 任务中心展示「请求参数 / 进度 / 产物」 | — | — | — | [TASK-OBS-001-task-center-detail.md](TASK-OBS-001-task-center-detail.md) |
| TASK-OBS-002 | T11 渠道健康面板 + 三类最小告警 | P0（A 轨 M4） | 已验收（PR #183 已合并，97df90e9） | ✅ | [TASK-OBS-002-channel-health-panel.md](TASK-OBS-002-channel-health-panel.md) |
| TASK-P2-001 | Phase 2.1 — 统一 Executor 接口定义 | P1 | — | — | [TASK-P2-001-executor-interface.md](TASK-P2-001-executor-interface.md) |
| TASK-PROC-001 | 规则流程治理：AC-009 UI 设计稿先行关卡 + 台账同步 | P1 | 已验收（PR #179 已合并） | — | [TASK-PROC-001-rule-governance.md](TASK-PROC-001-rule-governance.md) |
| TASK-ROUTE-001 | 路由层表结构（逻辑模型 + 多渠道候选 + 租户策略） | — | 已验收（PR #145 已合并） | — | [TASK-ROUTE-001-routing-schema.md](TASK-ROUTE-001-routing-schema.md) |
| TASK-ROUTE-002 | 逻辑模型与候选绑定 API（production 服务） | — | 已验收（PR #145 已合并） | — | [TASK-ROUTE-002-logical-models-api.md](TASK-ROUTE-002-logical-models-api.md) |
| TASK-ROUTE-003 | T4 单元熔断三件套（channel_health + 错误码分类 + 多副本共享） | P0（A 轨 M2） | 已验收（PR #177 已合并） | — | [TASK-ROUTE-003-circuit-breaker.md](TASK-ROUTE-003-circuit-breaker.md) |
| TASK-SEC-001 | 模型网关出站 SSRF 防护 | — | — | — | [TASK-SEC-001-ssrf-guard.md](TASK-SEC-001-ssrf-guard.md) |
| TASK-SEC-002 | 配额与限流（QPS 令牌桶 + 日/月成本上限） | — | — | — | [TASK-SEC-002-quota-rate-limit.md](TASK-SEC-002-quota-rate-limit.md) |
| TASK-SEC-003 | auth_type 增加 `token`（无前缀 Authorization） | — | — | — | [TASK-SEC-003-auth-type-token.md](TASK-SEC-003-auth-type-token.md) |
| TASK-SEC-004 | 鉴权改数据驱动（authHeader + authPrefix） | — | — | — | [TASK-SEC-004-auth-header-prefix.md](TASK-SEC-004-auth-header-prefix.md) |
| TASK-SUPPLY-001 | ① 算力接入（设置中心）实施计划 | — | 已验收（供给池各 PR 已合并） | — | [TASK-SUPPLY-001-supply-access-plan-2026-10-11.md](TASK-SUPPLY-001-supply-access-plan-2026-10-11.md) |
| TASK-UI-001 | UI 组件与设计 token 清单（专业级 · 可成长） | P1 | 进行中 | ✅ | [TASK-UI-001-component-inventory.md](TASK-UI-001-component-inventory.md) |
| TASK-UI-002 | 组件库展示页受众分离改版（产品/设计可用） | P1 | 进行中 | ✅ | [TASK-UI-002-ui-kit-redesign.md](TASK-UI-002-ui-kit-redesign.md) |
| TASK-UI-003 | 收敛字号离散步长（建立小字号尺度 token + 加门禁） | P2（不与功能开发抢道；但「加门禁」这一刀建议尽早，先止血） | 待验收 | ✅ | [TASK-UI-003-text-scale-convergence.md](TASK-UI-003-text-scale-convergence.md) |
| TASK-UI-004 | 死代码口径修正 + 零引用组件裁剪 | P2 | 待验收 | ✅ | [TASK-UI-004-dead-code-triage.md](TASK-UI-004-dead-code-triage.md) |

## 现状（自动统计，供 Owner 看缺口）

- 任务卡：**38** 张（含 1 张 PLAN）；写明 **优先级** 20 张、**状态** 14 张。
- 已验收：MODEL-001/003/004/**005**、AUDIT-002、ROUTE-001/002/**003**、ASSET-001、SUPPLY-001、UI-001~004、PROC-001（共 14 张，代码/规则均已合并 develop）。
- 待开工（底座 P0 缺口）：**OBS-002（T11 健康面板）、INFRA-005（T13 验收）**——下一刀为 T11（OBS-002）。
- 验收清单：**5** 个（约定每卡一个；缺口 = 「验收清单」列为 `—` 的行；**未开工的卡在开工前产出**）。
- 验收留痕机制自 `TASK-UI-001` 起启用。

