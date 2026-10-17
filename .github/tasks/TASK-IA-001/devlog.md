# TASK-IA-001 开发日志

> 开发过程的事实源：**动作 / 证据 / 决策 / 阻塞** 四类条目，随开发同步记录。
> 规则：AC-010（`.agents/skills/acceptance-checklist/SKILL.md`）。**开工即建，随开发追加，PR 前完成；禁止交付前一次性补写。**
> 机器可读配套：与本文件**同步维护** `devlog.events.json`（AC-011）。
>
> ⚠️ 本卡是 **UI 任务**：按 AC-009，**设计稿经 Owner 评审通过前不得写码**。当前处于「设计稿 → 评审」关卡。

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [task.md](task.md) |
| 验收清单 | [acceptance.md](acceptance.md) |
| 设计稿 | [design-prototype.html](design-prototype.html)（v1，待评审） |
| 分支 | `docs/ia-001-design-2026-10-15` |
| PR | #<待开> |
| 开工 | 2026-10-15 23:02（本地） |
| 完成 | 设计阶段完成；开发阶段**待评审通过后**开始 |
| 开发者 | AI Agent（会话 DSH） |

## 执行轨迹（正序；每个动作一条）

### 2026-10-15 23:02 开工/探查 —— 先核实原卡的三处缺口是否仍成立

- **动作**：读排期 v2 §3.3；核对原卡三处 IA 缺口与实测代码；定位预算区块与导航配置的真实路径。
- **发现/证据**：
  - **缺口 ①（预算孤悬）成立**：预算区块在 `apps/web/src/pages/SettingsPreferences.tsx:237-287`（`TASK-MODEL-005` 交付），与 `/models/costs` 分属两个一级导航。
  - **缺口 ②（设置「用量」缺失）不成立**：`apps/web/src/features/settings/settings-navigation.ts:6-8` 已按方案 A 把「用量」**移出**设置中心，顶层导航收敛为 3 项；`:106-110` 深链 `/settings/usage → /tasks?tab=ledger`。原卡描述相对实现已过时。
  - **缺口 ③（渠道归属）对象需修正**：不是两方重叠而是**三方**——`/settings/channels`（已实装 `SettingsChannels.tsx`）、`/models/channels`（`ModelCenterLayout.tsx:34` 确认「建设中」占位）、`/models/health`（已实装，承载观测）。且 `/models/channels` 的 task 文案「模型从哪来：渠道、探活与凭据」与设置「渠道」的「模型从哪来、连不连得通」**几乎同义**。
  - **导航配置真实路径**：`apps/web/src/features/model-center/model-center-navigation.ts`、`apps/web/src/features/settings/settings-navigation.ts`（**不是** `src/config/`——已在排期 v2 §2.2 更正）。
- **决策**：D-001（缺口 ② 不再处理）、D-002（③ 改为三方裁定）、D-003（区块落位）、D-004（无 budget 专属路由 ⇒ 用指路链接而非重定向）。

### 2026-10-15 23:03 迁移任务卡到文件夹结构（AC-008/010/011）

- **动作**：按「新任务一律用文件夹结构」约定，把平铺卡 `TASK-IA-001-ia-budget-relocation.md` 迁入 `.github/tasks/TASK-IA-001/`：`task.md`（含范围修正）+ 本日志 + `acceptance.md` + `design-prototype.html`；旧平铺文件随本 PR 移除；`README.md` 与 `ledger.json` 的 `file` 字段改为新路径。
- **证据**：本目录 5 个文件；README 行与 ledger 条目 `file` 指向 `TASK-IA-001/task.md`。
- **决策**：无（执行既定迁移约定）。

### 2026-10-15 23:04 产出设计稿 v1（AC-009 交付物）

- **动作**：写 `design-prototype.html`：7 节（范围修正 / 方案 A 落位示意 + 备选取舍 / 角色可见性 / 渠道归属三候选裁定 / 旧入口去向 / 技术方案 / 评审勾选表）。
- **证据**：`design-prototype.html`；与 `AUTH-001/design-prototype.html` 同一视觉语言（便于 Owner 横向对比）。
- **决策**：D-003、D-004、D-005（预算区块吸收 AUTH-001 遗留的页内按钮级角色控制）。

### 2026-10-15 23:05 停在 AC-009 评审关卡（未写码）

- **动作**：确认本卡交付物仅为「设计稿 + 任务文档」，**无任何前端代码改动**；等 Owner 评审。
- **证据**：本分支 diff 仅含 `.github/tasks/TASK-IA-001/**`、`README.md`、`ledger.json`、旧平铺卡删除。
- **阻塞**：B-001（评审是人工关卡，AI 无法自行通过）。

## 决策记录 D

| 编号 | 主题 | 选项 | 选择 | 理由 | 时机 |
|---|---|---|---|---|---|
| D-001 | 缺口 ② 是否处理 | A 按原卡重新裁定「用量」导航 / B 确认已由方案 A 解决、不再处理 | **B** | 实测导航已收敛 3 项且深链有落点，重复裁定会产生无收益的导航抖动；改为纳入回归验证（既有测试已锁定"改回 6 项即失败"） | 探查 |
| D-002 | 缺口 ③ 的裁定对象 | A 维持"两方重叠" / B 修正为"三方"并给出候选 | **B** | 实测存在三个入口，且 `/models/health` 已承载观测职责 —— 不修正对象会选错方案 | 探查 |
| D-003 | 预算区块落位 | A 观测双列之后（全宽）/ B 页面顶部 / C 趋势图右侧窄栏 | **A** | 改动面最小（既有双列布局不动）；不挤压观测内容；300px 窄栏容不下表单+列表 | 设计 |
| D-004 | 偏好页旧预算入口的处理机制 | A legacy redirect / B 页内指路链接 | **B** | 实测**不存在** budget 专属路由（无 `/settings/budget` 或锚点）⇒ 无"旧路径"可重定向。ADR-005 §3 的 redirect 模式适用于**路径**；此处正确机制是页内指路，避免按旧习惯找不到 | 设计 |
| D-005 | 预算区块的角色深度 | A 仅 Admin+ 可见整个区块 / B 区块 Viewer+ 可见、操作 Admin+ | **B** | Viewer 需要知道"当前有没有预算、会不会被拦"（解释成本为何被截断）但不应有配置权；与 AUTH-001「单套界面按角色控制深度」一致，并**吸收 AUTH-001 遗留的"页内按钮级隐藏"** | 设计 |
| D-006 | 渠道归属推荐方案 | A 候选 1 移除 / B 候选 2 重定位只读观测 / C 候选 3 仅改文案 | **A** | 文案与设置「渠道」几乎同义（用户无法区分）；观测职责已由「健康」承载；符合 ADR-005 D2；占位入口与 frontend-quality「禁僵尸按钮」相悖。**最终由 Owner 评审拍板（§7 第 4 项）** | 设计 |

## 验证记录 V

| 编号 | 对应验收判据 | 命令/方式 | 结果 | 证据位置 |
|---|---|---|---|---|
| V-001 | 设计阶段：设计稿可打开、含 7 节与评审勾选表 | 浏览器打开 `design-prototype.html` | 待 Owner 评审时确认 | design-prototype.html |
| V-002 | 设计阶段：范围修正有代码依据 | 逐条 `grep`/`read` 核对（§1 三行证据） | PASS | 本日志 23:02 条目 |
| V-003 | 开发阶段各项 | **未开始**（AC-009：未过评审不得写码） | 未开始 | — |

> 开发阶段的门禁（`npm run gate` / `npm test` / `ui:check` / `visual:check`）在评审通过后执行并回填。

## 阻塞与解法 B

| 编号 | 阻塞 | 根因 | 解法 | 复用教训 |
|---|---|---|---|---|
| B-001 | 无法进入开发阶段 | AC-009：UI 任务设计稿必须先经 Owner 评审通过 | 交付设计稿 + §7 评审勾选表，停在关卡等 Owner 裁定 | AI 不能自评 AC-009；把"待人工决策项"显式列成勾选表，把 Owner 的决策成本压到最低 |
| B-002 | 原卡三处缺口有 2 处与实现不符 | 任务卡写于方案 A 落地前，未随实现更新 | 开工先核实缺口是否仍成立，把修正写进 §1 与设计稿 | **开工第一件事是核实任务卡的前提**；前提过时会导致"照着旧描述做出无人要的东西" |

## 纪律自检（对照 `.agents` 规则，逐项留证据）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 先本地测试/验证再 commit | ✓ | V-002 逐条核对代码依据；本 PR 无代码改动故无门禁可跑 |
| 按路径 add（禁 `git add -A`） | ✓ | commit 前 `git diff --cached --name-only` 核对 |
| 只改点名范围（未越界） | ✓ | 仅任务文档 + 台账两行；**零前端代码改动** |
| 验收清单逐项勾对（AC-004/005） | ☐ | 设计阶段判据待 Owner 评审后确认；开发阶段判据未开始 |
| GATE / 后端门禁全绿 | N/A | 本 PR 无代码改动（如实声明，不冒称通过） |
| 台账同步（状态/PR 号） | ✓ | README 行 + ledger `file`/`status` 已更新 |
| 迁移只增不改 / 号段合规（如涉） | ✓ | 本卡无迁移 |
| **AC-009 未过评审不得写码** | ✓ | 本 PR diff 无 `apps/web/**` 改动 |

## 复盘（收尾时写，1–3 句每项）

- **做得好的**：
- **可改进的**：
- **遗留/后续**：

> 复盘在开发阶段收尾时填写；本卡当前仅完成设计阶段。

---

## 2026-10-17 追加：设计稿 v14 评审收敛 + Owner 决策确认（进入开发阶段）

### 开发（P1 实施，10-17）
- **导航层**：MODEL_CENTER_NAV 7→6（删 protocols、去内部词「渠道与凭据→渠道」）；SETTINGS_NAV 3 业务 tab→6 区系统设置 + 10 条 legacy 重定向；SettingsLayout 6 区图标；TopBar 面包屑简化；CreateWorkbench 落点改 /models/catalog；app.tsx 路由重挂（models 6 项 + settings 6 区 + protocols→channels）；useSettingsStore 新增 expertMode（persist v3）。
- **设置 6 区**：实装外观（主题/语言迁入+专家开关 Admin+）、通知与默认行为（默认模型/路由迁入）、关于；账号/工作区/数据显式占位（禁僵尸按钮）。
- **模型广场**：ModelMarket 真实模型+详情抽屉 Sheet+类型/渠道/状态筛选+起步价排序+停用/渠道停用标+设默认=个人默认（Admin+）；服务端 capability 证据结构容错（billing 空对象 → priceText 垫底）。
- **预算迁入**：抽 BudgetRulesSection（复用 T3 API，数据层零改动）挂 ModelCosts 替换只读占位；Viewer 只读、Admin+ 写。
- **个人默认层**：StageModelPicker 生效顺序=阶段→项目→个人→目录首项，来源标签加「个人默认」。
- **模型目录**：ModelCatalog 已接入行+归属状态（已归属/待归属）+能力归属编辑（logicalModelId/优先级，Admin+）+启停切换；待归属=可直调不进路由。
- **渠道页**：ModelChannels 列表+连通检测全员+同步上游/添加 Admin+（v14 矩阵实测修正）+删除确认弹窗+级联移除+每渠道策展入口（CurationPanel，ADR-005 D4）。
- **用量唯一入口**：Tasks 移除「账目」页签（核对=与 /models/audit 零独占），?tab=ledger → /models/costs；删除旧设置页 5 个（模型/逻辑模型/渠道/协议/偏好，无引用）；3 个 UI 护栏测试改指 ModelChannels/store 层。
- **ADR-005 终态**：D2 终态修订（设置=系统设置 6 区 + 模型中心=控制台 6 项）、§9 拍板记录（2 决策点 + Owner 三点修正）。

### 动作
- **十轮评审收敛**（v4→v14）：设置中心=系统设置 6 区、模型中心=模型控制台 6 项；模型广场=真实调用模型+详情、模型目录=能力归属、渠道=接入源；能力归属解耦（同步先加真实模型、归属后补）；用量域唯一入口；权限浏览/写分列；实施分期 P1/P2/P3；页面行数约束。
- **Owner 确认 2 决策点**（interaction_ask，2026-10-17）：① 用量/审计唯一入口=模型中心（任务中心「账目」页签移除并重定向）；② 广场「设为默认」=个人创作默认（StageModelPicker 生效顺序追加个人默认层）。
- **范围扩展**：TASK-IA-001 由「预算归位+渠道裁定」扩展为 v14 P1 收敛整体，criteria 8→15；acceptance.md 开发判据重写（15 条 + 映射 8 项 + 三态 8 项）；design-prototype.html 更新为 IA v14。

### 决策（本轮新增）
1. 用量/审计唯一入口=模型中心；任务中心账目页签移除并重定向（Owner）
2. 广场设默认=个人创作默认（defaultPrefs）+ 生效顺序补层（Owner）
3. 广场=真实模型+详情；目录=能力归属；同步先加真实模型、归属后补（Owner，v10）

### 验证记录
- V-003（10-17）：`apps/web/src/config/models/model-catalog.ts` 证实 CatalogModel 含 capability/logicalModelId/routePriority——广场/目录两页同源可行。
- V-004（10-17）：`StageModelPicker.tsx` 生效顺序=阶段→项目→目录首项，个人默认层为 P1 小改。
- V-005（10-17）：页面行数实测 SettingsChannels=679、SettingsModels=820、SettingsLogicalModels=591，迁移须拆分（≤300/≤500）。

### 纪律自检（追加）
| 检查项 | 结果 | 证据 |
|---|---|---|
| AC-009 设计稿评审通过后才进入开发 | ✓ | IA v14 十轮评审 + Owner 2 决策确认（10-17） |
| 台账同步 | ✓ | task.md/acceptance.md/devlog 三件套更新；README/ledger 待本轮同步 |
