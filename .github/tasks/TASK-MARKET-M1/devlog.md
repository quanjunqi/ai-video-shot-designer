# TASK-MARKET-M1 开发日志（范围修正：供给池UI → 来源标注）

> 开发过程的事实源：**动作 / 证据 / 决策 / 阻塞** 四类条目，随开发同步记录。
> 审计 agent（人或 AI）依此还原：是否先测试后提交、是否越界、验证是否真实、决策是否成立。
> 规则：AC-010（`.agents/skills/acceptance-checklist/SKILL.md`）。**开工即建，随开发追加，PR 前完成；禁止交付前一次性补写。**
> 机器可读配套：与本文件**同步维护** `devlog.events.json`（结构化事件流，审计 agent 直接消费；AC-011）。本 md 是人读主版本，events.json 是同一事实的结构化投影——两者不得互相矛盾。

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [task.md](task.md) |
| 验收清单 | [acceptance.md](acceptance.md) |
| 分支 | `feature/market-source-label-2026-10-17` |
| PR | #（待开） |
| 开工 | 2026-10-17 17:30（本地） |
| 完成 | （待） |

> **范围修正（2026-10-17 17:40）**：初版立卡判据为「ModelCatalog 补供给池添加 UI」；继续开发前发现策展闭环已在 ModelChannels 渠道页完整实现（CurationPanel + curation.ts，curation-ui.test.ts 钉死），ModelCatalog 造供给区=重复实现（已还原）。真实缺口=广场 catalogSource 三态中 demo 无标注，用户会把演示目录当真实可调模型。卡已重写为「来源标注与演示态引导」。
| 开发者 | AI Agent（MainAgent） |

## 执行轨迹（正序；每个动作一条）

> 一条 = 时间 + 阶段 + 动作 + 发现/证据（命令与输出摘要，完整输出引用 PR/文件）。决策单列 D-xxx。

### 2026-10-17 17:30 开工/探查
- **动作**：摸底模型广场真实化缺口——前端广场/目录/渠道现状、production supply/curate/sync 端点、BFF 透传、前端 api 封装。
- **发现/证据**：后端全链路已存在（production GET /internal/v1/catalog/supply + POST /internal/v1/catalog/curate + POST /internal/v1/channels/{id}/sync；BFF catalogProxy 透传保留 query；矩阵 write=admin）；前端 api.listSupply/curateModel 已封装；ModelChannels 有同步按钮；ModelCatalog 有归属编辑+待归属 badge，**缺供给池挑选/添加 UI**。
- **决策**：D-001 纯前端闭环（后端零改动）；供给区 Admin+；family 默认=渠道名（非空契约）；type 认不出→下拉必选；logicalModelId 留空=待归属后补。

### YYYY-MM-DD HH:MM 开发/验证/PR/验收（按实际追加）
- **动作**：
- **证据**：

## 决策记录 D

| 编号 | 主题 | 选项 | 选择 | 理由 | 时机 |
|---|---|---|---|---|---|
| D-001 |  | A / B | B |  | 开工 |

> 重要选择必须留痕（哪怕一句"选 B 因为 CI 更稳"）。审计以此判断拍板是否成立、有无被推翻。

## 验证记录 V

| 编号 | 对应验收判据 | 命令/方式 | 结果 | 证据位置 |
|---|---|---|---|---|
| V-001 | 判据 N | `go test -run X` | PASS | PR body / 本日志 |

> 结果只填 PASS / FAIL / 跳过+原因；证据位置可引用 PR、CI 链接、文件路径。禁止只写结论不写证据。

## 阻塞与解法 B

| 编号 | 阻塞 | 根因 | 解法 | 复用教训 |
|---|---|---|---|---|
| B-001 |  |  |  |  |

## 纪律自检（对照 `.agents` 规则，逐项留证据）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 先本地测试/验证再 commit | ✓ / ✗ | V-xxx |
| 按路径 add（禁 `git add -A`） | ✓ / ✗ | commit 明细 |
| 只改点名范围（未越界） | ✓ / ✗ | diff 清单 |
| 验收清单逐项勾对（AC-004/005） | ✓ / ✗ | acceptance 文件 |
| GATE / 后端门禁全绿 | ✓ / ✗ | CI 结论 |
| 台账同步（状态/PR 号） | ✓ / ✗ | README 行 |
| 迁移只增不改 / 号段合规（如涉） | ✓ / ✗ | 迁移 diff |

> 任一 ✗ 必须写明原因与处置，不得空项带过。

## 复盘（收尾时写，1–3 句每项）

- **做得好的**：
- **可改进的**：
- **遗留/后续**（含转交其他卡的事项）：


### 2026-10-17 17:40 纠偏（范围修正）
- **动作**：开发前核对 CurationPanel/curation.ts/ModelChannels 策展入口与 curation-ui.test.ts 钉死断言；曾向 ModelCatalog 添加供给池区（git checkout 已还原）。
- **发现/证据**：`features/settings/CurationPanel.tsx`（306 行）+ `curation.ts`（151 行，inferModelType/proposeFamily/draftFromSupply/validateCurateDraft/curateRequest）+ ModelChannels 每渠道「策展」按钮 + `tests/curation-ui.test.ts` 5 断言（面板挂载/统一 api/先写后端再刷新/不猜类型/已策展已下架打标）——策展闭环已完整，缺口不在供给 UI。
- **决策**：D-002 撤销 ModelCatalog 供给区（防重复实现）；M1 范围改为广场来源标注（demo/server/offline 三态条 + demo 模型「演示」badge）。


### 2026-10-17 18:00 验证记录（V）
- **动作**：本地全量门禁 + 浏览器走查三态。
- **证据/结果**：gate 0/0；node --test 190/190（含 M1 新增 5）；vitest 50/50；ui:generate→ui:check 绿；visual:check 差异 0.00%；台账 RC=0。走查（Owner，本地栈存活）：/models/market 当前 catalogSource=server → 「已连接模型中心，展示真实调用模型…」标注渲染正确、模型卡片无「演示」badge；强制 persist 切 demo → 复现为 AppShell 挂载自动 syncCatalog 覆盖（demo 仅首帧/后端慢时出现，源码测试已钉死 demo 分支与 badge 位置）；已恢复 server。
- **决策**：D-003 demo 态标注保留（首帧/降级前仍有意义，防误读）；不再扩大演示 badge 范围。
