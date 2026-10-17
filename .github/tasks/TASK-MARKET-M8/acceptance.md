# TASK-MARKET-M8 需求验收清单

> 用法：每个开发任务开工前复制本模板，按任务实际填写。开发完成后逐项自检勾对。
> 每项判据必须可验证——能用命令/截图/数据证明的，不写模糊话术。

---

## 任务信息

- 任务名称：撤销模型目录页、启停归位模型广场
- 关联需求/任务卡：TASK-MARKET-M8（depends_on M7）
- 开发者（AI）：AI Agent
- 开工日期：2026-10-18
- 目标一句话：模型中心收敛为 5 项导航；目录页删除、启停归位广场（Admin+）；旧深链不 404

---

## 一、需求点 → 可验证判据

| # | 需求点（用户原话/文档） | 验收判据（可客观验证） | 判据四要素备注 | 自检结果 |
|---|---|---|---|---|
| 1 | 删除模型中心「模型目录」 | `model-center-navigation.ts` 的 `MODEL_CENTER_NAV` 无 catalog 项；`app.tsx` 无 `path="catalog"` 路由；`pages/ModelCatalog.tsx` 文件已删 | 判据：源码/文件检查；对象：导航与路由；时点：改后 | ☑ 过 |
| 2 | 旧深链落点不 404 | `/settings/models`、`/settings/logical-models`、`/settings/models/catalog` 三条重定向落点改为 `/models/market`（SETTINGS_LEGACY_PATHS + 测试断言同步）；`/models/catalog` 从 `SETTINGS_EXTERNAL_TARGETS` 移除 | 判据：settings-navigation.test.ts 通过 | ☑ 过 |
| 3 | 广场卡片提供启停（Admin+） | ModelMarketCard 操作区「设为默认」旁有「停用/启用」按钮：Admin/Owner 可见可点，Viewer 不可见；停用后卡片标记与创作可选列表即时变化 | 判据：L3 浏览器三角色断言 | ☑ 过 |
| 4 | 能力归属编辑撤下、后端契约保留 | 前端无 logicalModelId/routePriority 编辑 UI；`services/production/internal/catalog/` 逻辑模型代码未改 | 判据：源码检查 + git diff | ☑ 过 |
| 5 | 门禁全绿 | `npm run gate` GATE=0；`npm run ui:check` ✓；`npm test` 全过；无 TypeScript 残留引用（ModelCatalog 无 import） | 判据：命令退出码 | ☑ 过 |

> 判据四要素：**判据**（看什么算过）、**对象**（哪个文件/接口/页面）、**时点**（什么时候看）、**例外**（什么情况不算失败）。

---

## 二、设计稿逐点映射（UI 任务必填；非 UI 任务如有设计稿也必填）

**设计稿信息**：Owner 三轮评审直接拍板（能力归属无消费证据 → 撤 UI；目录页信息密度不足 → 删页；启停归位广场）。原型 `prototypes/model-center/M8-模型档案编辑.html` 已按其意见迭代（撤销档案抽屉只读区；最终方向改为删页，原型作为评审过程留痕）。
（AC-009：UI 任务设计稿先行；本任务为删除+单按钮增量，Owner 已就交互方向直接决策，原型评审通过后进入开发）

| # | 设计稿模块 | 对应需求点 | 实现位置（组件/页面） | 偏差说明 | 自检结果 |
|---|---|---|---|---|---|
| 1 | 目录表格（含价格列原型） | 1 | `pages/ModelCatalog.tsx`（删除） | 原型评审结论：页面整体撤销，非改造 | ☑ 过 |
| 2 | 广场卡片操作区（设为默认旁加启停） | 3 | `ModelMarketCard.tsx` / `ModelMarket.tsx` | Admin+ 可见，Viewer 隐藏 | ☑ 过 |

---

## 三、三态与边界（AC-006）

| # | 场景 | 判据 | 自检结果 |
|---|---|---|---|
| 1 | 无模型（目录空） | 广场空态提示存在，无残留目录空态引用 | ☑ 过 |
| 2 | 渠道停用的模型 | 停用按钮 disabled（不可重复停用），卡片标「渠道停用」 | ☑ 过 |
| 3 | Viewer 角色 | 广场无启停按钮、无归属编辑 | ☑ 过 |
| 4 | 旧深链访问 | /settings/models、/settings/models/catalog 浏览器访问跳转 /models/market 不 404 | ☑ 过 |
| 5 | 已停用模型 | 广场仍显示行/卡片并标「已停用」，创作可选列表不含 | ☑ 过 |

---

## 四、反模式速查（AC-007）

| # | 反模式 | 是否命中（☐ 否 = 未命中） | 说明 |
|---|---|---|---|
| 1 | 前端 `any` / `as any`（FE-TS-001） | ☐ 否 | |
| 2 | store 整对象解构（FE-STATE-001） | ☐ 否 | |
| 3 | 组件内裸 fetch（FE-API-001） | ☐ 否 | |
| 4 | 内联样式（动态值除外）（FE-STYLE-001） | ☐ 否 | |
| 5 | 删除无确认弹窗（FE-UX-001） | ☐ 否 | 启停有确认 |
| 6 | 三态缺失 loading/error/empty（FE-STATE-002） | ☐ 否 | |
| 7 | 未用仓库 Button/Input 等组件（FE-UI-001） | ☐ 否 | |
| 8 | 禁内联样式 | ☐ 否 | |
| 9 | 后端硬编码错误码（BE-ERR-001） | ☐ 否 | 未改后端 |
| 10 | 金额 float64 / 时间无时区（BE-DATA-001） | ☐ 否 | 未改后端 |

---

## 五、门禁与验证记录（交付前必填）

| 项 | 结果 | 备注 |
|---|---|---|
| npm run gate | ☐ GATE=0 / ☐ 非 0 | |
| npm run ui:check | ☐ ✓ / ☐ ✗ | |
| npm test | ☐ pass / ☐ fail | |
| L3 浏览器验证 | ☐ 通过 / ☐ 未验 | 三角色 + 旧深链 + 停用影响创作列表 |

> 勾对完成后，PR 附本清单 + devlog 链接；未过项必须写明原因与后续。
