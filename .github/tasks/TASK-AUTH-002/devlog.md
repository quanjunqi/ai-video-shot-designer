# TASK-AUTH-002 开发日志

> 模板：`.agents/skills/acceptance-checklist/templates/devlog.md`。四类条目：动作 / 证据 / 决策 / 阻塞。

## 2026-10-17

### A（动作）
- A-001 立卡：INFRA-006 走查自动化开发中，CDP 实测注入 `mdp-dev-actor=user_admin` 并重载后导航仍全量显示，
  深挖确认前端 dev 身份切换链路失效（fetchMe 无身份头 → BFF 回退 devActor 恒 owner）。
- A-002 证据固化：curl 三身份 /api/v1/me 返回正确 role（BFF 侧正常）；前端 fetchMe 裸 fetch（useAuthStore.ts）。

### E（证据）
- `curl http://localhost:5173/api/v1/me` → owner；`curl -H "X-Actor-Id: user_admin"` → admin（BFF 矩阵正确）
- `apps/web/src/stores/useAuthStore.ts` fetchMe()：`fetch('/api/v1/me', { headers: { Accept: 'application/json' }, cache: 'no-store' })` —— 无身份头
- `services/web-bff/internal/httpserver/guards.go` authorize()：缺省头回退 `s.devActor`

### D（决策）
- D-001 修复点选在 fetchMe（前端），不动 BFF/workspace：BFF 侧矩阵已被 curl 实证正确，缺的只是前端把 dev 身份传过去。
- D-002 身份来源用 `localStorage['mdp-dev-actor']`（与 `devActorInitial()` 同一契约），避免依赖 store 闭包时序。

## 开发与验证（2026-10-17）
- A-010 修复 `fetchMe()`：dev 时读 `localStorage['mdp-dev-actor']` 作为 `X-Actor-Id` 头（PROD 不带，行为不变）
- E-010 `npm run gate` → GATE=0（typecheck + eslint + quality-gate 0 错）
- E-011 走查脚本三角色导航断言端到端通过：owner 7 项 / admin 6 项（无审计）/ viewer 5 项（无审计+渠道）
- E-012 回归：owner 五站链路 + /tasks 抽屉 + 产物区块全过（走查脚本 10/10）
