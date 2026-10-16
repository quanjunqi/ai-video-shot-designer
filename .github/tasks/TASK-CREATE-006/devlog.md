# TASK-CREATE-006 开发日志

> 规则：AC-010。**开工即建，随开发追加；禁止交付前一次性补写。**
> 机器可读配套：[devlog.events.json](devlog.events.json)（AC-011）。
>
> ⚠️ **本卡状态：待开工**。本日志仅含「立卡/前提核实」条目——该部分工作已实际发生。

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [task.md](task.md) |
| 验收清单 | [acceptance.md](acceptance.md) |
| 分支 | 待定（开工时从 `origin/develop` 拉 `feature/aspect-ratios-<日期>`） |
| PR | #<待开> |
| 立卡 | 2026-10-15 23:45（本地） |
| 开工 | 待定 |

## 执行轨迹（正序）

### 2026-10-15 23:45 立卡/前提核实（已实际发生）

- **动作**：按排期 v2 §5 第 8 条，在建卡前**逐条核实**分片 6 的前提（不用 grep 级结论建卡）。
- **发现/证据**：
  - 比例当前来自**数量推断**：`control-schema.ts:167` `listAspectRatios(count)`
    → `listFallbackRange(count, COMMON_ASPECT_RATIOS)`
  - `source` 三态（`:96`）已预留 `'declared'`，但**当前无人走该路径** ⇒ 扩展点已就绪
  - 视频侧**硬编码 3**：`:332` `listFallbackRange(3, COMMON_ASPECT_RATIOS)`，
    注释「目录未声明视频比例数量」
  - 兜底为空：`:248,270` `{ values: [], source: 'platform-default' }`
  - **契约未声明**：`grep aspectRatios openapi/bff.yaml` 无输出
  - **后端无字段**：`grep -rn 'aspect_ratios|aspectRatios' services/` 无输出
  - **编号归位**：本号原被平铺卡借用（实为前端档位+双视图），已由 TASK-PROC-004
    裁定正名为 `TASK-CREATE-010`（`git mv`，R100）；**006 归还 ADR 分片定义的本项**
- **决策**：D-001（契约先行）、D-002（向后兼容：未声明走既有 count-fallback）。

### 2026-10-16 00:05 开工第一步：核实存储形态 → **原范围被证伪**

- **动作**：开工先查 `capability` 的存储形态与契约声明方式（而不是照着卡片直接改契约）。
- **发现/证据**：
  - `services/production/migrations/004_catalog.sql:27`：`capability jsonb NOT NULL DEFAULT '{}'::jsonb`
  - `openapi/bff.yaml:2940,2996,3028,3177`：capability 为 `type: object`（**开放对象**）
  - 后端无字段级处理（JSONB 不透明透传）
  ⇒ **契约变更、后端改动、新增迁移三项均不需要**；真实范围 L → S/M。
- **决策**：D-004（按核实结果收缩范围，并**作废**三条原判据而非勉强交付）。

### 2026-10-16 00:12 开发

- **动作**：
  - `control-schema.ts`：`listAspectRatios(count)` → `listAspectRatios(declared, count)`；
    声明优先走 `source='declared'`；**去重保序**；空白项忽略；空数组/全空白视为未声明 → 退回 count-fallback
  - 两处调用点：`:296` 图片传 `capability.aspectRatios`；`:350` 视频**去硬编码 3**
  - `model-catalog.ts`：`ImageCapability` / `VideoCapability` 增 `aspectRatios?: string[]`
  - 数据示范：`minimax-h3` 声明 `['16:9','9:16']`
  - 测试：`create-control-schema.test.ts` 新增 2 条
- **证据**：见「验证记录 V」。

### 2026-10-16 00:15 验证

- **动作**：跑单测 → 全量 gate → 全量 npm test。
- **证据**：V-002~V-004。

## 决策记录 D

| 编号 | 主题 | 选项 | 选择 | 理由 | 时机 |
|---|---|---|---|---|---|
| D-001 | 改动顺序 | A 先改后端/数据再补契约 / B 契约先行 | **B** | 仓库红线「契约先行（CT-001）」；且前端类型由 `openapi-typescript` 生成，先改契约才能 `api:check` 绿 | 立卡 |
| D-002 | 未声明模型的行为 | A 一并改为空/报错 / B 保持既有 count-fallback 逐字不变 | **B** | 向后兼容是硬约束（既有 6 个视频模型、若干图片模型都在用推断路径）；回归断言须逐字相等 | 立卡 |
| D-003 | 视频硬编码 3 的处置 | A 本卡一并去掉 / B 留待数据补齐时 | **A（列入范围）** | 它正是"目录无法声明"的直接后果；不修则本卡目标未达成（判据 7） | 立卡 |
| D-004 | 核实后发现契约/后端/迁移都不需要，怎么处置 | A 仍按原范围做（改契约+写迁移）/ B 收缩范围并**作废**对应判据 | **B** | A 是"为流程而流程"——改一个开放对象、写一个不需要的 DDL，属凭空制造变更与风险。**判据作废要写明理由**，不能装作做过 | 开工核实 |

## 验证记录 V

| 编号 | 对应验收判据 | 命令/方式 | 结果 | 证据位置 |
|---|---|---|---|---|
| V-001 | 前置事实核实（供开工用，非验收判据） | 读 `control-schema.ts` 相关行 + grep 契约/后端 | PASS | 本日志 23:45 条目 |
| V-002 | 存储形态核实（决定是否需契约/迁移） | 读 `004_catalog.sql:27` + `openapi/bff.yaml` capability 声明 + grep 后端 | PASS（三项均不需要） | 本日志 00:05 条目 |
| V-003 | 判据 4/5/6/7（前端声明优先 + 回归 + 去硬编码） | `node --experimental-strip-types --test tests/create-control-schema.test.ts` | **PASS 17/17**（新增 2 条） | 本日志 00:15 |
| V-004 | 判据 8（门禁与全量测试） | `npm run gate`；`npm test` | **PASS**：gate 0 error/0 warning；node --test **175/175**；vitest **50/50** | 本日志 00:15 |

## 阻塞与解法 B

| 编号 | 阻塞 | 根因 | 解法 | 复用教训 |
|---|---|---|---|---|
| — | （暂无） | | | |

## 纪律自检（对照 `.agents` 规则，逐项留证据）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 立卡前核实前提（排期 v2 §5 第 8 条） | ✓ | V-001；task.md「背景」表逐条带证据 |
| 开工前产出验收清单（AC-008） | ✓ | [acceptance.md](acceptance.md)（8 条判据） |
| 任务卡带 front-matter（AC-011） | ✓ | status/priority/depends_on/criteria |
| 尚未开工（未写码） | ✓ | 本卡仅有四件套文档 |

## 复盘（收尾时写）

- **做得好的**：**开工第一步核实存储形态，直接证伪了自己卡片里三条范围**（契约/后端/迁移都不需要），把 L 缩成 S/M；并且**作废判据时写明理由**而不是硬凑交付——若照着卡片做，我会改一个开放对象、写一个不需要的 DDL，凭空制造变更与风险。
- **可改进的**：**立卡时就该查存储形态**。我在卡里写「契约先行」是照搬惯例（CT-001），却没先确认该字段是否真的受契约约束——这是"惯例替代核实"。同类问题已第四次出现（IA-001/OBS-001/v2 §3/本卡），说明 §5 第 8 条应前移到**立卡时**而非开工时。
- **遗留/后续**：① 生产 DB 目录各模型的真实比例待**产品/数据侧**申报（机制已就绪，JSONB 加键即可，无需 DDL）；② QualityOptions 的同类机制（`qualityTierCount` 亦为数量推断）可复用本次模式，建议另立小卡。

> 复盘已填；本卡交付物为机制 + 前端数据示范 + 测试。
