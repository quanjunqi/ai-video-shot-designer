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

### 2026-10-16 00:25 开工核实 —— **发现致命前提缺失（阻塞）**

- **动作**：按 §5 第 8 条先核实运行环境，而不是直接写脚本。
- **发现/证据**：
  - ✅ Chrome 存在：`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
  - ✅ 前端可达：`:5174` → HTTP 200
  - ✅ 身份契约明确：localStorage 键 **`mdp-dev-actor`** ∈ {`user_dev`=owner, `user_admin`=admin, `user_viewer`=viewer}（`useAuthStore.ts:24-28,82,108`）
  - ✅ 五个服务**都在监听**：8080 web-bff / 18081 production / 18082 workspace / 8085 execution / 18084 asset
  - ❌ **运行中的 BFF 是旧二进制**：`GET /api/v1/me` 实测 **404**，而该路由**在源码里已注册**
    （`services/web-bff/internal/httpserver/server.go:94`）⇒ 进程启动于 AUTH-001 合并之前
- **后果（严重）**：走查若现在执行，**验的是旧代码**——三角色身份 `/api/v1/me` 拿不到，
  `useAuthStore.hydrate()` 会失败，判据 2/3 必然假失败或假通过。
  这正是本卡要防的「假防线」，却先发生在运行环境本身。
- **决策**：B-001 记为阻塞；**在栈按当前 develop 重建前，不写走查脚本**（写了也无法验证 ⇒ 违反"未验证≠通过"）。

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
| V-002 | 运行环境核实（Chrome / 前端 / 身份契约 / 服务端口） | 逐一 `curl` + 读 `useAuthStore.ts` + `ls` Chrome | PASS（4/5 项） | 本日志 00:25 条目 |
| V-003 | **栈新鲜度** | `curl :8080/api/v1/me` vs `server.go:94` 注册 | **FAIL**（404 ⇒ 旧二进制）→ B-001 | 本日志 00:25 条目 |
| — | （验收判据 1~10 待 B-001 解除后逐条追加） | | | |

## 阻塞与解法 B

| 编号 | 阻塞 | 根因 | 解法 | 复用教训 |
|---|---|---|---|---|
| B-001 | **运行中的 BFF 是旧二进制**（`/api/v1/me` 404，源码已注册） | 进程启动于 AUTH-001 合并之前，本地栈未随 develop 重建 | ① 用 `deploy/local` 重建栈（BFF 至少）；② **本卡必须内置"栈新鲜度"前置断言**——否则走查可能验的是旧代码（见下「设计补充」） | 走查类工具的**第一断言应该是"被测对象是当前代码"**，而不是直接断言业务行为；否则环境陈旧会被误读为功能缺陷（或更糟：假通过） |

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

## 设计补充（B-001 的直接产物）

**本卡必须新增一条前置断言：栈新鲜度。** 否则走查可能验的是旧代码。

建议实现（择一，写进脚本第一步）：
1. **探针端点**：断言 `/api/v1/me` 可达（它就是本卡所需能力的一部分——不可达即说明栈旧）；
2. **版本端点**：若 BFF 暴露构建版本/commit（当前未见），则与 `git rev-parse HEAD` 比对；
3. 二者都不可用时 → **退出 2（未验证）**，而不是继续跑出一堆假失败。

⇒ 该断言已加入验收判据（见 [acceptance.md](acceptance.md) 判据 11）。

## 2026-10-17（B-001 解除后完成开发）

### A（动作）
- A-010 开发 `.github/scripts/t13-walkthrough.mjs`：系统 Chrome + CDP（Node 22 原生 WebSocket，零新依赖）
- A-011 三角色身份注入：`localStorage['mdp-dev-actor']` + reload（`devActorInitial()` 同一契约）
- A-012 断言实现：三角色导航（`visibleModelCenterNav` 契约）/ 五站链路 / /tasks 详情抽屉（`button[title="查看详情"]`）/ 产物区块
- A-013 **实测发现 AUTH-002**：注入身份后导航不按角色过滤 → 根因 fetchMe 无身份头、BFF 回退 devActor 恒 owner → 立卡修复

### E（证据）
- 正例：`node .github/scripts/t13-walkthrough.mjs` → EXIT=0 · 10/10 断言过（2026-10-17）
- 反例（停 Vite 5173 后）：EXIT=2 · reason=stack_unavailable
- 截图：`$TMPDIR/t13-walkthrough/<role|owner>/*.png`（三角色导航 / costs / health / create / tasks / tasks-detail）
- 台账：check-task-ledger.sh ✅ 通过

### D（决策）
- D-003 身份等待信号用「reload 完成 + 2s 缓冲」而非 innerText 匹配 actorId（TopBar 显示 role 不是 actorId）
- D-004 /create/image 断言文案用真实页头「图片创作」；详情按钮用 `button[title="查看详情"]`（Eye 图标无文字）
- D-005 走查发现的 AUTH-002 缺陷按纪律建新卡修，不在本卡顺手改业务代码
