---
taskId: TASK-AUTH-002
status: 待验收
priority: P0（T13 走查判据 2 的阻塞项——INFRA-006 走查自动化实测发现）
pr: "#<待开>"
criteria: 4
criteriaPassed: 0
depends_on: 无
---

# TASK-AUTH-002：修复前端 dev 身份切换链路（hydrate 回读角色）

> 立卡动机：INFRA-006 走查自动化开发时，CDP 实测注入 `localStorage['mdp-dev-actor']=user_admin` 并重载后，
> **前端导航仍全量显示**（admin 仍见「审计日志」）。代码审查确认根因（见下），
> 这是 AUTH-001 判据 6（三角色 × 导航矩阵）**一直无法验收**的隐藏原因。

## 根因（已实证，非猜测）

- 前端 `fetchMe()`（`apps/web/src/stores/useAuthStore.ts`）**裸 fetch `/api/v1/me`，不带 `X-Actor-Id` 头**；
- BFF `authorize()`（`services/web-bff/internal/httpserver/guards.go`）对缺省头**回退 `s.devActor`（user_dev/owner）**；
- 于是无论 dev 身份怎么切，`hydrate()` 拉回的 role 恒为 `owner` ⇒
  `visibleModelCenterNav(role)` 永远全量显示 ⇒ 判据 2 的三角色断言不可能通过。
- 证据：
  - `curl http://localhost:5173/api/v1/me` → `{"actor_id":"user_dev","role":"owner",…}`（无头）
  - `curl -H "X-Actor-Id: user_admin" …/api/v1/me` → `{"actor_id":"user_admin","role":"admin",…}`
  - CDP 注入 + 重载后 `document.body.innerText` 仍含「审计日志」（admin 不应见）
  - AUTH-001 台账：判据 6 ⏳ 待 Owner 真机走查（未验收）——与此 bug 吻合

## 修复方向（最小改动）

`fetchMe()` 读当前 dev 身份作为 `X-Actor-Id` 头：
- 来源 = `localStorage['mdp-dev-actor']`（`devActorInitial()` 同一契约）——避免依赖 store 闭包时序
- 非 dev 环境（`import.meta.env.PROD`）：不带该头，走真实身份（当前实现不变）
- 修复后：AppShell 启动 `setState(actorId=devActorInitial())` → `hydrate()` → fetchMe 带头
  → BFF 返回对应 role → 导航按 `visibleModelCenterNav(role)` 过滤

## 范围

### 范围内
- 改 `apps/web/src/stores/useAuthStore.ts` 的 `fetchMe()`（dev 时带 X-Actor-Id）
- 前端单测/类型检查：`cd apps/web && npm run gate`
- 用 INFRA-006 走查脚本做端到端验证（三角色导航断言）

### 非范围
- ❌ 不改 BFF / workspace 授权逻辑（BFF 侧矩阵已验证正确：curl 三身份返回正确 role）
- ❌ 不改导航契约 `visibleModelCenterNav`（契约正确，只是 role 恒 owner 导致不生效）
- ❌ 不动 INFRA-006 脚本本身（脚本按契约断言，如实报失败是它的职责）

## 验收标准

1. `fetchMe()` dev 时带 `X-Actor-Id`（来源 `mdp-dev-actor`），PROD 行为不变
2. `npm run gate` 全绿（typecheck + eslint + quality-gate）
3. 走查脚本三角色导航断言通过：admin 不见「审计日志」；viewer 不见「审计日志」「渠道与凭据」；owner 全见
4. 回归：owner 下五站链路仍可走、/tasks 详情抽屉可开（无新回归）

## 任务类型判定（AC-009）

**判定：非 AC-009 设计稿先行任务。** 依据：一行请求头修复（数据流修复），不新建页面/不大改布局/不变更视觉系统。

## 测试命令

```bash
cd apps/web && npm run gate
node .github/scripts/t13-walkthrough.mjs   # 三角色导航断言应全过（其余断言另行评估）
```
