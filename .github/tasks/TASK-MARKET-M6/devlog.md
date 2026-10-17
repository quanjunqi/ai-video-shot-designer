# <TASK-ID> 开发日志

> 开发过程的事实源：**动作 / 证据 / 决策 / 阻塞** 四类条目，随开发同步记录。
> 审计 agent（人或 AI）依此还原：是否先测试后提交、是否越界、验证是否真实、决策是否成立。
> 规则：AC-010（`.agents/skills/acceptance-checklist/SKILL.md`）。**开工即建，随开发追加，PR 前完成；禁止交付前一次性补写。**
> 机器可读配套：与本文件**同步维护** `devlog.events.json`（结构化事件流，审计 agent 直接消费；AC-011）。本 md 是人读主版本，events.json 是同一事实的结构化投影——两者不得互相矛盾。

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [TASK-XXX-….md](TASK-XXX-….md) |
| 验收清单 | [TASK-XXX-acceptance.md](TASK-XXX-acceptance.md) |
| 分支 | `<prefix>/<简述>-<日期>` |
| PR | #<n>（合并 sha：<sha>） |
| 开工 | YYYY-MM-DD HH:MM（本地） |
| 完成 | YYYY-MM-DD HH:MM |
| 开发者 | AI Agent（会话 <id>） |

## 执行轨迹（正序；每个动作一条）

> 一条 = 时间 + 阶段 + 动作 + 发现/证据（命令与输出摘要，完整输出引用 PR/文件）。决策单列 D-xxx。

### YYYY-MM-DD HH:MM 开工/探查
- **动作**：
- **发现/证据**：
- **决策**：D-001

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

### 2026-10-18 02:20 开发/验证
- **动作**：①capability 类型补全（CapabilityEvidence + image/video 证据字段）；②拆 ModelMarket（407 行超规范）→ ModelMarketCard/ModelDetailSheet/modelPrice 三文件；③卡片加关键能力行；④详情抽屉加协议模板名（含 async 标记）+ 文本计费明细行 + 能力依据区（证据溯源）；⑤修复遗留嵌套 button（整卡 button 内 Button → 卡片改 div role=button，hydration 错误清零）。
- **证据**：
  - 前端 gate 0 错 0 警 + 反模式未命中。
  - 浏览器实测（/models/market）：卡片关键能力行 ✓（GPT-Image 2「参考图生图/3 比例/4 档清晰度」、DeepSeek「最大 8000 Tokens」、Seedance「4–30s/4 种模式」、无能力模型「能力未校准」兜底）；Seedance 详情抽屉 ✓（协议模板「OpenAI 兼容 · 视频生成（PearAPI/openai-video）（异步任务）」+ 能力依据 official/high/日期 + 参考 30/10/10 + 清晰度档位）；DeepSeek 详情 ✓（模板 label「OpenAI 兼容 Chat」+ 计费明细「—」兜底 + 请求形状）；console 无错误。
- **决策**：D-001 证据溯源展示 = 展示 source/confidence/verifiedAt 三要素（evidenceFile 为仓库路径不展示，避免长文本）；D-002 卡片关键能力行按类型收敛 1-3 个标签（选择视角，不堆字段）。

## 纪律自检

- [x] 日志随开发同步记录
- [x] 先本地验证再交付（gate + 浏览器实测全链路）
- [x] 拆分遵守 react-refresh 规则（共享函数独立文件）
- [x] 修复探查中发现的既有 bug（嵌套 button），未越界扩展
