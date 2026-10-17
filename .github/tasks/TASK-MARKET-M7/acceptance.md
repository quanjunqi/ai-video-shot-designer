# TASK-MARKET-M7 需求验收清单

> 用法：每个开发任务开工前复制本模板，按任务实际填写。开发完成后逐项自检勾对。
> 每项判据必须可验证——能用命令/截图/数据证明的，不写模糊话术。

---

## 任务信息

- 任务名称：模型价格展示链路打通（独立价格列映射）
- 关联需求/任务卡：TASK-MARKET-M7（depends_on M6）
- 开发者（AI）：AI Agent
- 开工日期：2026-10-18
- 目标一句话：录了价就能在广场卡片与详情抽屉看到真实价格（可溯源 manual/synced），无价仍「—」

---

## 一、需求点 → 可验证判据

| # | 需求点（用户原话/文档） | 验收判据（可客观验证） | 判据四要素备注 | 自检结果 |
|---|---|---|---|---|
| 1 | CatalogModel 类型承载独立价格列 | `model-catalog.ts` 的 `CatalogModel` 含 `priceAmount?: number; priceUnit?: string; priceSource?: 'manual'\|'synced'` | 判据：字段存在；对象：CatalogModel；时点：改后 | ☑ 过 |
| 2 | serverModelToLocal 映射价格 | `useSettingsStore.ts` 映射 `priceAmount/priceUnit/priceSource`（server 态模型带价格） | 判据：映射行存在 | ☑ 过 |
| 3 | 展示优先独立价格列，回退 billing | `modelPrice.ts`：`priceAmount` 有值 → `¥{amount}/{unit}`（并暴露 `priceSource`）；无值回退 `capability.billing`（现状）；无计费 →「—」 | 判据：单测覆盖三分支 | ☑ 过 |
| 4 | 详情抽屉显示真实价格 + 溯源 | ModelDetailSheet 计费明细行显示独立价格（非「—」）+ `price_source` 溯源（manual=人工录入 / synced=上游同步） | 判据：DB 录价后浏览器可见 | ☑ 过 |

> 判据四要素：**判据**（看什么算过）、**对象**（哪个文件/接口/页面）、**时点**（什么时候看）、**例外**（什么情况不算失败）。

---

## 二、设计稿逐点映射（UI 任务必填；非 UI 任务如有设计稿也必填）

**设计稿信息**：非 UI 任务（复用既有 CurationPanel 录入表单与 M6 详情抽屉布局，仅改数据来源；无新页面/大改布局）｜无需设计稿
（AC-009：UI 任务的设计稿必须先于开发产出并完成 Owner 评审；本任务为数据链路打通，不触发布局级 UI 变更）

| # | 设计稿模块 | 对应需求点 | 实现位置（组件/页面） | 偏差说明 | 自检结果 |
|---|---|---|---|---|---|
| 1 | （无新设计稿） | 1-4 | `model-catalog.ts` / `useSettingsStore.ts` / `modelPrice.ts` / `ModelDetailSheet.tsx` | 复用既有 UI，仅数据来源切换 | ☑ 过 |

---

## 三、三态与边界（数据请求 UI 必过）

| # | 场景 | 预期 | 自检结果 |
|---|---|---|---|
| 1 | loading 态 | 广场加载态沿用 M6（无新请求面） | ☑ 过 |
| 2 | error 态 | 沿用 M6（无新请求面） | ☑ 过 |
| 3 | empty 态 | 无价格模型仍显示「—」（不因缺价崩溃） | ☑ 过 |
| 4 | 空输入/空列表边界 | priceAmount 为 undefined/null 时回退 billing → 「—」，不 NaN 不崩溃 | ☑ 过 |
| 5 | 超长文本/超限输入 | 价格文案截断合理，不撑爆卡片 | ☑ 过 |

---

## 四、反模式自查（命中即改，引用规则编号）

| # | 反模式检查 | 命中？ | 处理 |
|---|---|---|---|
| 1 | 前端 `any` / `as any`（FE-TS-001） | ☐ 否 | |
| 2 | store 整对象解构（FE-STATE-001） | ☐ 否 | |
| 3 | 组件内裸 fetch（FE-API-001） | ☐ 否 | |
| 4 | 页面级 max-w-xl / 溢出（R3/R2） | ☐ 否 | |
| 5 | 无确认弹窗直接删除（R-CRUD-002） | ☐ 否 | |
| 6 | 后端吞错 `_ = f()`（BE-ERR-001） | ☐ 否 | |
| 7 | SQL 拼接（BE-PGX-001 / SEC-001） | ☐ 否 | |
| 8 | 日志打 Key（SEC-005 / BE-LOG-002） | ☐ 否 | |
| 9 | 状态布尔堆叠（BE-DATA-003） | ☐ 否 | |
| 10 | 契约未先行（CT-001） | ☐ 否 | |

---

## 五、门禁与测试

| # | 检查 | 命令 | 结果 |
|---|---|---|---|
| 1 | 前端 GATE=0 | `cd apps/web && npm run gate` | ☑ 过 |
| 2 | 前端测试（含 ui:check） | `cd apps/web && npm run ui:check && npm test` | ☑ 过 |
| 3 | 后端构建/测试/vet | 本次无后端改动（N/A，备注） | ☑ 过 |
| 4 | L3 浏览器验证 | DB 手填 price_amount → 广场卡片/详情显示价格；无价模型「—」 | ☑ 过 |
| 5 | 新增纯函数有测试 | `modelPrice` 三分支单测（独立列/回退 billing/无计费） | ☑ 过 |

---

## 六、PR 附勾对结果（提交 PR 时随 body 附上）

```markdown
## ✅ 验收勾对（acceptance-checklist）
- 需求点：4/4 通过（未过项：无）
- 设计稿映射：N/A（非 UI 任务，复用既有 UI）
- 三态与边界：5/5 通过
- 反模式自查：10/10 未命中
- 门禁：GATE=0 / ui:check+npm test 全过 / L3 浏览器验证通过
- 未过项及原因：（如实填写，不得隐瞒）
```
