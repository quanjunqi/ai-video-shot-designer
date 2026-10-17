# 需求验收清单：TASK-SETTINGS-P3B workspace 信息真实化

> 对应任务卡：`.github/tasks/TASK-SETTINGS-P3B/task.md`
> 开工日期：2026-10-17 ｜ 开发者（AI）：MainAgent ｜ 目标一句话：设置 > 工作区信息卡三态真实化

---

## 一、需求点 → 可验证判据

| # | 需求点 | 验收判据（可客观验证） | 判据四要素 | 自检结果 |
|---|---|---|---|---|
| 1 | workspace 服务暴露详情端点 | `GET /internal/v1/workspaces/ws_dev` → 200 `{"id":"ws_dev","name":"开发工作区","created_at":"<RFC3339>"}`；无 Authorization → 401 | 判据=响应体字段；对象=handler.go；时点=测试执行；例外=缺 token | ✅ 过 / — |
| 2 | store 查询方法 | `Workspace(ctx,"ws_dev")` 返回 name/created_at；不存在 → ErrNotFound | 判据=单测通过；对象=store.go；例外=表无行 | ✅ 过 / — |
| 3 | BFF 代理 + 矩阵 | `GET /api/v1/workspace` 转发 `/internal/v1/workspaces/{devWorkspace}`；authz.go 有 `{prefix:"/api/v1/workspace", read: roleMember, write: roleAdmin}` | 判据=测试 + 源码断言；对象=authz.go/handlers_workspace.go/server.go | ✅ 过 / — |
| 4 | BFF 纵深守卫 | 非成员 → 403；上游 503 → BFF 503 | 判据=BFF 测试；对象=handlers_workspace_test | ✅ 过 / — |
| 5 | 前端信息卡三态 | API 成功 → 真实名称/创建时间/标识 + 成员数量；失败 → 静态值 + 「workspace 服务不可达时降级」标注；初始 loading 有反馈 | 判据=浏览器走查截图 + 源码断言；对象=SettingsWorkspace.tsx / workspace-info.ts | ✅ 过 / — |
| 6 | 门禁全绿 + 台账 | workspace+web-bff go build/vet/test；前端 gate 0/0、node --test、vitest、ui/visual 绿；台账门禁 RC=0；6/6 勾对 | 判据=命令 RC；时点=PR 前 | ✅ 过 / — |

> 判据四要素：判据（看什么算过）、对象（哪个文件/接口/页面）、时点（什么时候看）、例外（什么情况不算失败）。

---

## 二、设计稿逐点映射（UI 任务必填）

**设计稿信息**：来源=设置中心与模型中心IA v14.html §五 P3 + P2 骨架 v15 §二 ｜ 评审人=Owner ｜ 评审结论=通过（P2 已评审）｜ 评审日期=2026-10-15

| # | 设计稿模块 | 对应需求点 | 实现位置 | 偏差说明 | 自检结果 |
|---|---|---|---|---|---|
| 1 | 工作区信息卡（名称/标识/创建时间/成员数量） | 判据 1-5 | `SettingsWorkspace.tsx` 信息卡 + `features/settings/workspace-info.ts` | 名称/创建时间/标识由 API 提供；失败降级静态值+标注 | ✅ 过 / — |
| 2 | 成员数量 | 判据 5 | `SettingsWorkspace.tsx` | 与信息端点 name 口径一致（P3A 已真实化） | ✅ 过 / — |

---

## 三、三态与边界（数据请求 UI 必过）

| # | 场景 | 预期 | 自检结果 |
|---|---|---|---|
| 1 | loading 态 | 信息卡字段显示加载占位（如「加载中…」） | ✅ 过 / — |
| 2 | api 成功 | 显示真实名称/创建时间/标识；成员数量来自成员端点 | ✅ 过 / — |
| 3 | api 失败 | 降级静态值 + 「workspace 服务不可达时降级」标注，不白屏 | ✅ 过 / — |
| 4 | 非成员访问 | BFF 403；页面按 P2 设计保持隐藏 | ✅ 过 / — |

---

## 四、反模式自查（命中即改）

- FE-*：无僵尸按钮（本卡无新增按钮）；三态齐全；禁内联样式（动态值除外）。
- BE-*：错误码契约复用（UNAUTHENTICATED/403/503 沿用）；无硬编码错误码；handler ≤500 行。
- 未建日志不得开工（AC-010）——本卡 devlog 已建。
