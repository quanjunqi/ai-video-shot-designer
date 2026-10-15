# 任务卡：创建页积分显示 NaN（T13 验收缺口 2）

> 按 `.github/TASK_TEMPLATE.md` 填写。来源：TASK-INFRA-005 全链路验收缺口 #2（P1）。

## 基本信息

- **任务 ID**：TASK-FIX-005
- **任务名称**：/create/image 积分显示 NaN/undefined（catalog 计费配置兜底）
- **创建日期**：2026-10-15
- **人类 Owner**：quanjunqi
- **AI 执行者**：Doubao MainAgent
- **优先级**：P1（影响计费信息可读，不阻断链路）
- **预计工时**：0.5 人日

---

## 1. 问题描述

真机走查 `http://localhost:5174/create/image`：选中模型档位「PearAPI GPT-Image 2 · pearapi」时，积分显示为 `NaN 积分` / `undefined 积分/张 × 1 张`。

**根因**（已定位）：`apps/web/src/features/genworkbench/CreateWorkbench.tsx` / `queue-utils.ts` 从 `src/config/models/model-catalog.ts` 读 `schema.pricing.pointsPerImage` 拼接计费文案；当前选中模型在目录中无匹配条目（或 `pointsPerImage` 未配置）→ `undefined` → 模板字符串渲染成 `NaN / undefined`，前端无兜底。

**影响**：「按能力选模型」时计费信息不可读，误导成本判断。

## 2. 修复要求

- ✅ 计费文案渲染加兜底：`pointsPerImage` / `pointsPerSecondStart` 缺失或为 0 时展示「以目录声明为准」或隐藏计费行，禁止 NaN/undefined 直出
- ✅ 核查 PearAPI GPT-Image 2 是否应有目录条目；缺配置则补目录（若模型确无计费配置，则按产品口径展示兜底文案）
- ❌ 不改上游 API / 不引入假积分值
- 交付前跑 `cd apps/web && npm run gate`（GATE=0）+ 浏览器验证 /create/image 计费行不再出现 NaN/undefined

## 3. 验收判据（四要素）

| # | 判据 | 对象 | 时点 | 例外 |
|---|---|---|---|---|
| 1 | /create/image 页面无 NaN/undefined 文案 | 真机走查 5174 | 修复后 | 目录配置齐全的模型正常展示积分 |
| 2 | 计费行有合理兜底（配置缺失时） | 截图 | 修复后 | — |
| 3 | GATE=0 / 测试全绿 | CI | 提交时 | — |

## 4. 禁止事项

- ❌ 顺手修其它验收缺口（任务中心崩溃走 TASK-FIX-004）
- ❌ 编造积分值掩盖问题
