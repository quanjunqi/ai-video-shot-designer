# TASK-INFRA-006 开发日志

> 开发过程的事实源：**动作 / 证据 / 决策 / 阻塞** 四类条目，随开发同步记录。
> 规则：AC-010。**开工即建，随开发追加；禁止交付前一次性补写。**
> 机器可读配套：[devlog.events.json](devlog.events.json)（AC-011）。
>
> ⚠️ **本卡状态：待开工**。本日志目前仅含「立卡/前提核实」条目——那部分工作已实际发生。

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [task.md](task.md) |
| 验收清单 | [acceptance.md](acceptance.md) |
| 分支 | 待定（开工时从 `origin/develop` 拉 `chore/t13-walkthrough-<日期>`） |
| PR | #<待开> |
| 立卡 | 2026-10-15 23:38（本地） |
| 开工 | 待定 |
| 开发者 | 待指派 |

## 执行轨迹（正序；每个动作一条）

### 2026-10-15 23:38 立卡/前提核实（开工前，本条已实际发生）

- **动作**：在提出「T13 走查自动化」建议前，先**实测前提**（避免又一次"凭未核实前提写卡"）。
- **发现/证据**：
  - 仓库**已有** headless Chrome 驱动先例：`apps/web/scripts/visual-regression.mjs` 头注写明
    「依赖：系统 Chrome（headless）、pixelmatch + pngjs（devDeps）」，用 `node:child_process` 的 `spawn` 调起。
  - **无 playwright/puppeteer**（`apps/web/node_modules` 实测）⇒ 沿用现有做法，不新增依赖。
  - 本地栈可跑：web `:5174` 实测 **HTTP 200**；`docker info` 可用。
  - 三角色身份来自 `localStorage`：AUTH-001 devlog A-021/A-022（`useAuthStore.ts` 的 `DEV_ACTORS` +
    TopBar dev 下拉，仅 `import.meta.env.DEV` 渲染）。
  - 人读版走查脚本已存在：`docs/how-to/t13-walkthrough-guide.md`（§2 为勾选表）。
  - **技术缺口**：headless Chrome 命令行只能"加载一个 URL 截一张图"，**无法注入 `localStorage`
    做三角色切换**，需 CDP 或预置 profile。
- **决策**：D-001（用 CDP + 系统 Chrome，不引新依赖）、D-002（身份优先走 `localStorage` 注入而非点下拉）。

## 决策记录 D

| 编号 | 主题 | 选项 | 选择 | 理由 | 时机 |
|---|---|---|---|---|---|
| D-001 | 浏览器驱动方式 | A 引入 playwright/puppeteer / B 系统 Chrome + CDP / C 纯 `--screenshot` | **B** | A 增加依赖与供应链面积（仓库刚因 MinIO 分发关闭踩过环境坑）；C **做不到三角色切换**（核心需求）。B 复用 `visual-regression.mjs` 已验证的做法 | 立卡 |
| D-002 | 身份注入方式 | A 点 TopBar dev 下拉 / B 直接注入 `localStorage` 后重载 | **B** | B 更稳（不依赖下拉 DOM 结构）；且避免"测的是下拉本身"的循环。仅当**下拉交互本身**是被测对象时才用 A | 立卡 |
| D-003 | 是否接入 CI | A 本卡一并接 / B 先做本地一键复跑 | **B** | 走查需真实栈 + Chrome，CI 未必具备；先证明脚本可用，接入另议（避免又一条"看起来接入了"的假防线） | 立卡 |

## 验证记录 V

| 编号 | 对应验收判据 | 命令/方式 | 结果 | 证据位置 |
|---|---|---|---|---|
| V-001 | 前置事实核实（非验收判据，供开工用） | 读 `visual-regression.mjs` 头注 / 查 node_modules / `curl :5174` / `docker info` | PASS | 本日志 23:38 条目 |
| — | （验收判据 1~10 待开工后逐条追加） | | | |

## 阻塞与解法 B

| 编号 | 阻塞 | 根因 | 解法 | 复用教训 |
|---|---|---|---|---|
| — | （暂无） | | | |

## 纪律自检（对照 `.agents` 规则，逐项留证据）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 立卡前核实前提（排期 v2 §5 第 8 条） | ✓ | V-001；task.md「背景」表逐条带证据 |
| 开工前产出验收清单（AC-008） | ✓ | [acceptance.md](acceptance.md)（10 条判据，未开工故未勾对） |
| 任务卡带 front-matter（AC-011） | ✓ | `status/priority/depends_on/criteria` |
| 尚未开工（未建代码、未写码） | ✓ | 本卡仅有四件套文档 |

## 复盘（收尾时写，1–3 句每项）

- **做得好的**：
- **可改进的**：
- **遗留/后续**：

> 本卡尚未开工，复盘待开发阶段收尾时填写。
