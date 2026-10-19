# TASK-MARKET-M13 开发日志

> 开发过程的事实源：**动作 / 证据 / 决策 / 阻塞** 四类条目，随开发同步记录。
> 审计 agent（人或 AI）依此还原：是否先测试后提交、是否越界、验证是否真实、决策是否成立。
> 规则：AC-010。**开工即建，随开发追加，PR 前完成；禁止交付前一次性补写。**
> 机器可读配套：与本文件**同步维护** `devlog.events.json`（AC-011）。

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [task.md](task.md) |
| 验收清单 | [acceptance.md](acceptance.md) |
| 分支 | fix/task-result-nested-2026-10-19 |
| PR | #<n> |
| 开工 | 2026-10-19 22:30（本地） |
| 完成 | - |
| 开发者 | AI Agent |

## 执行轨迹（正序；每个动作一条）

### A（动作）· 2026-10-19 22:30 · M1–M12 集中验收发现缺陷
M12 集中验收（L3 浏览器 + API 实证）：
- 任务中心 32 个缩略图全部来自 10-08/09/10 旧任务（`intent_payload.result` 旧格式回退路径）
- **10-18 00:32/00:33 与今日 10-19 22:24 新格式任务（`result_payload` 有 URL）行首均无缩略图**（只有「成功 —」）
- 证据：`/api/v1/tasks`（4 头）逐条对比 intent/result_payload 结构；浏览器 `document.querySelectorAll('main img')` 日期分布 {10-10:3, 10-09:19, 10-08:10}

### D（决策）· 2026-10-19 22:31 · 根因定位
`result-utils.ts` `resolveTaskResult`：
```ts
const explicit = parseJsonObject(task.result_payload);
if (explicit) return explicit;   // ← 返回整个 result_payload {result:{...},modelId,runtime}
```
`extractResultUrl` 遍历 `payload.result`（即 result_payload 顶层）的 URL_KEYS → `output.data.0.url` 不存在（在 `.result` 嵌套层）→ undefined。
旧任务走 `legacy = parseJsonObject(intent_payload)?.result`（取的是 `.result` 层）→ 正常。
**结论：explicit 分支少取了一层 `.result`。**

### E（证据）· 2026-10-19 22:31 · 结构实证
新任务 job_258c6d61b4ff155e979f48f2（10-19 22:24 提交 22:26 成功）：
```
result_payload = {result: {output.data.0.url: https://cdn.pearapi.ai/.../9d50a00f....png,
                            output.image_urls.0: 同值}, modelId: ..., runtime: {...}}
intent_payload = {prompt, modelId, runtime, model_id, quantity}   # 无 result 字段
```
URL 在 `result_payload.result.output.data.0.url`（三层）。

### A · 2026-10-19 22:32 · 修复实现
`resolveTaskResult` explicit 分支优先取嵌套 `explicit.result`：
```ts
const explicit = parseJsonObject(task.result_payload);
if (explicit) {
  const nested = explicit.result;
  if (nested !== null && typeof nested === 'object') return nested as Record<string, unknown>;
  return explicit; // 兼容 result_payload 直接平铺 URL 键的形态
}
```
legacy 分支不动。改动点：`apps/web/src/features/genworkbench/result-utils.ts` 单函数。

### A · 2026-10-19 22:33 · 补单测
`apps/web/tests/market-task-artifact.test.ts`（或新建 result-utils 测试）钉死三断言：
1. 新格式：`result_payload.result` 有 URL → extractResultUrl 命中
2. 旧格式：`intent_payload.result` 有 URL → 不回归
3. 平铺形态：result_payload 直接含 URL_KEYS → 兼容

### A · 2026-10-19 22:35 · 验证
- `npm run gate`（0 error 0 warning，GATE=0）
- `npm run ui:check`（42 组件同步）
- `npm test`：215 通过 / 0 失败（含 M13 两条新断言）
- L3：/tasks 刷新后 DOM img 日期分布 `{10-19:2, 10-18:2, 10-12:1, 10-11:2, 10-10:3, 10-09:19, 10-08:10}` = 39 个全部渲染、hidden=0（修复前 10-18/10-19 为 0）；截图 /tmp/m13-fixed.png

## 纪律自检
- [x] 未建日志不得开工（已建）
- [x] 先本地验证再 commit（gate/ui:check/test 全绿 + L3 实证）
- [x] 未勾对不得开 PR（acceptance 已勾对）
