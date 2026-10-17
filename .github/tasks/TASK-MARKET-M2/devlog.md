# TASK-MARKET-M2 开发日志

> 开发过程的事实源：**动作 / 证据 / 决策 / 阻塞** 四类条目，随开发同步记录。
> 审计 agent（人或 AI）依此还原：是否先测试后提交、是否越界、验证是否真实、决策是否成立。
> 规则：AC-010（`.agents/skills/acceptance-checklist/SKILL.md`）。**开工即建，随开发追加，PR 前完成；禁止交付前一次性补写。**
> 机器可读配套：与本文件**同步维护** `devlog.events.json`（结构化事件流，审计 agent 直接消费；AC-011）。本 md 是人读主版本，events.json 是同一事实的结构化投影——两者不得互相矛盾。

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [task.md](task.md) |
| 验收清单 | [acceptance.md](acceptance.md) |
| 分支 | `feature/market-model-run-2026-10-17` |
| PR | #（待开） |
| 开工 | 2026-10-17 19:00（本地） |
| 完成 | （待） |
| 开发者 | AI Agent（MainAgent） |

## 执行轨迹（正序；每个动作一条）

> 一条 = 时间 + 阶段 + 动作 + 发现/证据（命令与输出摘要，完整输出引用 PR/文件）。决策单列 D-xxx。

### 2026-10-17 19:00 开工/探查
- **动作**：摸底「模型测试」现状（用户追问）：execution /tasks/run 同步真实生成（文本 ~5s/图片 30-120s/视频异步）；BFF /api/v1/tasks 通用透传；前端 api.runModelTest → RunModelTestResponse{ok,run{status,extracted,rawBody}}；业务已在用（角色库/道具库抽取）。渠道连通检测已真实化（probeChannel→BFF probe 真实 HTTP 探测；接口注释「假调通」为旧残留）。
- **发现/证据**：真实调用链路完整；缺口=模型中心无可见试跑 UI。
- **决策**：D-001 纯前端加「试跑」入口（广场详情抽屉，Admin+，text 同步可跑、image/video 禁用说明）；不重复连通检测/业务抽取；顺带清理 testChannel 旧注释。

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


### 2026-10-17 19:30 验证记录（V）
- **动作**：本地全量门禁 + 浏览器走查（Owner/Viewer）。
- **证据/结果**：gate 0/0；node --test 196/196（含 M2 新增 6）；vitest 50/50；ui:generate→ui:check 绿；visual:check 差异 0.00%；台账 RC=0。走查（本地栈存活）：Owner 打开 MiniMax-Text-01 详情 → 「试跑」区渲染 → 点「发起试跑」→ 真实调用 execution → 如实展示 error「catalog: upstream 403: missing actor role」（execution→catalog 本地 dev 链路 actor 传递问题，非前端 bug；前端不伪造成功）；Viewer 详情无试跑入口、详情字段正常；已恢复 Owner。
- **决策**：D-002 试跑 error 如实展示为正确行为；execution→catalog 的 actor 403 属本地 dev 链路配置，不在本卡范围（可后续单独立项）。
