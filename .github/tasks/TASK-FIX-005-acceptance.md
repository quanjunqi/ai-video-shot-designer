# 需求验收清单：TASK-FIX-005（创建页积分 NaN/undefined 兜底）

> 按 acceptance-checklist 模板填写；随开发完成逐项勾对，PR 附勾对结果。

---

## 任务信息

- 任务名称：/create/image 积分显示 NaN/undefined 兜底
- 关联需求/任务卡：TASK-FIX-005（来源 T13 验收缺口 2）
- 开发者（AI）：Doubao MainAgent
- 开工日期：2026-10-15
- 目标一句话：创建页计费行不再出现 NaN/undefined；计费配置缺失时展示合理兜底文案，不编造积分值。

---

## 一、需求点 → 可验证判据

| # | 需求点（任务卡） | 验收判据（可客观验证） | 判据四要素备注 | 自检结果 |
|---|---|---|---|---|
| 1 | /create/image 无 NaN/undefined 文案 | 浏览器打开 /create/image → 页面文本不含 `NaN`、`undefined`（get_page_text 断言） | 判据/对象：5174 /create/image；时点：修复后 | ☑ 过 |
| 2 | 计费配置缺失时合理兜底 | 选中 PearAPI GPT-Image 2 → 计费行显示「按上游用量结算，提交前无法预估」（或等价兜底），不显示 NaN | 同上 | ☑ 过 |
| 3 | 目录配置齐全的模型正常展示积分 | 选中 catalog 内模型（如 gpt-image-2）→ 显示「N 积分/张 × 张」 | 同上 | ☑ 过 |
| 4 | estimateCost 不产出 NaN | `estimateCost` 对非有限单价返回 undefined；代码审查确认 | 代码审查 | ☑ 过 |
| 5 | 前端门禁全绿 | `cd apps/web && npm run gate` → GATE=0；`npm test` 全绿 | 提交前 | ☑ 过 |

---

## 二、三态与边界

| # | 场景 | 预期 | 自检结果 |
|---|---|---|---|
| 1 | pricing 缺失（pearapi 渠道模型无 catalog 配置） | 兜底文案，无 NaN | ☑ 过 |
| 2 | pricing 为 0（本地模型 0 积分） | 正常展示 0 积分 | ☑ 过 |
| 3 | 文本类模型（按 Token 无法预估） | 既有「无法预估」文案不回归 | ☑ 过 |

---

## 三、门禁与测试

| # | 检查 | 命令 | 结果 |
|---|---|---|---|
| 1 | GATE=0 | `cd apps/web && npm run gate` | ☑ 过 |
| 2 | 前端测试 | `cd apps/web && npm test` | ☑ 过 |
| 3 | L3 浏览器验证 | /create/image 无 NaN + 兜底文案（get_page_text 断言） | ☑ 过 |
