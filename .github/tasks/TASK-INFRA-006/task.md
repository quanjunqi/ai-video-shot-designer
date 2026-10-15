---
taskId: TASK-INFRA-006
status: 进行中
priority: P0（T13 收官的使能项——4 条判据现在只能靠 Owner 手点）
pr: "#<待开>"
criteria: 8
criteriaPassed: 0
depends_on: TASK-PROC-003（已合并）**+ ⚠️ 本地栈须按当前 develop 重建（B-001）**
---

# TASK-INFRA-006：T13 走查自动化（headless Chrome + 三角色切换 + 五站截图）

> 立卡动机：T13 走查（AUTH-001 判据 6 + INFRA-005 判据 1/4/5）**只能靠 Owner 手点浏览器**，
> 已积压数个会话；且每次都要人重做一遍。本卡把它变成**可一键复跑的脚本**。
> 排期依据：`docs/product/task-queue-plan-v2-2026-10-15.md` §3.1 第 0 波 W3 / §4.2 走查批处理。

## 目标

一句话：**让「一场走查闭合 4 条判据」从人工手点变成一条命令 + 一组截图。**

## 背景（已探明的事实，不是猜测）

本卡开工前已实测以下前提（**避免又一次"凭未核实前提写卡"**）：

| 事实 | 证据 |
|---|---|
| 仓库**已有** headless Chrome 的驱动先例 | `apps/web/scripts/visual-regression.mjs` 头注：`依赖：系统 Chrome（headless）、pixelmatch + pngjs（devDeps）`；用 `node:child_process` 的 `spawn` 调起 Chrome |
| 无 playwright/puppeteer | `apps/web/node_modules` 无相关包 ⇒ 沿用仓库现有做法（系统 Chrome），**不新增依赖**（符合 §5 依赖纪律） |
| 本地栈可跑 | web `:5174` 实测 HTTP **200**；`docker info` 可用 |
| 三角色身份来自 `localStorage` | AUTH-001 devlog A-021/A-022：`stores/useAuthStore.ts` 的 `DEV_ACTORS` 三角色 + `hydrate()` 拉 `/api/v1/me`；dev 身份切换在 TopBar（`import.meta.env.DEV`） |
| 走查脚本已存在（人读版） | `docs/how-to/t13-walkthrough-guide.md`（§2 为验收结论勾选表） |

**关键技术缺口**：headless Chrome 命令行 `--screenshot` 只能"加载一个 URL 截一张图"，
**无法注入 `localStorage` 做三角色切换**，也无法点击 TopBar 下拉 ⇒ 需 CDP（Chrome DevTools Protocol）
或预置 `--user-data-dir` 的 profile。

## 范围

### 范围内

- ✅ 新增 `.github/scripts/t13-walkthrough.mjs`（或 `scripts/`，按"CI 与本地共用"归位）：
  - 用系统 Chrome + CDP 驱动（`--remote-debugging-port` + WebSocket），**不引入新依赖**
  - **三角色切换**：按 AUTH-001 的 `DEV_ACTORS` 契约注入 `localStorage` 身份后重载，逐角色执行
  - **五站链路**（INFRA-005 判据 1）：`/models/costs` → 配预算 → `/models/health` → `/create/image` → `/tasks`
  - **三角色 × 模型中心全导航**（AUTH-001 判据 6）：逐角色断言导航可见项与设计稿矩阵一致
  - **产物展示**（INFRA-005 判据 4）：`/tasks` 展开详情，断言产物区块存在
  - **权限矩阵生效**（判据 5）：viewer/admin 下审计、渠道入口不可见
  - 每站/每角色**落盘截图**（证据留痕）+ 断言结果输出为 JSON（供台账回填）
- ✅ 退出码语义与仓库一致：`0` 通过 / `1` 断言失败 / `2` **无法执行**（栈未起、无 Chrome）——**2 不等于通过**
- ✅ 栈前置自检：`:5174` 不可达时**明确报「未验证」并退出 2**，不静默跳过
- ✅ 把 `docs/how-to/t13-walkthrough-guide.md` §2 的勾选表改为**由脚本输出回填**
- ✅ 产出 4 条判据的闭合结论 → 回填 `TASK-AUTH-001/acceptance.md` 判据 6 与
  `TASK-INFRA-005-acceptance.md` 判据 1/4/5

### 非范围

- ❌ 不接入 CI（走查需真实栈 + Chrome，CI 未必具备；先做本地一键复跑，接入另议）
- ❌ 不替代前端单测/视觉回归（`npm run visual:check` 是像素基线，本卡是**行为断言**）
- ❌ 不改任何业务代码——**若走查发现缺陷，建新卡修**，不在本卡顺手改（保证据纯净）
- ❌ 不引入 playwright/puppeteer 等新依赖

## 关键约束

1. **不得把「未验证」当「通过」**：栈不可达/无 Chrome → 退出 2，绝不 exit 0
2. **断言必须来自真实渲染**（DOM/网络），不得只截图不判定（截图是证据，不是判据）
3. 三角色身份注入必须走 `DEV_ACTORS` 的**既有契约**，不得自造身份格式
4. 截图产物写入仓库外（如 `$TMPDIR`）或 gitignore 目录，**不得污染工作区**
5. 测试不得依赖本地时区（CI/他机跑 UTC 也要成立）

## 验收标准

1. `node .github/scripts/t13-walkthrough.mjs` 在本地栈已起时**一条命令跑完全部走查**，退出码 0/1/2 语义正确
2. **三角色各自断言**导航可见项与 `MODEL_CENTER_NAV` + `visibleModelCenterNav()` 一致（viewer 不见审计/渠道；admin 不见审计）
3. **五站链路**逐站断言可渲染且关键元素存在；`/tasks` 断言 **不再崩溃**（FIX-004 回归）且详情抽屉可开
4. **产物展示**：succeeded 任务详情内产物区块存在（INFRA-005 判据 4）
5. 每站/每角色截图落盘，路径在输出里列出
6. 栈未起时 → 退出 **2** 且打印「未验证」；无 Chrome 同理
7. `docs/how-to/t13-walkthrough-guide.md` §2 勾选表可由脚本输出回填
8. 走查结论回填 AUTH-001 判据 6 与 INFRA-005 判据 1/4/5 的验收文件

## 任务类型判定（AC-009）

**判定：非 AC-009 设计稿先行任务。** 依据：交付物是测试脚本与证据，**不新建页面/不大改布局/不变更视觉系统**；
它**断言**既有界面，不设计界面。判定写成纪律条目供 Owner 复核。

## 测试命令

```bash
# 前置：本地栈已起（web :5174 可达）
node .github/scripts/t13-walkthrough.mjs; echo "rc=$?"     # 期望 0/1；栈未起则 2
```

## 风险

- **CDP 驱动脆弱性**：TopBar 下拉的 DOM 结构变化会让脚本失效 ⇒ 优先用 `localStorage` 注入（稳定），
  仅在下拉交互本身是被测对象时才点它
- **栈的依赖**：需 docker + 一次性 Postgres/MinIO，首次跑通可能踩环境问题 ⇒ 单独留「栈前置自检」步骤定位
