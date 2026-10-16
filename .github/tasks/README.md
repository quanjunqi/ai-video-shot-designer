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

## 索引（52 张）

| 任务 ID | 标题 | 优先级 | 状态 | 验收清单 | 文件 |
|---|---|---|---|---|---|
| PLAN-a-and-adr008-2026-10-10 | 实施清单：设置导航收敛（方案 A）＋ 协议文档对齐（ADR-008） | — | — | — | [PLAN-a-and-adr008-2026-10-10.md](PLAN-a-and-adr008-2026-10-10.md) |
| TASK-ASSET-001 | execution 产物落盘 MinIO（第一刀） | P0（ROADMAP #3，明确"建议提前做"） | 已验收（b8b9a31 已合并） | — | [TASK-ASSET-001-artifact-persist.md](TASK-ASSET-001-artifact-persist.md) |
| TASK-AUDIT-001 | 审计能力实施清单（④ 如何做好审计） | P0（排期第一批第 5 刀） | 已验收（PR #197 已合并，2d32e05；D1–D7 全过，D8 访问控制归 AUTH-001，D9 不做） | ✅ | [TASK-AUDIT-001/task.md](TASK-AUDIT-001/task.md) |
| TASK-AUDIT-002 | 审计业务归因列（T1） | — | 已验收（PR #165 已合并） | — | [TASK-AUDIT-002-attribution-columns.md](TASK-AUDIT-002-attribution-columns.md) |
| TASK-AUTH-001 | 模型中心权限矩阵（三角色，T13 判据 5；Owner 2026-10-15 拍板提 P0，推翻「暂不含多角色管理」） | **P0** | 待验收（PR #203 已合并 fbffb64；判据 1/2/4/5 ✅、判据 3 ✅△、判据 6 ⏳ 待 Owner 真机走查） | ✅ | [TASK-AUTH-001/task.md](TASK-AUTH-001/task.md) |
| TASK-CREATE-001 | 能力驱动的生成参数控件 schema | P1 | 待验收（✅ 代码侧已实现；L3 未做，无交付记录） | — | [TASK-CREATE-001-capability-driven-controls.md](TASK-CREATE-001-capability-driven-controls.md) |
| TASK-CREATE-002 | 智能创作 Composer 布局与结果主舞台 | P1 | 待验收（✅ 代码侧已实现；交付记录自认 L3 未做） | — | [TASK-CREATE-002-composer-layout.md](TASK-CREATE-002-composer-layout.md) |
| TASK-CREATE-003 | 结果元数据、参数复用与取消/重试 | P1 | 待验收（✅ 代码侧已实现；交付记录自认 L3 未做） | — | [TASK-CREATE-003-result-detail-reuse.md](TASK-CREATE-003-result-detail-reuse.md) |
| TASK-CREATE-004 | 草稿持久化（按工作台分桶） | P1 | 待验收（✅ 代码侧已实现；交付记录自认 L3 未做） | — | [TASK-CREATE-004-draft-persistence.md](TASK-CREATE-004-draft-persistence.md) |
| TASK-CREATE-005 | 风格库与镜头语言库接入提示词 | P2 | 待验收（✅ 代码侧已实现；交付记录自认 L3 未做） | — | [TASK-CREATE-005-style-lens-presets.md](TASK-CREATE-005-style-lens-presets.md) |
| TASK-CREATE-006 | `capability.aspectRatios` 显式声明（ADR 分片 6 · D3-B） | P1（分片台账 Priority 1） | 待验收（机制+前端数据示范+测试已交付；**开工核实证伪了契约/后端/迁移三项范围**，详见卡内「范围修正」） | ✅ | [TASK-CREATE-006/task.md](TASK-CREATE-006/task.md) |
| TASK-CREATE-010 | 参数三级披露 + 字段说明 + 表单/JSON 双视图（原误标 CREATE-006，已正名） | P1 | 待验收（✅ 代码侧已实现；ADR 分片 6 = 后端 `aspectRatios` 已归位为独立待办） | — | [TASK-CREATE-010-param-tiers-and-json-view.md](TASK-CREATE-010-param-tiers-and-json-view.md) |
| TASK-FIX-001 | 修复 project_characters 缺失建表迁移与 020 重复主键缺陷 | P0（阻塞级） | 已验收（e38b033 已合并；Docker 三类验证 2026-10-15） | ✅ | [TASK-FIX-001-project-characters-migration.md](TASK-FIX-001-project-characters-migration.md) |
| TASK-FIX-002 | 状态模型三处不一致的约束修复 | — | 已验收（✅ 已实现；三迁移 + 文档 + CHANGELOG 齐备，逐条对上其验收标准） | — | [TASK-FIX-002-status-model-alignment.md](TASK-FIX-002-status-model-alignment.md) |
| TASK-FIX-003 | 协议模板补齐 `pollPath`（异步轮询路径） | — | 已验收（✅ 已实现；UI 字段/校验/预览 + 迁移 029，4/4 验收标准命中） | — | [TASK-FIX-003-protocol-poll-path.md](TASK-FIX-003-protocol-poll-path.md) |
| TASK-FIX-004 | 任务中心 /tasks 崩溃修复（KIND_META 缺 kind=text，T13 验收缺口 1） | P0 | 已验收（PR #186 已合并，1d498cc） | — | [TASK-FIX-004-task-center-kind-crash.md](TASK-FIX-004-task-center-kind-crash.md) |
| TASK-FIX-005 | 创建页积分 NaN/undefined 兜底（T13 验收缺口 2） | P1 | 已验收（PR #186 已合并，1d498cc） | — | [TASK-FIX-005-credit-nan-display.md](TASK-FIX-005-credit-nan-display.md) |
| TASK-IA-001 | 模型中心/设置中心信息架构整改（预算迁入成本与用量，方案 A；Owner 2026-10-15 拍板） | P1（排期 v2 §3.3 第 2 波首位） | 进行中（设计稿 v1 待 Owner 评审；AC-009 未过评审不写码） | ✅ | [TASK-IA-001/task.md](TASK-IA-001/task.md) |
| TASK-INFRA-001 | 迁移执行器引入版本跟踪与校验和 | P0（基建） | 已验收（d612122 已合并；Docker 8 类场景验证 2026-10-15） | ✅ | [TASK-INFRA-001-migration-runner.md](TASK-INFRA-001-migration-runner.md) |
| TASK-INFRA-002 | CI 按改动范围执行 | — | 待验收（✅ 判据 3/4/5/6 已实测；「8 条路径单测」实为手工命令） | — | [TASK-INFRA-002-ci-path-filtering.md](TASK-INFRA-002-ci-path-filtering.md) |
| TASK-INFRA-003 | worker 可靠性（重试 / 死信 / 并发闸门） | P0（排期第一批第 7 刀） | 已验收（PR #201 已合并，e5c710ab；8/8 验收标准） | ✅ | [TASK-INFRA-003/task.md](TASK-INFRA-003/task.md) |
| TASK-INFRA-004 | 把「渠道探测」抽成一份公共能力（B3a） | P1 | 已验收（PR #193 已合并；7/7 判据） | ✅ | [TASK-INFRA-004-probe-extraction.md](TASK-INFRA-004-probe-extraction.md) |
| TASK-INFRA-005 | P0 全链路集成验收（T13，dev-plan §9） | P0（M5 验收） | 已验收（判据 1/2/3/4 ✅；判据 5 依赖 AUTH-001 已建卡 P0，待开工） | — | [TASK-INFRA-005-p0-integration-acceptance.md](TASK-INFRA-005-p0-integration-acceptance.md) |
| TASK-INFRA-006 | T13 走查自动化（headless Chrome + 三角色切换 + 五站截图） | P0（T13 收官的使能项） | 进行中（⚠️ **阻塞 B-001：运行中的 BFF 是旧二进制**，`/api/v1/me` 404 而源码已注册 ⇒ 须先重建栈；已据此新增「栈新鲜度」判据 11） | ✅ | [TASK-INFRA-006/task.md](TASK-INFRA-006/task.md) |
| TASK-MODEL-001 | T0 权威价格校准 | P0 | 已验收（PR #164 已合并） | — | [TASK-MODEL-001-price-calibration.md](TASK-MODEL-001-price-calibration.md) |
| TASK-MODEL-003 | T2-1 运营报表聚合查询 API | P0（A 轨 T2 第一刀） | 已验收（PR #166 已合并） | — | [TASK-MODEL-003-cost-stats-api.md](TASK-MODEL-003-cost-stats-api.md) |
| TASK-MODEL-004 | T2-2 成本看板页面 + 审计归因展示 | P0（A 轨 T2 第二刀） | 已验收（cb1ab7a 已合并） | — | [TASK-MODEL-004-cost-dashboard-page.md](TASK-MODEL-004-cost-dashboard-page.md) |
| TASK-MODEL-005 | T3 成本预算落地（budget_rules + 预扣/结算状态机） | P0（A 轨 M2） | 已验收（PR #181 已合并，314ec60） | ✅ | [TASK-MODEL-005-budget-rules.md](TASK-MODEL-005-budget-rules.md) |
| TASK-MODEL-006 | 供给单元池真实化（底座收尾 · dev-plan T5+T6+T12） | **P0（底座收尾——业务开发的前置）** | 进行中（数据/设计输入已齐；**第一刀「删 mock 渠道」受阻 B-003**：物理删除会连带删 56 条归档历史，已列三方案待 Owner 择一） | ✅ | [TASK-MODEL-006/task.md](TASK-MODEL-006/task.md) |
| TASK-OBS-001 | 任务中心展示「请求参数 / 进度 / 产物」 | P1（排期 v2 §3.2 并行候选池） | 待验收（详情抽屉已交付；4 项证据不足如实列入未过项） | ✅ | [TASK-OBS-001/task.md](TASK-OBS-001/task.md) |
| TASK-OBS-002 | T11 渠道健康面板 + 三类最小告警 | P0（A 轨 M4） | 已验收（PR #183 已合并，97df90e9） | ✅ | [TASK-OBS-002-channel-health-panel.md](TASK-OBS-002-channel-health-panel.md) |
| TASK-OBS-003 | 异步任务耗时落库（V5c） | **P1（可观测性对最贵路径失明）** | 待验收（V5c 已转绿：20 通过 / 0 失败，EXIT=0；判据 1/2/3/6 通过，4/5 已如实修正） | ✅ | [TASK-OBS-003/task.md](TASK-OBS-003/task.md) |
| TASK-P2-001 | Phase 2.1 — 统一 Executor 接口定义 | P1 | 待验收（✅ executor.go 接口 + api_connector 在位；运行时行为未验） | — | [TASK-P2-001-executor-interface.md](TASK-P2-001-executor-interface.md) |
| TASK-PROC-001 | 规则流程治理：AC-009 UI 设计稿先行关卡 + 台账同步 | P1 | 已验收（PR #179 已合并） | — | [TASK-PROC-001-rule-governance.md](TASK-PROC-001-rule-governance.md) |
| TASK-PROC-002 | 开发日志机制落地（AC-010，审计可还原开发过程） | P1 | 已验收（PR #192 已合并） | ✅ | [TASK-PROC-002-devlog-mechanism.md](TASK-PROC-002-devlog-mechanism.md) |
| TASK-PROC-003 | 台账一致性校验门禁（AC-008/010/011 结构化合规） | P1（治理；排期 §5.5「验收闭环」的机制化） | 待验收（验收 14/14；门禁正例+10 反例全过） | ✅ | [TASK-PROC-003/task.md](TASK-PROC-003/task.md) |
| TASK-PROC-004 | 存量台账真实化（13 张 unknown 卡逐卡核实与状态回填） | P1（治理） | 待验收（核实 8/8；CREATE-006 编号裁定待 Owner 确认） | ✅ | [TASK-PROC-004/task.md](TASK-PROC-004/task.md) |
| TASK-PROC-005 | 后端文件行数自动门禁 + 债务棘轮（BE-SIZE-001 / BE-LAYER-002） | **P0（规范已漂移，根因是无门禁）** | 进行中（实测 5 文件 + 3 main.go 超标；尚未改码） | ✅ | [TASK-PROC-005/task.md](TASK-PROC-005/task.md) |
| TASK-PROC-006 | cmd 装配收敛 —— 三服务 cmd/server/main.go 降到 ≤50 行 | **P1（关闭 BE-LAYER-002 的机器化）** | 待验收（三 main.go 184/94/73 → 38/37/37；基线 12→9；整链 20 通过/0 失败；判据 7 部分满足已说明） | ✅ | [TASK-PROC-006/task.md](TASK-PROC-006/task.md) |
| TASK-PROC-007 | handlers 按域拆分（BE-SIZE-001 的四个 handler 文件） | **P1（拆掉最大的 4 个 handler 文件）** | 待验收（783/525/517/757 → 485/351/435/453；基线 12→5；整链 20/0；函数零丢失） | ✅ | [TASK-PROC-007/task.md](TASK-PROC-007/task.md) |
| TASK-ROUTE-001 | 路由层表结构（逻辑模型 + 多渠道候选 + 租户策略） | — | 已验收（PR #145 已合并） | — | [TASK-ROUTE-001-routing-schema.md](TASK-ROUTE-001-routing-schema.md) |
| TASK-ROUTE-002 | 逻辑模型与候选绑定 API（production 服务） | — | 已验收（PR #145 已合并） | — | [TASK-ROUTE-002-logical-models-api.md](TASK-ROUTE-002-logical-models-api.md) |
| TASK-ROUTE-003 | T4 单元熔断三件套（channel_health + 错误码分类 + 多副本共享） | P0（A 轨 M2） | 已验收（PR #177 已合并） | — | [TASK-ROUTE-003-circuit-breaker.md](TASK-ROUTE-003-circuit-breaker.md) |
| TASK-SEC-001 | 模型网关出站 SSRF 防护 | P0（阶段1 第1项） | 已验收（PR #195 已合并，0b06a8d；8/8 验收标准） | ✅ | [TASK-SEC-001/task.md](TASK-SEC-001/task.md) |
| TASK-SEC-002 | 配额与限流（QPS 令牌桶 + 日/月成本上限） | P0（排期第一批第 6 刀） | 已验收（PR #199 已合并，a5fe704；10/10 验收标准） | ✅ | [TASK-SEC-002/task.md](TASK-SEC-002/task.md) |
| TASK-SEC-003 | auth_type 增加 `token`（无前缀 Authorization） | — | 待验收（✅ 代码核实通过；缺单测/真库实测） | — | [TASK-SEC-003-auth-type-token.md](TASK-SEC-003-auth-type-token.md) |
| TASK-SEC-004 | 鉴权改数据驱动（authHeader + authPrefix） | — | 待验收（✅ 代码核实通过；卡片要求的单测+真库集成未执行） | — | [TASK-SEC-004-auth-header-prefix.md](TASK-SEC-004-auth-header-prefix.md) |
| TASK-SUPPLY-001 | ① 算力接入（设置中心）实施计划 | — | 已验收（供给池各 PR 已合并） | — | [TASK-SUPPLY-001-supply-access-plan-2026-10-11.md](TASK-SUPPLY-001-supply-access-plan-2026-10-11.md) |
| TASK-UI-001 | UI 组件与设计 token 清单（专业级 · 可成长） | P1 | 已验收（**交付段**；维护段转 CI 门禁）——v2 §3.3① 判据机器验证通过：`ui:check` 绿 / catalog 42 组件 == 磁盘 42 / 注记 42 / demo 42 | ✅ | [TASK-UI-001-component-inventory.md](TASK-UI-001-component-inventory.md) |
| TASK-UI-002 | 组件库展示页受众分离改版（产品/设计可用） | P1 | 已验收（**交付段**；维护段转 CI 门禁）——v2 §3.3① 判据机器验证通过：`ui:check` 绿 / catalog 42 组件 == 磁盘 42 / 注记 42 / demo 42 | ✅ | [TASK-UI-002-ui-kit-redesign.md](TASK-UI-002-ui-kit-redesign.md) |
| TASK-UI-003 | 收敛字号离散步长（建立小字号尺度 token + 加门禁） | P2（不与功能开发抢道；但「加门禁」这一刀建议尽早，先止血） | 已验收（PR #175 已合并；V-003b 门禁 + 989 处收敛） | ✅ | [TASK-UI-003-text-scale-convergence.md](TASK-UI-003-text-scale-convergence.md) |
| TASK-UI-004 | 死代码口径修正 + 零引用组件裁剪 | P2 | 已验收（PR #176 已合并；组件 55 → 42） | ✅ | [TASK-UI-004-dead-code-triage.md](TASK-UI-004-dead-code-triage.md) |

## 现状（自动统计，供 Owner 看缺口）

- 任务卡：**44** 张（含 1 张 PLAN）；写明 **优先级** 34 张、**状态** 31 张。
- 任务卡：**45** 张（含 1 张 PLAN）；写明 **优先级** 35 张、**状态** 43 张。
- 已验收（29）：MODEL-001/003/004/005、AUDIT-001/002、ROUTE-001/002/003、ASSET-001、SUPPLY-001、OBS-002、PROC-001/002、INFRA-001/003/004/005（T13 验收）、FIX-001/004/005、SEC-001/002、UI-001~004、**FIX-002/003**（代码/规则均已合并 develop）。
- 待验收（13）：**AUTH-001**（判据 6 Owner 真机三角色走查 = T13 唯一未闭合项，见 `docs/how-to/t13-walkthrough-guide.md`）、**PROC-003**（台账校验门禁 14/14）、**PROC-004**（存量台账真实化 8/8）、**OBS-001**（详情抽屉）、**SEC-003/004**、**P2-001**、**INFRA-002**、**CREATE-001~005**（后 9 张均为**代码已实现、待正式验收**，各自残留项见 TASK-PROC-004 devlog）。
- 进行中（1）：**IA-001（设计稿 v1 待 Owner 评审，停在 AC-009 关卡）**。
- ✅ **UI-001/UI-002 已按 v2 §3.3① 拆分闭合**：「交付段」判据机器验证通过（`ui:check` 绿 / catalog 42 组件 == 磁盘 42 / 注记 42 / demo 42）→ 记已验收；「维护段」（新增组件必须同步清单）已由 CI `ui:check` 步骤长期强制，**不再占用卡片状态**。⇒ **CREATE 系列的组件基座依赖已解除**。
- 待开工（0）：———缺口已用真库量化（逻辑模型仅 2 个冒烟行 / 入池仅 3 行且 1 行 providerModel 为空 / 池原料仅覆盖 1 个渠道 / 能力声明 2-8）；**数据部分待 Owner 提供真实口径**。——把「一场走查闭合 4 条判据」从人工手点变成一条命令；前提（系统 Chrome 无头可用、栈可起、身份来自 localStorage）已实测核实。
- **仍未填写状态（1）**：`PLAN-a-and-adr008-2026-10-10`（文档类，非任务，不适用）。
- ✅ **CREATE-006 编号冲突已按 ADR 分片表裁定并正名（2026-10-15）**：平铺卡重编号为 **`TASK-CREATE-010`**（内容不变，记待验收）；**ADR 分片 6 = 后端 `capability.aspectRatios` 归位为独立待办**，列入 `plans/` 分片待办台账。
- 🆕 **真实待办源**：**`plans/2026-10-15-adr-shard-backlog.md`**（ADR 分片 6~13，2026-10-15 核实发现台账"未排期卡"多为已实现，故改用分片表定待办范围）。
- 排期唯一事实源：**`docs/product/task-queue-plan-v2-2026-10-15.md`**（依赖链 + 冲突面 + 波次/并行池 + 验收时间盒 + 防重演约束）。v1（`task-queue-plan-2026-10-15.md`）已被取代，保留为历史证据。
- **⚠️ 存量卡大面积"已实现未闭环"已核实并回填（2026-10-15）**：13 张原 `unknown` 卡逐卡核实，结果为 2 张已验收 + 10 张转为待验收 + 1 张编号冲突暂停。**排期不应再把这些卡读作"待开发"**，见 v2 §1.4。
- **待人工动作（v2 §3.1 第 0 波）**：① 合并①→⑥ 六个 PR ② **一场走查闭合 4 条判据**（AUTH-001 判据 6 + INFRA-005 判据 1/4/5）③ **IA-001 设计稿评审**（设计稿 §7 五项勾选表）⑤ 开工 INFRA-006（T13 走查自动化）④ **确认 CREATE-006 编号裁定**（TASK-PROC-004）。
- 验收清单：**26** 个（约定每卡一个；缺口 = 「验收清单」列为 `—` 的行；**未开工的卡在开工前产出**）。
- 开发日志：**12 个任务**（24 个文件，AC-010/AC-011 启用后新开卡；存量平铺卡待迁移）。
- 台账一致性由 `.github/scripts/check-task-ledger.sh` 机器校验（CI Documentation Check + 本地 preflight 门 0b），`--self-test` 可验证门禁有效性。
- 验收留痕机制自 `TASK-UI-001` 起启用。

