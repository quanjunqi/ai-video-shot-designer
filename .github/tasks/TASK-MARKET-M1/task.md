---
taskId: TASK-MARKET-M1
status: 进行中
priority: P1（模型中心核心体验；模型广场真实化）
pr:
criteria: 6
criteriaPassed: 0
depends_on: TASK-IA-001（已合并 #221）
---

# TASK-MARKET-M1：模型广场真实化——来源标注与演示态引导

> 依据：`prototypes/settings-redesign/设置中心与模型中心IA v14.html` §2.2（广场=真实调用模型+详情）/ §2.3（目录=能力归属）；
> Owner 评审口径（2026-10-16 多轮）：**「模型广场展示的应该是真实调用的模型和模型详情吧」「模型目录才是能力归属」**、
> 「同步上游模型清单的时候，最好还是添加真实模型，归属让他后面去添加归属就好了」。
> 摸底（2026-10-17，两轮）：① 后端 supply/curate/sync 全链路 + BFF 透传 + 前端 api（listSupply/curateModel）已存在；
> ② **策展闭环（同步→供给池→curate 添加→目录可见，归属后补）已在 ModelChannels 渠道页实现**（CurationPanel + curation.ts 纯函数
> inferModelType/proposeFamily/draftFromSupply/validateCurateDraft/curateRequest；curation-ui.test.ts 已钉死），**不需要重复造供给 UI**。
> 本轮修正：真正的体验缺口 = **广场来源透明度**——`catalogSource` 三态（demo 内置默认 / server 后端目录 / offline-fallback 缓存）中，
> 仅 offline-fallback 有标注；**demo 态（未同步时）广场展示平台默认目录却无任何「演示/未真实接入」标注**，用户会误以为可真实调用。
> 本卡 = 广场来源状态条（三态统一标注）+ demo 模型「演示」badge + 空态引导校验。**纯前端，后端零改动。**

## 范围与边界

- 只改 ModelMarket（广场）：来源状态条 + 演示 badge；不动模型卡片/详情/设默认既有行为。
- 不改 ModelChannels / ModelCatalog / CurationPanel（策展闭环已完整，本卡不触碰）。
- 不新增迁移；不改 api 契约。
- demo 态语义：catalogSource==='demo' = 内置默认目录（平台模型示意，未接入真实调用）；标注文案明确「去渠道同步后展示真实模型」。

## 验收判据（6 条）

1. 广场顶部来源状态条覆盖三态：demo（黄条：「本地演示目录（平台默认模型示意），接入渠道并同步上游后展示真实调用模型」）/ server（蓝条或小字：「已连接模型中心，展示真实目录」）/ offline-fallback（保留现有文案，并入三态条）。
2. demo 态模型卡片带「演示」badge（与真实模型一目了然）；server 态无演示 badge。
3. 空态引导保持指向「渠道接入 + 目录供给」（现有文案复核，不退化）。
4. 详情抽屉不重复标注（卡片 badge 已表达）；demo 态设默认按钮仍可用但提示语义不变（个人默认，Owner 已确认）——只验证不回归。
5. 测试：node --test 新增 M1 断言（源码级：demo 标注文案、演示 badge、三态条分支、server 态无 demo 分支）；现有 curation/市场测试全绿。
6. 门禁全绿：前端 gate 0/0、node --test、vitest、ui/visual 绿；走查 demo 态标注可见、server 态无演示 badge、offline 态保留；台账门禁 RC=0。

## 实现提示

- 状态条组件放筛选行上方（offline-fallback 现有 `<p>` 并入）；demo/server 分支按 catalogSource 条件渲染。
- 「演示」badge 只在 catalogSource==='demo' 时渲染于卡片类型行。
- 文案避免「假数据」等负面词，用「演示目录/平台默认示意」中性表述。
