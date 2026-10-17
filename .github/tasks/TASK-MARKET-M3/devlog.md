# TASK-MARKET-M3 开发日志

> 开发过程的事实源：**动作 / 证据 / 决策 / 阻塞** 四类条目，随开发同步记录。
> 规则：AC-010。**开工即建，随开发追加，PR 前完成；禁止交付前一次性补写。**

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [task.md](task.md) |
| 验收清单 | [acceptance.md](acceptance.md) |
| 分支 | feature/market-server-catalog-2026-10-17 |
| PR | #<n> |
| 开工 | 2026-10-17 23:30 |
| 开发者 | AI Agent |

## 执行轨迹

### 2026-10-17 23:30 开工/探查
- **动作**：立卡前探查前端数据源现状。
- **发现/证据**：
  - BFF `GET /api/v1/catalog` 实测返回真实目录 7 模型（DeepSeek/Claude Haiku2/Boogu/GPT-Image/Stub/Seedance + 被污染的 m_pearapi_claude_haiku 残留）。
  - useSettingsStore 已有 server 分支：syncCatalog → api.getCatalog() → serverModelToLocal + catalogSource='server'；失败 → 'offline-fallback'；初始化 demo。
  - UI 走查目录页显示 demo 内置清单（MiniMax/gemini）→ catalogSource 停在 demo，server 切换未生效。
- **决策**：D-001 范围收敛为「定位 UI 未切 server 态 + 修复展示」，不改后端契约。

## 决策记录 D

| 编号 | 主题 | 选项 | 选择 | 理由 | 时机 |
|---|---|---|---|---|---|
| D-001 | 范围 | 重做 vs 修复 | 修复 | 后端已真实、前端骨架已存在，仅需定位切换失效点 | 开工 |

### 2026-10-17 23:50 开发（V2）
- **动作**：修复 useSettingsStore 在 server 态混入内置 demo 逻辑模型的问题。
- **证据**：
  - 根因：syncCatalog/hydrateCatalog 的 localExtra = 所有非 server 目录 id 的本地模型 ⇒ defaultModels()（MODEL_CATALOG 15 个内置 demo）在 server 态全部混入 ⇒ 目录页 22 行（7 server + 15 demo）。
  - 修复：新增 `BUILTIN_MODEL_IDS = new Set(MODEL_CATALOG.map(id))`，两处 localExtra 过滤 `!BUILTIN_MODEL_IDS.has(m.id)`（只保留用户克隆副本/自定义渠道模型，id 非内置）。
  - 数据清理：`PUT /catalog/models/m_pearapi_claude_haiku {status:disabled}` 停用 curate family 冲突造成的污染行（Boogu 数据残留，id=claude_haiku）；停用保留行符合「防破坏历史引用」语义。
- **验证**（浏览器 reload 实测）：
  - /models/catalog：7 个 server 真实模型（GPT-Image2/DeepSeek/Boogu/Claude Haiku/Stub/Seedance2.5），demo 内置全部消失。
  - /models/market：同源 7 模型 + 「已连接模型中心，展示真实调用模型」server 态提示。
  - 详情抽屉：Claude Haiku 含「发起试跑」入口（M2 能力在 server 态可用）。
  - 之前走查看到 demo 数据 + 旧 combobox（「验收冒烟」vs 代码「文本 text」）确认为 Vite 缓存/旧构建，reload 后消失。
  - `npm run gate`：GATE=0（typecheck+eslint+quality-gate 0/0）。
- **决策**：D-002 server 态只保留 server 目录 + 用户自定义（克隆/渠道模型），内置 demo 逻辑模型不再混入展示（能力归属服务端化为独立后续任务）。

## 决策记录 D

| 编号 | 主题 | 选项 | 选择 | 理由 | 时机 |
|---|---|---|---|---|---|
| D-001 | 范围 | 重做 vs 修复 | 修复 | 后端已真实、前端骨架已存在，仅需定位切换失效点 | 开工 |
| D-002 | server 态模型集合 | demo 混入 vs 纯净 | 纯净 | 目录=真实调用模型+能力归属，demo 逻辑模型不应出现在真实数据流 | 开发 |
