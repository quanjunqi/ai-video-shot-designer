---
id: TASK-MARKET-M6
title: 模型广场真实详情专业化
status: 待验收
priority: P1
depends_on:
  - TASK-MARKET-M5
---
# TASK-MARKET-M6 模型广场真实详情专业化

**需求**：模型广场展示真实调用模型 + 详情（v14 §2.2）。数据层已真实（M1-M5），展示层信息薄：卡片缺关键能力、详情抽屉缺协议模板/计费明细/能力依据（证据溯源）。

**探查结论**：
- capability 数据真实完整（Seedance 2.5 / GPT-Image 2 / DeepSeek 含 modesSource/tiersSource 证据溯源），但 TS 类型未对齐
- CatalogModel.protocolTemplateId 已有，详情抽屉未展示模板名
- 文本计费只有起步单价，未展示 input/output 双价
- 能力依据（source/confidence/verifiedAt/evidenceFile）服务端已返回，UI 未展示

**范围**（收敛，不越界）：卡片关键能力行 + 详情抽屉补齐（协议模板/计费明细/能力依据）+ capability 类型对齐。不动筛选/排序/设默认/试跑。
