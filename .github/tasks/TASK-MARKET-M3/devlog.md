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
