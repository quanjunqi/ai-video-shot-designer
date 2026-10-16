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
