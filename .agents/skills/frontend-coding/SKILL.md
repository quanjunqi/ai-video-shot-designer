---
name: frontend-coding
description: 当修改 apps/web/ 下任何前端代码（含新增组件、store、hook、测试）时加载。包含 TypeScript 纪律、组件契约、状态管理、API 层、样式、hooks、可访问性、UI 组件库与前端测试的正向编码规范（与 frontend-quality 门禁互补：本 skill 管「怎么写」，frontend-quality 管「查」）。
---

# 前端编码规范

> 全量规则见 `rules.md`（本目录，唯一权威）。本文件是 AI 执行时的快速参考。

## 什么时候加载这个 skill

- 改 `apps/web/src/` 下任何 `.tsx` / `.ts`
- 新增组件、页面、store、hook、测试
- 定义 API 请求/响应类型

## 核心规则速查

| 族 | 关键 MUST | 检测方式 |
|---|---|---|
| FE-TS | 禁 `any`/`as any`/`@ts-ignore`（unknown+类型守卫）；异步态用判别联合；`import type` | eslint `no-explicit-any`(error) + 审查 |
| FE-COMP | props 先定再写；展示组件零依赖（禁 import store/api/router）；禁 render 内建组件；列表稳定 key | eslint `no-restricted-imports` + 审查 |
| FE-STATE | selector 最小切片（禁整对象解构）；persist 白名单；跨 store 用 getState；写入走 action | eslint + 审查 |
| FE-API | 统一走 `lib/api/client.ts`（禁裸 fetch）；loading/error/empty 三态；竞态 AbortController；乐观更新必回滚；防重复提交 | eslint + 审查 |
| FE-STYLE | grid/flex 子项 `min-w-0`；页面级禁 `max-w-xl/2xl`；禁内联样式（动态值除外） | quality-gate R2/R3/R-UI-001 |
| FE-HOOK | 顶层调用；依赖数组完整；副作用封装自定义 hook | eslint react-hooks |
| FE-A11Y | 图标按钮 title/aria-label；表单标签关联 | quality-gate + L3 |
| UC | 组件三段式（实现+导出+cva）；展示组件零业务依赖；复用优先（禁页面手写弹窗/switch） | eslint + 审查 |
| FE-TEST | 纯函数必有测试；三态与边界覆盖；禁依赖本地时区；禁 `.skip/.only` 残留 | CI + 审查 |

## 禁止事项

- ❌ `data as any` / `: any` / `@ts-ignore` / `@ts-expect-error`
- ❌ `const { a, b } = useStore()` 整对象解构
- ❌ 组件内裸 `fetch(` / 直接 import store、api、router
- ❌ render 内定义组件、列表 key 用 index
- ❌ 页面内手写基础 UI（弹窗/switch 等，用 ui/ 现有组件）
- ❌ catch 后写死误导文案、无回滚乐观更新

## 交付前必须跑

```bash
cd apps/web
npm run gate    # typecheck(tsconfig.app.json) + eslint + quality-gate
```

**GATE=0 才能交付。**

## 完整规则

→ `rules.md`（FE-* 全量 + UC-* + FE-TEST-* + 反模式速查 + 质量门禁）
→ `.agents/skills/frontend-quality`（交付门禁 R-*，反模式黑名单）
