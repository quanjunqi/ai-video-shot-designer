# TASK-MARKET-M7 开发日志

> 开发过程的事实源：**动作 / 证据 / 决策 / 阻塞** 四类条目，随开发同步记录。
> 审计 agent（人或 AI）依此还原：是否先测试后提交、是否越界、验证是否真实、决策是否成立。
> 规则：AC-010（`.agents/skills/acceptance-checklist/SKILL.md`）。**开工即建，随开发追加，PR 前完成；禁止交付前一次性补写。**
> 机器可读配套：与本文件**同步维护** `devlog.events.json`（结构化事件流，审计 agent 直接消费；AC-011）。本 md 是人读主版本，events.json 是同一事实的结构化投影——两者不得互相矛盾。

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [TASK-MARKET-M7.md](TASK-MARKET-M7.md) |
| 验收清单 | [acceptance.md](acceptance.md) |
| 分支 | `feature/market-price-display-2026-10-18` |
| PR | #<n>（合并 sha：<sha>） |
| 开工 | 2026-10-18 03:05（本地） |
| 完成 |  |
| 开发者 | AI Agent |

## 执行轨迹（正序；每个动作一条）

> 一条 = 时间 + 阶段 + 动作 + 发现/证据（命令与输出摘要，完整输出引用 PR/文件）。决策单列 D-xxx。

### 2026-10-18 03:05 开工/探查
- **动作**：探查价格链路全貌（上游 → 同步 → 策展落库 → 目录返回 → 前端展示）
- **发现/证据**：
  - PearAPI `/v1/models` 83 个模型全不带 pricing；`/v1/pricing` 偶发 JSON 后稳定 HTML（防爬）⇒ 自动拉价对 PearAPI 不可行
  - 录入链路已存在：CurationPanel priceAmount/priceUnit → curateRequest → api.curateModel → curation.go PriceAmount → 落 price_amount（manual）
  - 后端目录返回已带 priceAmount/priceUnit/priceSource（postgres.go）；BFF client.ts 类型已声明
  - **断点唯一（前端）**：CatalogModel 无价格字段；serverModelToLocal 不映射；modelPrice.ts 只读 capability.billing（DB billing 空 → 显示「—」）
- **决策**：D-001 M7 只做前端三处（类型补字段 / 映射 / modelPrice 优先独立列回退 billing + price_source 溯源展示）；后端与录入不动

### 2026-10-18 03:35 开发/验证
- **动作**：前端三处（CatalogModel 补 priceAmount/priceUnit/priceSource、serverModelToLocal 映射、modelPrice 优先独立列回退 billing）+ 详情抽屉 price_source 溯源行；补 modelPrice 三分支单测（5 pass）
- **发现/证据**：验证时发现第二个断点 —— production 目录查询 SQL 漏 SELECT price_amount/price_unit（postgres.go），Model 结构也缺字段（model.go）→ 补列 + 补结构字段 + 重启服务后 BFF 透传返回 1.5/百万Token/manual
- **发现/证据（D-002）**：详情抽屉 TextRows「计费明细」仍读 billing（空 →「—」）却显示「价格来源：人工录入」——语义矛盾；修 textBilling 优先独立价格列
- **决策**：D-002 文本计费明细行优先独立价格列（显示 ¥{amount}/{unit}），回退 M6 双价逻辑

### 2026-10-18 03:55 门禁/验证/勾对
- **动作**：全量门禁复跑（textBilling 修复后）
- **发现/证据**：`npm run gate` exit=0（0 错 0 警 + 反模式未命中）；`npm run ui:check` ✓；`npm test` node 202 pass + vitest 50 pass
- **动作**：L3 浏览器复验 —— 卡片「¥1.5/百万Token起」；详情抽屉「计费明细 ¥1.5/百万Token」「价格来源 人工录入」
- **发现/证据**：后端目录查询漏列修复后 production 直查 1.5/百万Token/manual，BFF 透传一致
- **验证说明**：判据 4 用 DB 手填模拟 manual 录入验证（真实录入走 CurationPanel，链路已存在）；验证数据保留便于用户观察
