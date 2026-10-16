# TASK-MODEL-006 开发日志

> 规则：AC-010。**开工即建，随开发追加；禁止交付前一次性补写。**
> 机器可读配套：[devlog.events.json](devlog.events.json)（AC-011）。
>
> ⚠️ **本卡状态：待开工**。本日志仅含「立卡/前提核实」条目——该部分工作已实际发生。

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [task.md](task.md) |
| 验收清单 | [acceptance.md](acceptance.md) |
| 分支 | 待定（开工时从 `origin/develop` 拉 `feature/supply-pool-real-<日期>`） |
| PR | #<待开> |
| 立卡 | 2026-10-16 00:45（本地） |
| 开工 | 待定 |

## 执行轨迹（正序）

### 2026-10-16 00:45 立卡/前提核实（已实际发生）

- **动作**：Owner 定调「业务代码只是壳子+mock，当务之急是底座能力」后，
  **不凭印象立卡**，而是直接查**真库**量化底座缺口（§5 第 8 条）。
- **发现/证据**（production 库实测）：
  - 前端 mock 的机制：`useSettingsStore.catalogSource` 初始值即 **`'demo'`**（`:115`），
    成功拉服务端目录才变 `'server'`（`:130`），失败退 `'offline-fallback'`（`:134`）
    ⇒ **"壳子+mock" 的根因是服务端目录撑不起业务流**
  - `logical_models` = **2 行，且 id 就叫 `accept-smoke-text` / `accept-smoke-image`**
    （正是 dev-plan T6 说的「冒烟 2 行」，**尚未被真实模型替换**）
  - `model_catalog` 18 行中**仅 3 行**入池（有 `logical_model_id`）
  - **`provider_model` 非空仅 6/18**；且入池行 **`gpt-image-2` 的 provider_model 为空**
    ⇒ **违反供给单元「ProviderModel 必填」语义**（基座语义违反）
  - `channel_models` **79 条全部来自 PearAPI 一个渠道**（7 个渠道里 6 个无同步数据）
  - `protocol_templates` **仅 2/8** 有 `capabilities` 声明（形态完整，可照抄）
- **决策**：D-001（立卡覆盖 T5+T6+T12 三个可独立 PR 的子项）、
  D-002（**未获 Owner 真实口径前不填数据**——否则是造第二份 mock）。

### 2026-10-16 01:00 Owner 答复四项口径 —— **范围据此修订（含推翻一处 dev-plan 假设）**

- **动作**：向 Owner 提出 4 项数据口径问题（原卡 B-001 阻塞），收到答复并据此改范围。
- **答复与影响**：
  1. **只有 PearAPI 一个中转站是真实的**，其余 6 渠道（ComfyUI/Google/Grsai/即梦/MiniMax/OpenAI）
     **都是 mock 数据** ⇒ 池原料只有 79 条；mock 渠道需处置（新增待定项）
  2. **逻辑模型不作为普遍机制**：它是"**一种特殊的模型收纳方式**"（例：把**免费模型**收纳成一个
     逻辑模型），**其他不做**；用户在工作层**直接从模型广场选真实模型**。
     ⇒ ⚠️ **推翻 dev-plan T6 的「5 个逻辑模型命名」**（D-004）
  3. 价格**不去上游获取**：**手动录入原价 + 加价**作为对外价 ⇒ 来源确定为 **manual**，
     正落在 `037_model_cost_price.sql` 的 `cost_*`/`price_*` 分离上（D-005）
  4. 能力档位**对齐官方文档**（我去搜）⇒ 已派只读调研（D-006）
- **额外发现**：PearAPI 同步只给了**裸名字**——`tags` 全空、`endpoint_types` 全 `[]`、
  `vendor` 全 `custom`、`pricing` **0/79**、`model_type` 全为占位 `'model'`
  ⇒ 缺口不只是"缺数据"，还有**分类与富化**。
- **决策**：D-004（逻辑模型范围收缩）、D-005（价格 manual+加价）、D-006（能力对齐官方文档）。

### 2026-10-16 01:30 Owner 三项拍板 + **纠正我对逻辑模型的理解**

- **纠正（重要）**：我上一轮理解成「逻辑模型**只**用于收纳免费模型」——**偏了**。Owner 澄清：
  逻辑模型 = **通用的「模型分组 / 特殊收纳」机制**，**工作层也可使用**（主入口仍是模型广场）；
  免费模型只是他举的一个案例。**他不需我创建分组数据**，只需**实现该功能**。
- **核实：该功能已经存在**（本卡范围因此再次收缩）：
  - 契约完整 CRUD + 候选绑定：`openapi/bff.yaml:1326/1368/1385/1411/**1428**`
  - 前端 **591 行**管理页 `SettingsLogicalModels.tsx`（创建/编辑/启停 + 候选绑定面板，routePriority 小者优先）
  - 表 `logical_models` + `model_catalog.logical_model_id`（migration 025/026）
  ⇒ 本卡对该项的工作改为 **验证端到端可用 + 工作层接线**（当前只有 2 个冒烟行，从未真实验证过）
- **三项拍板**：
  1. **mock 渠道全部删除**（6 条，仅留 PearAPI）；需级联检查 `model_catalog` 中挂在这些渠道的行
  2. **加价方式 = 电商式**：`售价 = 原价 + 原价×比例%`，**逐模型设比例 + 勾选批量设置**
     ⚠️ 核实发现**现有字段无"比例"**（仅 cost_*/price_*/price_source/price_synced_at）
     ⇒ **需新增比例字段**；且必须独立存储（原价变动时售价要跟随，不能只存算好的 price_amount）
  3. 免费模型 Owner 自决；不替他建分组数据
- **决策**：D-007（逻辑模型 = 通用分组机制，本卡只验证功能不造数据）、
  D-008（删 mock 渠道）、D-009（加价比例独立存储 + 批量设置）。

### 2026-10-16 01:45 补充拍板：计费方式 + 加价两级分档

- **答复**：
  1. **PearAPI 按用量计费**：**图片按次 · 文字按 token · 视频按秒**（⇒ **非包月**）
     ⇒ 与 `cost_unit` 的设计枚举一一对应：`per_call` / `per_mtok_*` / `per_second`
     （核实现状：`cost_unit` 是无约束 `text`，无默认、无 CHECK）
     ⇒ "免费"语义 = **零成本调用**，故 Tier 1「开放权重可自建」的推断有意义
  2. **加价比例分两档**：**类型分第一档**（text/image/video）+ **类型下的模型再分一档**
- **设计**（本卡核心）：
  `有效比例(model) = 模型级 ?? 类型级`；`售价 = 原价 × (1 + 有效比例)`
  - 类型级默认：3 条（text/image/video）
  - 模型级覆盖：`model_catalog` 新增可空列
  - **批量设置 = 批量写模型级覆盖**，与"改类型默认"是**两个不同操作**（UI 须区分，
    否则用户以为改了选中 3 个、实际改了整类型）
- **决策**：D-010（两级比例 + 模型级覆盖类型级）、D-011（批量设置与改默认分离）。

### 2026-10-16 02:00 第一刀开工：删 mock 渠道的影响面核实（**发现三个后果，暂停执行**）

- **动作**：按 §5 第 8 条，在写 `DELETE` 之前先查引用面（外键 / 归档表 / 审计）。
- **发现（三个后果）**：
  - **A** `model_catalog_versions.id` → `model_catalog.id` 是 **ON DELETE NO ACTION**，
    16 行 mock 目录对应 **56 条归档版本**（该表共 77 条）⇒ 直接删渠道**会被外键挡住**；
    要删成得**连带删掉 56 条归档历史**。而 `004_catalog.sql` 把它定位为
    「**Append-only** version history」——删它等于删历史。
  - **B** `model_catalog` **无指向 `model_channels` 的外键** ⇒ 删渠道会留下
    **16 行孤儿目录**（确认是前端硬编码 mock 的镜像；14/16 行 `provider_model` 为空）。
  - **C** `gateway_audit_logs` 有 **44 行**引用 mock 渠道，而 `011_audit_immutability.sql`
    规定**身份列不可变**（`channel_id` 属身份列）⇒ 删渠道后这 44 条审计**指向不存在的渠道**。
- **决策**：D-012（**暂停执行，交 Owner 择方案**——因为其中一个方案会不可逆地删除归档历史）。

### 2026-10-16 02:30 结构部分交付两条迁移（本轮收口）

- **动作**：按 Owner 拍板，交付两条迁移（均为"只加列/加表/宽松约束/显式删数据"，不改既有行为）。
- **交付物**：
  | 迁移 | 内容 | 验证 |
  |---|---|---|
  | `039_model_markup.sql` | 加价比例两级结构：`model_catalog.markup_ratio`（可空=继承）+ 放宽 `price_source` CHECK 加 `'markup'` + 新表 `markup_type_defaults(workspace_id,type,ratio)` | 真库事务试跑零错误 + 确认回滚 |
  | `040_mock_channel_purge.sql` | 物理删除 6 个 mock 渠道 + 16 行 mock 目录 + 56 条归档版本（Owner 拍板①） | 真库事务试跑：目录 18→2、版本 77→21、**孤儿 0**、PearAPI 79 行完好；确认回滚 |
- **关键实现决定**：
  - **比例独立存储**（不能只存算好的 `price_amount`）：原价会变，存比例才能让售价跟随
  - **类型默认单独建表**：它是"每类型一条"的配置（3 行/工作区），塞进 `model_catalog` 会冗余且改默认要 UPDATE 全表
  - **不播种任何比例值**：属商业定价决策；未设置时有效比例按 0 计（售价=原价，不会凭空加价）
  - **删 mock 用显式 ID 列表**而非 `WHERE channel_id <> '...'`：范围条件会在未来新增渠道时误删
  - **44 条悬挂审计不改写**：`011` 规定身份列不可变，审计是历史账本
- **号段问题**：production 模型中心登记 `024-039` **已满**，040 系"下一个可用号"。建议 Owner 更新
  `.agents/skills/database-migrations/SKILL.md` 的号段表（规则文件，本卡未擅自改）。
- **决策**：D-013（本轮收口，不在余量不足时硬推跨三层链路）。

### 2026-10-16 02:35 收口验证（含一次自查纠正）

- **动作**：对 production 服务跑 `go build` / `go vet` / `go test -race`。
- **自查纠正（重要）**：第一次跑时我写了
  `go build ./... 2>&1 | tail -3 && echo "✅"` —— **管道让 `tail` 的退出码掩盖了 `go build` 的失败**，
  实际因沙箱拒绝写 `~/Library/Caches/go-build` 而失败，但 `✅` 照样打印了。
  **这是一次假验证**。改用可写 `GOCACHE` + `set -o pipefail`（并读 `${PIPESTATUS[0]}`）重跑。
- **真实结果**：`go build` rc=0 · `go vet` rc=0 · `go test -race` **8 个包全 ok**
  （catalog / episode / episodeasset / httpapi / intent / project / projectcharacter / ruletemplate）
- **教训**：**验证命令本身也会骗人**。`cmd | tail && echo OK` 这种写法在失败时依然打印成功；
  必须 `set -o pipefail` 并核对真实退出码。本仓库 `scripts/preflight.sh` 头注早已写明这一点
  （"set -o pipefail：下面用了 tee，若不设，退出码会变成 tee 的而掩盖测试失败"）——我复现了同一类错误。

### 2026-10-16 02:30 本轮收口：为什么停在这里

第 3~5 项（Go 加价计算 → 契约暴露 → 前端批量）是一条**跨三层的完整链**：
契约先行（CT-001）→ `npm run api:check` 绿 → `go test -race` → 前端 `gate`。
**在会话余量不足时硬推，容易产出"看起来完成但没验证"的东西**——本仓库最反对的正是这个
（「未验证 ≠ 通过」）。故**主动收口**，把地基与验证打牢，下一轮专门做这条链。

## 决策记录 D

| 编号 | 主题 | 选项 | 选择 | 理由 | 时机 |
|---|---|---|---|---|---|
| D-001 | 立一张卡还是三张（T5/T6/T12） | A 三张独立卡 / B 一张卡三子项 | **B** | 三者同属"供给单元池真实化"一个工作流、共享同一份真实数据口径；dev-plan 亦视作同一计划内的三个可独立 PR。避免三张卡各自重复描述同一套背景数据 | 立卡 |
| D-002 | 未获 Owner 数据口径时怎么办 | A 先按合理猜测填数据 / B 只做结构，数据留空并标注 | **B** | A 等于**造第二份 mock**——本卡要消灭的正是 mock。数据（哪些模型可用/挂哪些候选/价格口径/能力档位）是**产品事实**，AI 不得臆测 | 立卡 |
| D-003 | 是否顺带做"入池"管理 UI | A 做 / B 不做（另议） | **B** | 入池 = 管理员精选，其 UI 属模型中心页面工作，与本卡的数据/机制层解耦 | 立卡 |
| D-004 | 逻辑模型的范围 | A 按 dev-plan 做 5 个普遍命名 / B 收缩为"免费模型收纳"一种用途 | **B（Owner 2026-10-16 定）** | Owner 明确：逻辑模型是"特殊的收纳方式"，工作层直接用模型广场的真实模型。按 A 做会产出一套无人使用的命名体系 | Owner 答复 |
| D-005 | 单元级价格来源 | A 从上游同步 / B 手动录入原价 + 加价 | **B（Owner 2026-10-16 定）** | 上游不提供可用价格口径；manual+加价正好落在 037 的 cost/price 分离设计上 | Owner 答复 |
| D-006 | 能力档位取值来源 | A 按经验/推断填 / B 对齐官方文档 | **B（Owner 2026-10-16 定）** | Owner 要求与官方文档对齐；A 会造出与官方不符的能力声明，导致请求被上游拒绝 | Owner 答复 |
| D-007 | 逻辑模型的范围（**第二次纠正**） | A 只用于收纳免费模型（我上轮的理解）/ B 通用「模型分组/特殊收纳」机制，工作层也可用 | **B（Owner 2026-10-16 澄清）** | Owner：免费模型只是**案例**，不是唯一用途；主入口仍是模型广场。**且核实发现该功能已存在**（契约+591 行 UI+候选绑定）⇒ 本卡改为「验证可用 + 工作层接线」，**不造分组数据** | Owner 澄清 |
| D-008 | mock 渠道处置 | A 禁用 / B 标注 demo / C **全部删除** | **C（Owner 拍板）** | Owner 决定删除。需级联检查 `model_catalog` 中挂在 mock 渠道的行，迁移可追溯、不静默丢数据 | Owner 拍板 |
| D-009 | 加价比例如何落地 | A 只存算好的 `price_amount` / B **独立存比例**，售价=原价×(1+比例) | **B（Owner 定规则，我定实现）** | 现有字段无"比例"（仅 cost_*/price_*/price_source）；**原价变动时售价必须跟随** ⇒ 比例必须独立存储。Owner 要求逐模型可设 + 勾选批量设置 | Owner 拍板 |
| D-010 | 加价比例的层级 | A 只有模型级 / B **两级：类型默认 + 模型覆盖** | **B（Owner 拍板分档）** | Owner：类型分第一档、模型再分一档 ⇒ `有效比例 = 模型级 ?? 类型级`。两级让"新增模型自动继承类型默认"，避免逐个设置 | Owner 拍板 |
| D-011 | 批量设置与类型默认的关系 | A 同一个操作 / B **两个可区分操作** | **B** | 批量=改**选中模型**的覆盖；改类型默认=影响该类型下**所有未覆盖**模型。混为一谈会让用户"以为改了 3 个、实际改了整类型" | 设计 |
| D-012 | 「删 mock 渠道」怎么删 | A 物理删除（连带删 56 条归档）/ B 软删除 / C 分级删除 | **A（Owner 2026-10-16 拍板）** | 我先列出三方案与代价（物理删会不可逆删 56 条归档 + 44 条审计悬挂），Owner 知情后选①物理删除。**删除历史这类不可逆操作由 Owner 决定，不由我代决** | Owner 拍板 |
| D-013 | 本轮是否继续硬推跨三层链路 | A 硬推第 3~5 项 / B **收口，下一轮专门做** | **B** | 第 3~5 项是契约→Go→前端完整链，需逐层验证（api:check / go test -race / gate）。**余量不足时硬推会产出"看起来完成但没验证"的东西**，违反本仓核心纪律 | 收口 |

## 验证记录 V

| 编号 | 对应验收判据 | 命令/方式 | 结果 | 证据位置 |
|---|---|---|---|---|
| V-001 | 前提核实（供开工用，非验收判据） | 查 production 真库 6 项计数 + 读 `useSettingsStore` | PASS（缺口量化） | 本日志 00:45 条目；task.md「背景」表 |
| — | （验收判据 1~12 待开工后逐条追加） | | | |

## 阻塞与解法 B

| 编号 | 阻塞 | 根因 | 解法 | 复用教训 |
|---|---|---|---|---|
| B-001 | ~~数据部分无法开工~~ **已解除（2026-10-16）** | 缺 Owner 的 4 项口径 | Owner 已答复（见上）；范围据此修订 | 供给侧数据是产品事实——**问清楚比猜快**。本次 4 问 4 答，直接改掉了两处会白做的范围 |
| B-003 | **「删 mock 渠道」不能照字面执行** | 核实发现三个后果：①`model_catalog_versions` FK(NO ACTION) 挡住删除，绕开须删 **56 条归档历史**（该表定位为 append-only）；②`model_catalog` 无 FK ⇒ 留 **16 行孤儿目录**；③**44 条不可变审计**引用 mock 渠道 ⇒ 删后指向不存在渠道 | 暂不执行，把三方案交 Owner 择一（task.md 已列） | **"删数据"类指令必须先查引用面**：字面执行会撞外键或删历史；软删除往往同样达成产品目标且可回退 |
| B-002 | **同步只给裸名字** | PearAPI 同步未提供 type/vendor/pricing/tags/endpoint_types（`model_type` 全为占位 `'model'`） | 需**分类与富化**：79 个名字判定 type/vendor、补能力（官方文档）、补价格（manual） | 同步拿到"有名字"≠"能上架"；**供给单元入池需要富化层**，这是原 dev-plan 未显式列出的工作 |
| — | （其余待开工后追加） | | | |

## 纪律自检（对照 `.agents` 规则，逐项留证据）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 立卡前核实前提（排期 v2 §5 第 8 条） | ✓ | V-001：真库 6 项计数，非 grep 级 |
| 开工前产出验收清单（AC-008） | ✓ | [acceptance.md](acceptance.md) 12 条判据 |
| 任务卡带 front-matter（AC-011） | ✓ | status/priority/depends_on/criteria |
| **不臆造产品数据** | ✓ | D-002；task.md「需 Owner 提供的信息」表 |
| 尚未开工（未写码） | ✓ | 本卡仅有四件套文档 |

## 复盘（收尾时写）

- **做得好的**：
- **可改进的**：
- **遗留/后续**：

> 本卡尚未开工，复盘待开发阶段收尾时填写。

## 附：本卡范围的三次收缩（值得记录）

| 时点 | 触发 | 收缩结果 |
|---|---|---|
| 立卡 | 查真库量化缺口 | 缺口从"印象"变为 6 项可测指标 |
| Owner 答复①~④ | 逻辑模型只用于免费模型 / 价格 manual / 能力对齐官方文档 | 作废 dev-plan T6 的「5 个逻辑模型命名」 |
| Owner 澄清 + 三项拍板 | 逻辑模型是**通用分组机制**；且**核实发现功能已存在** | 本卡对该项从"实现功能"→"**验证功能**"；新增"删 mock 渠道"与"加价比例"两项 |

**教训**：我对「逻辑模型」连续两轮理解偏差——第一次按 dev-plan（5 个命名），第二次按"只收纳免费模型"。
两次都是**没有先问清楚语义就动手**。**供需要求的语义要靠澄清，不能靠上下文推断。**

---

## 下一轮从哪开始（交接清单）

> 本轮已把**地基与验证**打牢；下表是下一轮的起点，不需要重新侦察。

### 立即可做（无外部依赖）

| 序 | 事项 | 关键位置 / 已知信息 |
|---|---|---|
| 3 | **Go 侧加价计算** | `services/production/internal/catalog/curation.go:192` —— 现有分支是 `manual → synced`；需加 `markup` 分支：按**有效比例**（模型级 ??　类型级 ?? 0）算 `price_amount = cost_amount × (1+ratio)`，并置 `price_source='markup'` |
| 4 | **契约先行** | `openapi/bff.yaml` —— 暴露 `markup_ratio` 与类型默认的读写；改完必须 `npm run api:generate` + `api:check` 绿（CT-001） |
| 5 | **前端选品面板** | `apps/web/src/features/settings/CurationPanel.tsx` + `curation.ts`（已有 `priceAmount`/`priceUnit` 输入与校验）——加比例输入 + **勾选多选批量设置**；⚠️ 批量（改选中模型）与改类型默认（影响该类型全部未覆盖）**必须做成两个可区分操作**（D-011） |
| 6 | `cost_unit` 口径 | 加 CHECK：`per_call` / `per_mtok_*` / `per_second`（对齐 Owner 的计费方式）。现状 `cost_unit` 是无约束 `text` |
| 7 | `kimi-k2.5` 停用 | 上游官方已下线，调用必然失败（分类文件 §五） |
| 8 | 能力档位骨架 | 字段 + 校验；**高置信 23 条可先落库**（见 [model-capabilities.md](model-capabilities.md) §五行动建议 1） |
| 9 | 逻辑模型分组端到端验证 | 契约 `bff.yaml:1326/1368/1385/1411/1428` + `SettingsLogicalModels.tsx`（591 行）——从未被真实验证过 |

### 第 3~5 项精确实施方案（已读码，下一轮可直接执行）

> 本方案基于**实读 `services/production/internal/catalog/curation.go`（226 行）**，不是猜测。
> 下一轮无需重新侦察。

#### 第 3 项 · Go 侧加价计算（`curation.go`）

现状（已读）：
```go
// :192  现有只有两个分支
priceAmount, priceUnit, priceSource := in.PriceAmount, in.PriceUnit, "manual"
if priceAmount == nil {
    if amt, unit, ok := parsePricing(rawPricing); ok {
        priceAmount, priceUnit, priceSource = &amt, unit, "synced"
    }
}
```
改动点（四处）：
1. **`CuratedModel`（:125-139）与 `CurateInput`（:143-161）各加 `MarkupRatio *float64`**
   （`CurateInput` 的注释风格是"留空表示未定价，不是 0" ⇒ 比例也照此：**留空 = 继承类型默认，不是 0**）
2. **读类型级默认**：`SELECT ratio FROM markup_type_defaults WHERE workspace_id IN ('', $ws) ORDER BY (workspace_id='') ASC LIMIT 1`
   —— 与 :179-183 读供给池价的**同构写法**（平台共享行排后 ⇒ 工作区行优先）
3. **加第三个分支**（放在 `manual` 之后、`synced` 之前或之后需定；见下"判定顺序"）
4. **`INSERT` / `ON CONFLICT DO UPDATE` / `RETURNING`（:199-218）加 `markup_ratio` 列**，
   并接到 `RETURNING` 的 `Scan`（:222-224）

**判定顺序（需在实现时定并写进注释）**：三者语义不同——
`manual`（人工直接填售价）> `markup`（按比例算）> `synced`（取上游价）。
倾向：**`in.PriceAmount` 非空 → manual（保持现状）**；否则**若有效比例存在 → markup**；
否则 synced。即"人工填的售价优先于比例"。

**测试**（`curation_test.go` 若有则扩，否则新建）：
- 比例来自模型级 → 用它；为空 → 用类型默认；都为空 → **有效比例 0 ⇒ 售价 = 原价**（不凭空加价）
- 原价变动后按比例重算（验证**比例独立存储**的价值）
- `price_source` 三种取值正确

#### 第 4 项 · 契约暴露（`openapi/bff.yaml`，**契约先行 CT-001**）
- `CuratedModel` / `CurateInput` 对应 schema 加 `markupRatio`
- 新增类型默认的读写端点（建议 `GET/PUT /api/v1/markup-defaults`，BFF 透传 production）
- **改完必须** `npm run api:generate` → `api:check` 绿（否则 CI 的 Contract Sync 会红）

#### 第 5 项 · 前端（`SettingsChannels.tsx` 挂载 `CurationPanel`）
- `apps/web/src/features/settings/CurationPanel.tsx`（已有 `priceAmount`/`priceUnit` 输入）
  + `curation.ts`（已有校验：`留空=未定价`、`填了售价就必须填单位`）
- 加：比例输入 + **勾选多选批量设置**
- ⚠️ **D-011：批量（改选中模型）与改类型默认（影响该类型全部未覆盖）必须做成两个可区分操作**

### 等外部输入

| 事项 | 等什么 |
|---|---|
| 5 个模型的能力取值 | 调研（按 Owner 指示走非官方来源，逐值标注 `官方/官方镜像/权威聚合/第三方/社区`） |
| 三级默认比例数值 | Owner 后台设置（机制已就绪，不阻塞） |
| 7 项 relay 别名映射 | Owner 决策（[model-capabilities.md](model-capabilities.md) §四） |

### 落地提醒

- 迁移 `039`/`040` 会在**下次栈启动**时由执行器应用（`compose up production-migrate`），**不要手工执行**
- 若栈是旧库且无 `schema_migrations` 跟踪记录 → 执行器 **fail-closed 拒绝**，需 `MIGRATE_ADOPT=1` 显式采纳
- **B-001 仍在**：本地运行中的 BFF 是旧二进制（`/api/v1/me` 404 而源码已注册）⇒ 端到端验证前需重建栈

---

### 2026-10-16 号段决策落地 + 应用 039（加价比例）

**Owner 2026-10-16 两项决定**：
1. **号段**：模型中心新认领 **060-069**，`040_mock_channel_purge.sql` **改名为 060**
2. **推进顺序**：**先应用 039**（不等号段决定）

**让号经过（为什么必须让）**：
- 原 `040` 占用了 **040-049**，而该段属「**项目知识库**」；模型中心自己的 **024-039 已满**（039 是最后一号）
  ⇒ **无空号段可让** ⇒ 需 Owner 定夺。规范原文：「撞号时**后到者立即让号**」⇒ 我是后到者。
- **改名前核实**：该文件**尚未应用**（`schema_migrations` 只到 038）
  ⇒ 「迁移只增不改」的铁律只约束**已应用**文件 ⇒ **改名不影响校验和，成本为零**。
- 号段表已同步：`.agents/skills/database-migrations/SKILL.md`（机制落地 = 同步规则文件），
  并在本卡 `task.md` 登记认领（规范要求「开工前先认领，登记进任务卡」）。

**应用 039 的处置（只应用 039，不带 060）**：
- 迁移执行器会应用**全部待执行**迁移，而 060 是**破坏性清理**（删 6 渠道 + 16 目录行 + 56 归档版本）
  ⇒ 为严格遵守 Owner「先应用 039」，把 060 **临时移出**迁移目录，应用后放回（可逆）。
- 执行命令需**同时启用两个 profile**：`--profile app --profile platform`
  （`asset`(app) 依赖 `minio`(platform)，只给 app 会报 `service "asset" depends on undefined service "minio"`）。

**执行结果**：
```
迁移计划：待应用 1 · 已应用(跳过) 40 · 采纳 0
-> 039_model_markup.sql
完成：应用 1 个，采纳 0 个
当前版本：039_model_markup.sql
```

**验证（判据 7 的前置）**：
| 检查 | 结果 |
|---|---|
| `markup_ratio` 列 | ✅ `numeric`，可空（NULL = 继承类型默认） |
| `price_source` CHECK | ✅ 含 `'manual','synced','markup'` |
| `markup_type_defaults` 表 | ✅ PK(workspace_id, type)；含 `ratio/updated_by/updated_at` |
| **既有 18 行行为不变** | ✅ `markup_ratio` 非空 **0** 行；类型默认 **0** 行（未播种 ⇒ 有效比例按 0 ⇒ 售价=原价，不凭空加价） |
| 栈可用 | ✅ `/api/v1/me` 200；5 端口全在（postgres 容器被 Recreate 未造成影响） |

**决策记录**：
| 编号 | 主题 | 选择 | 理由 |
|---|---|---|---|
| D-010 | 040 的号段 | **改名 060，模型中心认领 060-069** | Owner 决定；024-039 已满无号可让；文件未应用 ⇒ 改名零成本 |
| D-011 | 是否连带应用 060 | **不**，只应用 039 | Owner 明确「先应用 039」；060 是破坏性清理，应单独确认后执行 |
| D-012 | compose 调用方式 | `--profile app --profile platform` | `asset`(app) 依赖 `minio`(platform)；此为首次踩到，值得记入文档 |

---

### 2026-10-16 T5：补 PearAPI 视频协议模板（061）+ 两个必须报告的失误

#### ✅ 交付：真实缺口是"视频无模板"，不是"6 个模板缺能力"

**实测定向**（查真库）：
| 事实 | 数据 |
|---|---|
| 唯一真实渠道 | PearAPI（79 个 channel_models）；另 6 渠道 **全为 0** |
| 有 capabilities 的模板 | 只有 2 个（`openai` / `openai_img`）——**恰好只有这 2 个被真实使用**（入池 1 与 2） |
| PearAPI 的视频模型 | **15 个**（`model-classification.md` 判定），但**没有任何可用视频模板** ⇒ 视频模态在真实链路上走不通 |

⇒ 新增 **`pt_builtin_openai_video`（061）**：能力 `text-to-video` + `image-to-video`，
`POST /v1/videos/generations` + 轮询 `/v1/videos/{id}`。

**★ 证据分级写进 `observed_evidence`（仓内首次使用该字段）**：
- **实测已注册**：`POST /v1/videos/generations`、`GET /v1/videos/{id}`、`GET /v1/videos/{id}/content`、`GET /v1/video/generations/{task_id}`
- **实测形状**：提交响应 `{task_id, status:"queued"}`；无 webhook；后台 15s 刷新；24h 清扫；**无跨渠道重试**
- **实测约束**：豆包/Seedance 插件 `Object.assign({model, content:[]}, metadata)` ⇒ 参考素材须放 `metadata.content[]`
- **未验证（如实列出 + 写明闭合方式）**：终态取值、任务 id 字段名、轮询路径二选一；
  `doc_ref.verifiedAt` 保持 **NULL**（与仓内全部 8 个模板的既有约定一致）

#### 🔴 失误 1：我执行了 060，却没做我承诺的确认

上一轮我明确说「**060 未被应用**」并问 Owner「要我在执行前先跑一次 dry-run 报数确认吗」；
本轮跑 `production-migrate` 时**忘了再次移出 060** ⇒ 执行器把 060 与 061 一起应用了
（`迁移计划：待应用 2`）。**这是"承诺了确认却没说就执行"。**

**处置**：立即逐项实测影响面，并与我会前的 dry-run 数字对照：

| 对象 | 实测结果 | 与 dry-run 对照 |
|---|---|---|
| 渠道 | 7 → **1**（只剩 PearAPI） | ✓ |
| 目录行 | 18 → **2** | ✓ 一致 |
| channel_models | **79 不变** | ✓ 一致 |
| 归档版本 | 77 → **21** | ✓ 一致 |

**⇒ 影响与 Owner 已批准的实质完全一致，且顺带达成两条判据**（见下）。**但这不改变"流程错了"这一事实。**

#### 🔴 失误 2：我的建议 A 前提被证伪（幸好先验证了）

我在上一轮建议「**删除那 6 个零引用模板**」。**执行前验证发现前提只对了一半**：
- **数据库侧**：6 个模板 catalog 引用**全为 0** ✓、无外键 ✓ —— 看起来该删
- **代码/文档侧**：**每个都有 4~17 处引用**（jimeng_video 17、minimax_video 14、minimax_text 12）

追查引用性质后，发现**更根本的问题**：
`services/production/internal/catalog/protocol_registry.go` 是 **ADR-007 D1 的「协议即代码注册表」**，
它定义了**全部 8 个内置模板**，且读取路径是

> 「DB 表保留（向后兼容 + 专家覆盖）：读取路径合并时 **DB 行优先，DB 缺失的 id 由注册表补齐**」

**⇒ 删那 6 个 DB 行是【非操作】**（注册表会把它们补回来），而且会打断测试。
**⇒ 它们是合法的内置协议定义，与"某渠道当前是否在用"无关。**
**⇒ 我的建议 A 从根上错了。已撤回。**

#### ✅ 顺带达成两条判据

| 判据 | 结果 |
|---|---|
| **2**：入池行 `providerModel` 必填 | ✅ 违反 **0** 行 |
| **3**：语义违反行 `gpt-image-2` 被处置 | ✅ **0** 行剩余（060 删掉了它所在的 mock 目录行） |

#### 测试契约更新（集合合法增长，未放松任何逐字段断言）

061 使「带 pollPath / failValue 的模板」全局集合由 2 个变 3 个 ⇒ 两条真库集成测试的期望值过期：
- `TestPostgresProtocolTemplateAsyncPollPath`
- `TestPostgresProtocolTemplateAsyncTerminalValues`

**处置**：更新期望集合并在测试里写明理由（原意「029/030/032 只动了该动的行」**未被削弱**——
①②③ 段仍逐字段锁着 minimax 的值；`wantEmptyAsync` 继续把关其余 6 个仍为 `{}`）。
**⇒ 测试在尽职**：任何集合变化都必须是有意的。

#### ⚠️ 判据 4 的「8/8」需要 Owner 改口径

现状 **3/9**，且与引用数完全对应：
```
pt_builtin_openai        目录引用 1  有 caps ✓   ← 在用
pt_builtin_openai_img    目录引用 1  有 caps ✓   ← 在用
pt_builtin_openai_video  目录引用 0  有 caps ✓   ← 061 新建（等视频目录行）
其余 6 个                 目录引用 0  无 caps ✗   ← 内置协议定义，渠道已删
```
**判据 4 是按"8 个模板都活着"写的**，而 6 个是**内置定义**、当前无渠道使用，且**无官方文档可依据**
（按 Owner 规则「capabilities 必须与官方文档对齐」⇒ **编造即违规**）。
**⇒ 建议口径改为「在用模板 100% 有 capabilities」（现 3/3 ✓）**，但**这是 Owner 的决定，我不自行改。**

#### 决策记录

| 编号 | 主题 | 选择 | 理由 |
|---|---|---|---|
| D-013 | 6 个无 caps 模板怎么处置 | **撤回"删除"，保持现状** | 它们是 code registry 的内置定义；删 DB 行是非操作且打断测试 |
| D-014 | 视频模板未验证项怎么处置 | **如实写进 `observed_evidence` + `verifiedAt: null`** | 仓内铁律"不许瞎猜"；全部 8 个既有模板也都是 verifiedAt=null |
| D-015 | 两条集成测试期望值 | **更新并写明理由** | 集合合法增长；逐字段断言不放松 |

#### 验证

- `production` 全量测试（**含真库集成**）rc=0 ✅
- 061 在事务内验证 → 回滚干净（模板数仍 8）→ 再由执行器应用 ✅
- 我在写 061 时犯了 **2 个 SQL 语法错误**并当场修正：
  ① `COMMENT ON` 里并排字符串字面量（SQL **不拼接**相邻字面量）② 改用 `||` 后才知道
  **`COMMENT ON` 只接受单个字面量**（不接受表达式）⇒ 最终写成一条长字符串。

---

### 2026-10-17 发现并修正：卡片内部不一致（判据 1 已被 Owner 作废，但 task/acceptance 没跟着改）

**触发**：本轮准备做 T12（给 79 个模型建目录行 + 精选入池），先取实证核对判据 1
（「`logical_models` 恰为 GATE-3 的 5 个命名」）。

**发现**：卡片**自相矛盾** ——
| 位置 | 内容 |
|---|---|
| `task.md:30`（判据 1） | 「GATE-3 的 **5 个**真实命名（lm-text-standard …）」 |
| `acceptance.md:24` | 同判据，☐ 未开始 |
| **`devlog.md:47`** | 「**推翻 dev-plan T6 的「5 个逻辑模型命名」**」（D-004） |
| **`devlog.md:60`** | Owner：「**他不需我创建分组数据**，只需**实现该功能**」 |
| **`devlog.md:65`** | 本卡对该项改为「**验证端到端可用 + 工作层接线**」 |

**⇒ 我差点去实现一个 Owner 已明确作废的判据**（造 5 个无人使用的命名体系 —— 而 D-004 的理由正是
「按 A 做会产出**一套无人使用的命名体系**」）。**根因：devlog 跟着 Owner 答复更新了，task/acceptance 没同步。**

**处置（本轮已做）**：
1. `task.md` 增「⛔ 已作废的判据（Owner 决定，勿再实现）」小节，逐条列出作废项 + Owner 原话依据：
   - 「逻辑模型恰为 5 个命名」+「`accept-smoke-*` 不再存在」⇒ 作废
   - 「其余 6 渠道同步」⇒ **随之作废**（那 6 个是 mock，已物理删除 ⇒ 不存在"同步"）
2. `acceptance.md` 判据 1 改为「逻辑模型功能**端到端可用 + 工作层接线**」（**不造数据**）
3. `task.md` 写清**仍然有效的核心缺口**（Owner 2026-10-16 实测原话）：
   > 「PearAPI 同步只给了**裸名字**——`tags` 全空、`endpoint_types` 全 `[]`、`vendor` 全 `custom`、
   > `pricing` **0/79**、`model_type` 全为占位 `'model'` ⇒ **缺口不只是"缺数据"，还有分类与富化**。」

**⇒ 这一条比"造 5 个命名"有价值得多，而且数据已备**：
| 缺口 | 已备产出 |
|---|---|
| 分类（按**输出模态**，非 relay 占位值） | `model-classification.md`（79 个，含 4 个工具型模型的处置） |
| 能力档位 | `model-capabilities.md` |
| 价格 | Owner 定「不去上游取」⇒ 手动录入原价 + 加价（`037` 分离 + `039` 的 `markup_ratio`） |
| 计费口径 | Owner 定「图片按次 · 文字按 token · 视频按秒」⇒ `per_call` / `per_mtok_*` / `per_second` |

**教训（与 PROC-007 的漏建 devlog 同族）**：**Owner 答复改变了范围，就必须同步所有产物**
（task.md / acceptance.md / devlog）——只更新一处，下一个接手者（包括未来的我）就会照着过期判据开工。
**⇒ 已在 D-016 记录：范围变更时三处必须同改，且 task.md 要显式标注作废项而不只是删掉**（删掉则无从判断"是没写还是作废"）。

#### 决策记录

| 编号 | 主题 | 选择 | 理由 |
|---|---|---|---|
| D-016 | 作废的判据怎么处置 | **显式保留并标注 ⛔ 作废 + Owner 原话**，而不是删除 | 删掉则后人无从判断"是漏写还是已作废"；显式标注可防止重复实现 |

---

### 2026-10-17 T12 施工前定向：**"手写 79 行目录迁移"是错的**（架构早已设计好）

**经过**：准备写"79 个模型建目录行"的迁移，先取实证核对行形状与建行方式。
查到 ADR-004 D1 的三层分离设计（写在 `034_channel_models.sql` 头部）：

> 「本表（`channel_models`）【**不被任何前端或执行路径读取**】。同步只写本表；
> **只有经人工【策展】写入 `model_catalog` 后，模型才可能对外可见**。
> 因此这里允许存"上游原样"的脏数据。」

**⇒ 三层各司其职**：
1. **供给池** `channel_models` —— 同步写入，**上游原样**（79 行已在）
2. **产品面** `model_catalog` —— **只由人工策展产生**
3. **执行候选** —— 经 `logical_model_id` / 路由投影

**⇒ 策展已是全栈功能**（不需要我做）：
| 层 | 实现 |
|---|---|
| production | `GET /internal/v1/catalog/supply`（`listSupply`）+ `POST /internal/v1/catalog/curate`（`curate`） |
| 前端 | `apps/web/src/features/settings/CurationPanel.tsx` + `curation.ts` |
| BFF | 契约已暴露 `/api/v1/catalog*` |

**★ `CurateInput` 的注释点明了设计意图**：
> 「凡"来自供给池"的字段都不在这里 —— 它们由 `Curate` **从供给池行读取，避免人工誊抄出错**」
> `Curate`：「**只有走到这里，模型才可能对外可见。**」

**⇒ 因此"我手写 79 条 INSERT 迁移"是错的**，它同时违反三件事：
1. **ADR-004 的策展设计**（产品面只由策展产生）
2. **Owner 的「入池 = 管理员精选，绝不自动全量挂」**（devlog D-006 附近）
3. `CurateInput` 刻意把供给池字段排除在外，就是为了**避免誊抄出错** —— 而 79 行手写 INSERT 正是大规模誊抄

**⇒ 修正后的 T12 交付物**（不造行、不绕设计）：
| # | 交付物 | 说明 |
|---|---|---|
| 1 | **验证策展链路端到端可用** | supply 列表 → 策展 → 目录可见 → 前端 `catalogSource` 从 `demo` 切 `server`（判据 8/9 的正路） |
| 2 | **把富化数据整理成策展工作台可用的形态** | `model-classification.md`（79 个的输出模态）+ `model-capabilities.md` + `pearapi-pricing.json`（105 条）⇒ 供**人工**策展时参考，而不是自动灌库 |
| 3 | **策展一个最小示范集**（1 text + 1 image + 1 video） | 用于验证链路 + 让新视频模板（061）真正被走到 |

**⇒ 这一轮我第二次避免了"按过期/错误的理解施工"**（第一次是判据 1 已作废）。
两次都不是靠猜，而是**施工前先取实证核对**。

#### 决策记录

| 编号 | 主题 | 选择 | 理由 |
|---|---|---|---|
| D-017 | 79 行目录怎么产生 | **不手写迁移；走已实现的策展 API/UI** | ADR-004 D1：产品面只由人工策展产生；`CurateInput` 刻意排除供给池字段以避免誊抄；Owner 定「入池 = 管理员精选，绝不自动全量挂」 |

---

### 2026-10-17 ✅ 策展链路端到端验证通过 + 视频示范单元落地

**动作**：按修正后的 T12 路径，**走已实现的策展 API**（不手写迁移），把视频模态的首个真实供给单元策展进产品面。

**链路实测（每一段都有响应为证）**：

| 段 | 调用 | 结果 |
|---|---|---|
| ① 供给池读 | `GET /api/v1/catalog/supply?channel_id=chan-muo4b9zo`（经 BFF） | **HTTP 200，79 条** |
| ② 策展写 | `POST /api/v1/catalog/curate`（经 BFF） | **HTTP 200**，返回创建的模型 |
| ③ 目录读 | `GET /api/v1/catalog`（经 BFF） | **HTTP 200，3 个模型** |
| ④ 前端可满足性 | 读 `useSettingsStore.syncCatalog()` 逻辑 | 成功后置 `catalogSource: 'server'`；失败才 `offline-fallback` |

**② 的请求与响应**（`CurateInput` 无 JSON 标签 ⇒ 用 Go 字段名；`DisallowUnknownFields` ⇒ 不能多字段）：
```json
{"ID":"mod_pearapi_seedance25","Family":"video","Name":"Seedance 2.5","Type":"video",
 "ChannelID":"chan-muo4b9zo","ProviderModel":"doubao-seedance-2-5-260628",
 "LogicalModelID":"","ProtocolTemplateID":"pt_builtin_openai_video","RoutePriority":10,"Note":"…"}
```
```json
{"model":{"id":"mod_pearapi_seedance25","type":"video","protocolTemplateId":"pt_builtin_openai_video",
          "logicalModelId":"","priceSource":"manual","version":1, …}}
```

**★ 关键成果：061 的新视频模板由「目录引用 0」变为「1」** —— 它**真正被用上了**，不再是"建了但没人用"：
| 模板 | 目录引用 | has_caps |
|---|---|---|
| `pt_builtin_openai` | 1 | ✓ |
| `pt_builtin_openai_img` | 1 | ✓ |
| **`pt_builtin_openai_video`** | **0 → 1** | ✓ |

**示范集齐（3 行 = 三种模态）**：
| id | 类型 | provider_model | 模板 | 入池 |
|---|---|---|---|---|
| `mod_aaaaaaaaaaaaaaaaaaaa` | text | deepseek-v4-pro-0813 | pt_builtin_openai | accept-smoke-text |
| `mod_aaaaaaaaaaaaaaaaaaab` | image | gpt-image-2 | pt_builtin_openai_img | accept-smoke-image |
| **`mod_pearapi_seedance25`** | **video** | doubao-seedance-2-5-260628 | **pt_builtin_openai_video** | **（未入池）** |

**★ 选择 Seedance 2.5 的理由**：它是能力最丰富的一个（omni-reference），且**会走到豆包/Seedance 插件**那条路
—— 正是我在 061 的 `observed_evidence` 里记录的 `metadata.content[]` 约束所在 ⇒ 这条策展也让那份约束**有了被检验的场景**。

**如实说明的边界**：
- 我**没有**入池（`LogicalModelID` 留空）—— Owner 定「入池 = 管理员精选」，且「不需我创建分组数据」
- 我**没有**录价（`costAmount`/`priceAmount` 留空）—— 类型注释明确「留空表示"未定价"，**不是 0**」；
  价格需 Owner 手动录入原价（D-005 定「不去上游获取」）
- 判据 8 的 `catalogSource === 'server'` 是**浏览器端运行时状态**，我只验证了它的**可满足性**
  （逻辑 + 接口两条都通），**未做真机浏览器断言** ⇒ 该项**仍待端到端勾对**

#### 决策记录

| 编号 | 主题 | 选择 | 理由 |
|---|---|---|---|
| D-018 | 示范集选哪个视频模型 | `doubao-seedance-2-5-260628` | 能力最丰富（omni-reference）+ 会走到豆包插件路径（使 061 记录的 metadata 约束有被检验的场景） |
| D-019 | 是否顺带入池/录价 | **都不做** | 入池 = 管理员精选（Owner 定）；留空=未定价而非 0（类型注释明确） |

---

### 2026-10-17 ✅ 判据 8 真机勾对：**先失败 → 定位到我自己引入的契约违反 → 修复 → 通过**

**方法**：派子代理用无头 Chrome + CDP 真机断言（脚本 `apps/web/scripts/verify-catalog-source.mjs`，592 行，
rc **0=通过 / 1=断言失败 / 2=无法验证**，带看门狗与逐次求值超时）。

#### 第一次：**不通过**（实测 `catalogSource === 'offline-fallback'`，rc=1）

**不是"前端没调 syncCatalog"** —— 它确实被自动调用（`AppShell.tsx:33` 等，本次触发 5 次，
**10 个请求全部 HTTP 200**），而是**抛的异常被吞了**。

**根因链（逐环有证据）**：
1. `GET /api/v1/catalog` 里 `pt_builtin_openai_video` 的 `params` / `responseParams` 是 **JSON 对象 `{}`**
   （其余 8 个模板都是**数组**）—— **我在 061 里写成 `'{}'::jsonb` 造成的**
2. 契约 `openapi/bff.yaml:2935-2939` 明确 `params/responseParams: {type: array}`
   ⇒ **这是违反契约的数据**
3. 前端 `useSettingsStore.ts:81` 是 `(t.params ?? []).map(...)`；`{}` **不是 nullish** ⇒ `?? []` 兜不住
   ⇒ 抛 `TypeError: (t.params ?? []).map is not a function`
4. 该异常被同文件 `:157` 的**裸 `catch {}` 吞掉** ⇒ 走 `markOfflineFallback()`
   ⇒ UI 显示"服务端不可达·本地缓存"—— **而服务端其实是好的**
   ⇒ **一条畸形数据被静默转换成了"服务端不可达"，把排查引向错误方向**

**★ 反事实实验（决定性）**：不改任何源码与数据，仅用 CDP `Fetch.fulfillRequest` 在响应途中把
这一行的 `{}` 改成 `[]`，其余字节不动 ⇒ **同一次运行**里 `syncCatalog()` 立刻
`offline-fallback → server`、DOM 徽章变「目录已连接」⇒ **拦路石只有这一条畸形数据**。

**我的独立核验**（不只信子代理报告）：
```
pt_builtin_openai_video  | object | object    ← 我写的
其余 8 个                 | array  | array
```

#### 修复：新增迁移 062（按"迁移只增不改"）

061 已应用 ⇒ **必须新增迁移**修正，不能改它。全新库会先跑 061（写对象）再跑 062（改数组），最终态一致。
```sql
UPDATE protocol_templates SET params='[]'::jsonb, response_params='[]'::jsonb, updated_at=now()
 WHERE id='pt_builtin_openai_video'
   AND (jsonb_typeof(params)='object' OR jsonb_typeof(response_params)='object');
```
- **只 UPDATE 这一行、这两个字段**；`WHERE` 带类型判断 ⇒ **幂等**
- 并给 `protocol_templates.params` 加了 `COMMENT`（说明唯一合法类型是 array，空参数写 `[]` 不写 `{}`）
- 应用前**先核对"恰好只有 062 待应用"**（吸取 060 那次的教训）⇒ 结果 `待应用 1 · 已应用(跳过) 43`，
  **无连带应用** ✓
- 事务内先验证 → 回滚干净（类型仍 object）→ 再由执行器应用

#### 第二次：**通过**（rc=0）
```
★ catalogSource（最终实测值）   : server
✓ catalogSource === 'server' —— 实测 server
✓ 目录非空 —— 实测 19（3 服务端 + 16 本地保留）
✓ 应用实例也写出 server（persist 轨迹一致） —— ["server"×5]
✓ DOM 渲染出「目录已连接」徽章 —— {"connected":true,"offline":false}
```
另：`production` 全量测试（**含真库集成**）rc=0 ✓

#### ★ 由此暴露的**第三个缺陷（可观测性，尚未修）**

`useSettingsStore.ts:157` 的**裸 `catch {}`** 把真实异常吞了 ⇒ 任何原因失败都显示成
"服务端不可达·本地缓存"。**本次它把一个数据形状 bug 伪装成了网络问题**，直接延长了定位时间。
**⇒ 建议**：至少 `console.warn` 带上 error（前端改动需过 `npm run gate`）。

#### 教训（这条最值钱）

**我写 061 时的心理是"这个模板暂时不用参数，先写 `{}` 占位"** —— 而契约要求 array，
**空参数应写 `[]`**。一条"看起来无害"的占位值，经"前端 `?? []` 兜不住"+"裸 catch 吞掉"两跳，
变成了**一个看起来像网络故障的假象**。
**⇒ 教训一：新数据必须逐字段对齐契约类型，"暂时不用"不是可以写错类型的理由。**
**⇒ 教训二：`catch {}` 空捕获会把根因变成假象 —— 这类"吞掉异常"的写法在本仓应视为缺陷。**

#### 决策记录

| 编号 | 主题 | 选择 | 理由 |
|---|---|---|---|
| D-020 | 修 061 还是新增迁移 | **新增 062** | 仓规铁律「迁移只增不改」；061 已应用，改它会被校验和拒绝 |
| D-021 | 是否"前端容忍一下"就算了 | **不**，修数据 | 契约明确 `type: array` ⇒ 前端按契约消费是对的；让前端容忍违约数据是掩盖问题 |
| D-022 | 可观测性缺陷是否同修 | **本轮未修，已记录建议** | 属前端改动（需过 `npm run gate`），且与判据 8 的修复解耦；留给下一次前端改动一并做 |

---

### 2026-10-17 判据 5 达成：能力档位数据落地（迁移 063）+ 契约固化

#### 施工前定向：**我差点又走错（本轮第三次实证救了我）**

原计划按判据字面新建 `aspect_ratios` / `duration_range` / `quality_options` / `reference_rule` **四个列**。
**取实证后发现那是错的**：前端 `create/control-schema.ts` **早已在消费这些键**，但它们在
`model_catalog.capability`（JSONB）里：

```
capability.aspectRatios / aspectRatioCount / qualityTiers
capability.minDurationSeconds / maxDurationSeconds
capability.maxRefImages / maxRefAudios / maxRefVideos
capability.modes / refImage / billing
```

**⇒ 真实缺口不是"字段不存在"，而是「键集合没写进契约（只写"契约待补"）」+「真实模型没填值」。**
**若新建列，会与前端已消费的 `capability` 分裂成两套 —— 那才是真错。**

#### 实测的现状缺口

| 模型 | 改前 `capability` |
|---|---|
| text `deepseek-v4-pro-0813` | 形态完整（maxTokens/streaming/temperature…） |
| image `gpt-image-2` | **只有计数**：`{refImage:false, qualityTiers:2, aspectRatioCount:3}` ⇒ **无实际档位值**，前端只能兜底 |
| video `doubao-seedance-2-5` | **`{}` 空** |

#### 数据来源与纪律

`model-capabilities.md`（只读 web 调研，原则「**只报官方文档写了的；查不到写"未找到官方依据"，
不填推测值**」）。★ 特别核对：`gpt-image-2` **首轮判"全域 HTTP 403 ⇒ 留空"**，但该文件 §2
明确写着「**首轮无依据 → 现已有官方级来源**」⇒ 二次确认后才填。

#### 交付

1. **迁移 063**：给两个已策展模型填官方核实过的档位
   - `gpt-image-2`：比例 4 档、quality 4 档、参考图 **16**、n 1–10、任意尺寸规则
   - `doubao-seedance-2-5`：比例 **7 档**、时长 **4~30s**、分辨率 3 档、模式 7 种、参考图 30/视频 10/音频 10
   - **每个档位带 `tiersSource`**（source/confidence/verifiedAt/evidenceFile）—— 沿用 061 `observed_evidence` 的做法：**数据与证据放在一起**
   - 用 `capability || '{...}'` **合并**而非整体覆盖 ⇒ 既有 `billing` 等键不被破坏；幂等
2. **契约固化**（`openapi/bff.yaml`）：把键集合与 `tiersSource` 写进 `capability` 定义
   （此前只有一句"契约待补"）⇒ 并**重新生成** `api-generated.ts`，`api:check` rc=0
3. **注释固化**：`COMMENT ON COLUMN model_catalog.capability` 写明档位键与"无依据留空、不得填占位值"

#### 验证（判据 5：档位取值存在 + 至少 1 个真实模型声明）

| 检查 | 结果 |
|---|---|
| 迁移应用 | `待应用 1 · 已应用(跳过) 44` ⇒ 只应用 063，**无连带** ✓ |
| 档位落地 | image：比例 4 档 / quality 4 档 / 参考图 16；video：比例 7 档 / 4~30s / 参考图 30 ✓ |
| 契约一致性（SQL 统计） | 有比例 2 行 / 有时长 1 行 / 有参考图上限 2 行 / 共 3 行 ✓ |
| **端到端**（BFF 出口） | `GET /api/v1/catalog` 返回真实档位，**键名与前端 `control-schema.ts` 消费的完全一致** ✓ |
| 前端门禁 | `npm run gate` rc=0；`api:check` rc=0 ✓ |
| 事务内预验证 | `UPDATE 1` ×2 + `COMMENT` + 回滚后数据未变 ✓ |

#### 教训（第三次同族）

**"判据的字面描述"与"系统的实际形态"可能不一致。**
判据说"档位字段存在" ⇒ 我读成"要新建列"；实际字段（JSONB 键）**早已存在且前端已消费**。
**⇒ 与前两次（判据 1 已作废、79 行迁移违 ADR-004）同族：施工前必须先取实证核对前提。**

---

### 2026-10-17 判据 6 达成：`Resolve` 按能力过滤候选 + **由此暴露我 063 的词表缺陷**

#### 交付

| 文件 | 改动 |
|---|---|
| `internal/catalog/resolve.go` | 新增 `ResolveFor(dir, modelID, requiredMode)`；`Resolve` 改为**一行委托**（语义与引入前逐字一致）；新增 sentinel `ErrNoCandidateForMode`（与 `ErrModelNotResolved` **语义分开**） |
| `internal/catalog/resolve_mode_test.go` | **新增 258 行 / 10 个用例** |
| `internal/httpapi/handlers_generate.go` | 传 `in.Mode`；**删掉那个"结构性死字段"struct**（三个字段从未被使用）；498 行（≤500） |
| `internal/httpapi/handlers_run_model.go` / `internal/worker/worker.go` | 传 `""` + **写明为什么拿不到 mode** |
| `handlers_generate_integration_test.go` / `routing_wiring_test.go` | 真库集成测试 + 接线不变量（原计数会因改名而红，已改） |

#### 四条设计判断（都写了依据）

1. **签名用显式形参而非 options 结构** —— 逼每个调用点在**编译期**面对"我有没有 mode"，拿不到就必须显式写 `""` 并给理由。
2. **过滤只依据"显式声明"；未声明 ≠ 不支持** —— 与能力数据纪律一致（无依据留空＝未知）。
   测试里 **10 个子用例**覆盖 capability 缺失/空/`{}`/`modes:[]`/无键/`null`/坏 JSON/类型错 ⇒ **全部保留**。
3. **"精确行 id"那一支不过滤** —— 语义：调用方**点名**这一行，没有候选集也没有失败切换余地，
   过滤只能把能成功的调用变成硬错误。**事实依据**：实测唯一声明了 `modes` 的行
   `mod_pearapi_seedance25` 的 `logical_model_id` 为 **NULL** ⇒ 它**只能走这一支**。
4. **HTTP 层复用既有码 `INVALID_GENERATE`（422）而不新增** —— `Error.code` 的 enum 会被
   openapi-typescript 生成为 TS 联合类型，新增 code 必须改契约 + 重生成前端类型（属另一条线）。

**★ 变异验证（证明断言非空转）**：把 `if requiredMode != ""` 改成 `if false` 后重跑 ⇒
4 条 catalog 用例 + 端到端集成用例**全部 FAIL**（`got MODEL_NO_PROTOCOL ≠ want INVALID_GENERATE`），
退出码 1；随后还原（`grep -c MUTATION` = 0）。

**真实输出**：`go build` / `vet` / `gofmt` / `go test ./... -race` **全部 exit=0**；
`-v` 统计 **228 顶层 PASS / 0 SKIP / 0 FAIL**（真库集成测试确实执行、无静默跳过）。

#### 🔴 由此暴露的缺陷：**我 063 写的 `modes` 词表与调用方不同源**（已修，迁移 064）

子代理在"不确定项"里诚实标注了一条风险：**无法证明调用方传的 mode 落在 DB 那 7 项里**。
**我核查后发现它是真的，而且责任在我**：

| 我在 063 写的 | 前端权威词表（`GenerationMode`） | |
|---|---|---|
| `text-to-video` | `text-to-video` | ✅ |
| `first-last-frame` | `first-last-frame` | ✅ |
| `first-frame` | **`image-to-video`** | ❌ |
| `omni-reference` | **`multi-reference`** | ❌ |
| `video-edit` / `extend` / `with-audio` | 无对应 | ❌ |

**⇒ 7 项里 5 项对不上** ⇒ 能力过滤一旦生效，前端合法的 `image-to-video` 会被判"不支持"而 **422 拒掉**。

**修法（064）**：按**官方能力**映射到**调用方词表**，而不是照抄或丢弃：
- 官方「首帧生视频」→ `image-to-video`；「全模态参考」→ `multi-reference`
- 「视频编辑 / 延长 / 有声」在调用方词表里**没有对应项** ⇒ **不写入**
  （写进去**永远不可能被命中**，只会给人"该能力可被请求"的错觉；能力仍记录在 evidence 文件里，
  待前端词表扩展后另立卡补）

**验证**：`4/4` 落在前端 `GenerationMode` 词表内。

**并固化契约**（`openapi/bff.yaml` 的 `mode`）：此前写着「具体取值以服务端为准，**契约待补**」
—— **这正是让我踩坑的根源**。现加上 **8 值 enum**（来源即前端 `GenerationMode`），
并重生成 `api-generated.ts`（`api:check` rc=0、`npm run gate` rc=0）。
注释里写明：**新增模式须同时改契约 + 前端类型 + `model_catalog.capability.modes`**。

#### 教训（第四次同族，但这次是**数据**而非理解）

前三次都是"我的理解与系统实际不符"；**这一次是我造的**数据**与系统实际不符**：
`modes` 是**连接调用端与声明端的契约值**，我却当成自由文本自己编了一套词。
**⇒ 凡是"两端要对上的值"（词表、枚举、键名），都必须先找到权威来源再填，不能自造。**
