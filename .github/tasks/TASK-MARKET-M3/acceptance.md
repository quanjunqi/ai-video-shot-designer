# TASK-MARKET-M3 验收清单

| # | 需求点 | 判据（四要素） | 自检 |
|---|---|---|---|
| 1 | UI 切到 server 数据源 | 打开 /models/catalog，页面展示 server 真实目录（含 m_pearapi_claude_haiku2/boogu_image/DeepSeek 等 7 个），非 demo 内置清单（判据：模型名匹配 server；时点：页面加载后；例外：BFF 不可达时显示 offline-fallback） | ☐ |
| 2 | 广场同源 | /models/market 与目录同源展示 server 模型（判据：两页模型集合一致；时点：加载后） | ☐ |
| 3 | 三态语义 | catalogSource 三态切换：server 成功→'server'；BFF 失败→'offline-fallback'（不静默回 demo）；有显式 demo 入口时才回 demo（判据：store 状态断言 + UI 三态提示文案；时点：初始化/失败时） | ☐ |
| 4 | 真实模型可试跑 | 目录中 text 模型（Claude Haiku）点试跑 → 调真实 execution /tasks/run（判据：network 面板出现 POST /tasks/run；时点：点击后；例外：上游 503/超时如实展示） | ☐ |
| 5 | 无回归 | 模型卡字段（type/逻辑归属/协议/计费）与 server 数据一致；demo 数据不再作为默认展示（判据：页面字段抽查 vs GET /api/v1/catalog） | ☐ |
| 6 | 门禁 | 前端 `npm run gate` GATE=0；台账 check-task-ledger.sh 0；PR 附勾对 | ☐ |
