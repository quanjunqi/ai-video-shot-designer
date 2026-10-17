# TASK-MARKET-M6 验收清单

| # | 判据 | 判据对象 | 验证时点 | 结果 |
|---|---|---|---|---|
| 1 | 广场卡片展示关键能力标签（文本=maxTokens、图片=参考图生图/比例、视频=时长/模式） | ModelMarket 卡片 | 浏览器实测（seedance/gpt-image-2） | ✅ |
| 2 | 详情抽屉含：协议模板名（含 async 标记）+ 文本 input/output 双价 + 能力依据区（source/confidence/verifiedAt） | ModelDetailBody | 浏览器实测 + gate | ✅ |
| 3 | capability 类型补全证据溯源字段（可选），服务端透传数据可访问；npm run gate 0 错 0 警 | model-catalog.ts 类型 | gate | ✅ |
