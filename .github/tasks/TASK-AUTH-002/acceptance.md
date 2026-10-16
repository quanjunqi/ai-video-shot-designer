# TASK-AUTH-002 验收清单

> 逐项可验证判据（判据/对象/时点/例外 四要素）。规则：AC-001~011。

## 任务信息

- 任务名称：修复前端 dev 身份切换链路（hydrate 回读角色）
- 关联需求/任务卡：[task.md](task.md)
- 开发者（AI）：AI
- 目标一句话：dev 切换身份后前端 role 真实回读，三角色导航矩阵生效。

## 一、需求点 → 可验证判据

| # | 需求点 | 验收判据（可客观验证） | 四要素备注 | 自检结果 |
|---|---|---|---|---|
| 1 | fetchMe 带身份头 | dev 时 `fetchMe()` 的请求头含 `X-Actor-Id`（来源 `mdp-dev-actor`）；PROD 分支不带 | 判据：请求头；对象：useAuthStore.ts；时点：开发后；例外：PROD 行为不变 | ✅ 已通过 |
| 2 | 前端门禁 | `cd apps/web && npm run gate` → GATE=0（typecheck + eslint + quality-gate 0 错） | 判据：exit 0；对象：gate；时点：开发后 | ✅ 已通过 |
| 3 | 三角色导航矩阵生效 | 走查脚本三角色断言通过：admin 不见「审计日志」；viewer 不见「审计日志」「渠道与凭据」；owner 全见 7 项 | 判据：3 组断言全过；对象：模型中心导航；时点：走查脚本；例外：无 | ✅ 已通过 |
| 4 | 无回归 | owner 下五站链路 + /tasks 详情抽屉仍可走（走查脚本其余断言） | 判据：脚本相关断言通过；对象：走查脚本；时点：开发后 | ✅ 已通过 |

## 二、设计稿逐点映射

**N/A —— 非 UI 任务**（请求头数据流修复，见 task.md AC-009 判定）。

## 三、边界

| # | 场景 | 预期 | 自检结果 |
|---|---|---|---|
| 1 | PROD 构建（import.meta.env.PROD） | fetchMe 不带 X-Actor-Id（真实身份路径不变） | ✅ 已通过 |
| 2 | localStorage 无 mdp-dev-actor | 不带头 → BFF 回退 devActor（user_dev/owner），行为同现状 | ✅ 已通过 |
| 3 | 非法 actorId | BFF 对未知 actor 返回 403/错误 → hydrate error → fail-safe 最低档（member） | ✅ 已通过 |

## 四、反模式自查

| # | 反模式检查 | 命中？ | 处理 |
|---|---|---|---|
| 1 | 顺手改 BFF/授权逻辑（越界） | ✅ 已通过 | 非范围明令 |
| 2 | 改导航契约（越界） | ✅ 已通过 | 契约已验证正确 |

## 五、门禁与测试

| # | 检查 | 命令 | 结果 |
|---|---|---|---|
| 1 | 前端 gate | `cd apps/web && npm run gate` | ✅ GATE=0（2026-10-17） |
| 2 | 端到端三角色断言 | `node .github/scripts/t13-walkthrough.mjs` | ✅ 三角色导航断言全过（2026-10-17） |
| 3 | 台账一致性 | `bash .github/scripts/check-task-ledger.sh` | ✅ 通过（2026-10-17） |

---
