---
taskId: TASK-PROTOCOL-006
status: 待验收
priority: P1（协议层治理收口——接真实渠道走通 protocol-gen 全流程）
pr: null
criteria: 6
criteriaPassed: 6
depends_on: TASK-PROTOCOL-003（生成器在 develop）+ TASK-PROTOCOL-005（audit 快照机制）
---

# TASK-PROTOCOL-006：接真实渠道实战——OpenAI Responses API 全流程首战

> **来源**：TASK-PROTOCOL-003 SOP 的首个完整实战（此前只对既有定义做核验）。
> 目标：用**真实上游规范**（OpenAI 官方 openapi.json，GitHub openai/openai-openapi）
> 走通「获取规范 → 生成 → 审查 → 落库 → 回归验证」五步，新增 `pt_builtin_openai_responses`
> （Responses API = OpenAI 2025+ 主力契约，本仓 9 模板缺失）。

## 判据

| # | 检查 | 判据 |
|---|---|---|
| 1 | 规范可追溯 | 官方 openapi.json 下载留档 + 来源/时间注记（无依据不填） |
| 2 | 生成确定性 | protocol-gen 从 /responses 端点确定性输出（method/request_path/params/required） |
| 3 | 审查留痕 | capabilities=text-chat（061 枚举）；param_mapping 标注「待真实渠道实测」不臆测 |
| 4 | 落库三处同步 | 迁移 068（UPDATE）+ protocol_registry.go（注册表 id）+ 快照更新 |
| 5 | 回归验证 | audit 通过（注册表↔DB↔快照无漂移）+ 执行器 HasCapability 冒烟 |
| 6 | 台账/门禁 | 台账三方一致 + go test + preflight 门 0d |

## 设计决策

- Responses API 是 OpenAI 官方新一代 chat 契约（POST /v1/responses）；basePath=/v1
- params 从官方 requestBody schema 提取（$ref 合并）；response_extract 只推结构路径（顶层 k）
- param_mapping 无实测依据 → 标注待测（061 证据分级）
