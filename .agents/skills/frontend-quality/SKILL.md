---
name: frontend-quality
description: 当修改 apps/web/ 下任何前端代码时加载。包含 Awwwards 级品质标准、三层交付门禁、R-* 规则库和反例库。
---

# 前端交付质量门禁

> 完整规则见 `docs/product/frontend-design-rules.md`（唯一权威）。
> 本文件是 AI 执行时的快速参考。

## 什么时候加载这个 skill

- 改了 `apps/web/src/` 下任何 `.tsx` / `.ts` / `.css`
- 新增组件、页面、store、hook
- 改了 UI 布局、样式、交互

## 交付前必须跑

```bash
cd apps/web
npm run gate    # typecheck + eslint + quality-gate.mjs
```

**GATE=0（0 error、0 warning）才能交付。**

## 品质标准

Awwwards / Webby Awards / FWA 获奖级网站。交付前从 8 维度自检：
排版、留白、视觉层级、色彩、动效、微交互、响应式、原创性。

## 核心规则速查

| 编号 | 规则 | 检测方式 |
|---|---|---|
| R-UI-001 | 禁止内联样式（动态值除外） | eslint |
| R-UI-002 | 组件命名 PascalCase，文件同名 | 人工 |
| R-DATA-001 | Zustand store 避免 prop drilling | 人工 |
| R-CRUD-001 | CRUD 操作必须有 loading / error / empty 三态 | 人工 |
| R-CRUD-002 | 删除操作必须有确认弹窗 | 人工 |
| R-HOOK-001 | useEffect 依赖数组必须完整 | eslint |
| R-HOOK-002 | 禁止在 render 中创建函数式组件 | 人工 |

## 反例库（常见错误）

- **R2**：`SelectTrigger` 不要显式写 `w-fit`；grid 列容器不要漏 `min-w-0`
- **R3**：页面级容器不要用 `max-w-xl` / `max-w-2xl`；用 `max-w-3xl` 或更宽
- **R9**：`||`/`&&` 和 `??` 不要在同一子句混用（括号隔离除外）
- 纯图标按钮必须有 `title` 或 `aria-label`

## 三层防线

1. **L1 设计时**：先对照反例库设计组件，不从零引入旧模式
2. **L2 静态门禁**：`npm run gate` 必须 0 error
3. **L3 浏览器验证**：只验静态检测不到的（布局渲染、真实请求、交互反馈）

## 完整规则

→ `docs/product/frontend-design-rules.md`（R-* 全量规则 + 六步硬门禁 + 清单 1-7）
→ `.agents/skills/frontend-quality/lessons.md`（历史教训台账）
