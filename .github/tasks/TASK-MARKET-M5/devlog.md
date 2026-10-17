# TASK-MARKET-M5 开发日志

> 规则：AC-010。开工即建，随开发追加。

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [task.md](task.md) |
| 验收清单 | [acceptance.md](acceptance.md) |
| 分支 | feature/market-capability-family-2026-10-18 |
| PR | #<n> |
| 开工 | 2026-10-18 00:40 |
| 开发者 | AI Agent |

## 执行轨迹

### 2026-10-18 00:40 开工/探查
- **动作**：梳理 family/归属现状。
- **证据**：待探查（model_catalog family 字段、curate 校验、协议模板 capabilities）。
- **决策**：D-001 待定。

### 2026-10-18 00:50 探查结论（范围精化）
- **动作**：逐项核查 M5 原范围 vs 现状。
- **证据**：
  - ModelCatalog.tsx：typeFilter（text/image/video 筛选）+ 归属编辑抽屉（logicalModelId/routePriority，Admin+）+「待归属」徽章 —— v14 契约已落地 ✓
  - curation.ts：`inferModelType`（明确不猜，认不出强制人工选）+ `proposeFamily`（=providerModel，跨渠道同款聚组）——「先添加后补归属」默认值已存在 ✓
  - newLogicalModelFromGroup：逻辑模型合并继承候选 type ✓
  - CurationPanel：family/type/模板均为表单字段；模板纯手动选择 ✗
  - curation.go:173 与 logicalmodel.go:129 各有一份 `text|image|video` 校验 —— 双份硬编码 ✗
- **决策**：D-001 M5 收窄为 2 个真实缺口（能力族单一来源 + 协议模板建议），更新验收清单 3 条。

### 2026-10-18 01:10 开发/验证
- **动作**：①curation.go type 校验改共用 ValidLogicalModelType（单一来源）；②前端 suggestTemplateId（按 type 匹配 builtin，优先 OpenAI 兼容族）+ CurationPanel type 选择时自动建议（已手工选过不覆盖）。
- **证据**：
  - 后端：TestCurateTypeSharedValidation 7 例 PASS（text/image/video 合法；embedding/model/空/大写非法）；production `go test ./... -race` 全绿；`go vet` 通过。
  - 前端：`npm run gate` 0 错误 0 警告；quality-gate 通过。
  - 浏览器实测（/models/channels → pearapi 策展 → 加入目录表单）：type 选「图像 image」→ 协议模板自动建议「OpenAI 兼容图片（Images API）」；family 自动带出 providerModel。
- **决策**：D-002 建议逻辑优先 OpenAI 兼容族（openai-compatible / pt_builtin_openai*），回退首个 builtin 匹配 —— 兼容本地常量与 server 模板两套 id，不硬编码。

## 纪律自检

- [x] 日志随开发同步记录（非一次性补写）
- [x] 先本地验证再提交（后端单测+全量、前端 gate、浏览器交互实测）
- [x] 未改用户未要求范围（仅 2 个缺口；目录分组/归属编辑等已存在项未动）
