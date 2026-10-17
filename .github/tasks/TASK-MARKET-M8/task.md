---
id: TASK-MARKET-M8
title: 撤销模型目录页、启停归位模型广场
status: 待验收
priority: P1
depends_on:
  - TASK-MARKET-M7
---

# TASK-MARKET-M8 任务卡

## 背景（Owner 三轮评审结论）

1. **能力归属暂不启用**：创作流只按「类型+启用」选模型（ProjectParams.tsx 证据），logicalModelId 不被消费；单渠道自用形态下「逻辑模型路由/候选兜底」无行为价值 → **归属编辑从 UI 撤下**（后端契约与数据结构保留，待多供应商场景按需启用）。
2. **模型目录页撤销**：归属撤下后目录仅剩「启停+未来价格编辑」两个操作，展示面与广场完全重叠，信息密度撑不起独立页面 → **删除模型中心「模型目录」**（Owner 拍板）。
3. **启停归位**：模型停用/启用能力不丢，移到模型广场卡片（Admin+ 可见），与「设为默认」同操作区。

## 目标一句话

模型中心导航 6 项 → 5 项（广场/渠道/成本/审计/健康）；广场卡片提供启停（Admin+）；旧深链（/settings/models、/settings/logical-models、/settings/models/catalog）落点改到 /models/market，保证 ADR-005 §6 不变量（跳转不 404）。

## 范围

- ✅ 删 `pages/ModelCatalog.tsx` + app.tsx 路由 + model-center-navigation catalog 项 + settings-navigation 落点
- ✅ 广场卡片加「停用/启用」（Admin+）
- ✅ 测试适配（settings-navigation.test.ts 落点断言）
- ❌ 不做：能力归属编辑（撤下）、价格编辑入口（价格录入走渠道策展已有；展示 M7 已完成）
- ❌ 不改后端（curation.go/逻辑模型契约保留，仅前端收敛）

## 验收要点

- 导航无「模型目录」；/models/catalog 与 /settings/models* 均不 404（落点改 market）
- 广场卡片 Admin+ 可见停用/启用，Viewer 不可见；停用后创作可选列表即时消失
- gate / ui:check / npm test 全绿
