---
name: frontend-quality
description: 当修改 apps/web/ 下任何前端代码时加载。包含 Awwwards 级品质标准、三层交付门禁、R-* 规则库和反例库。
---

# 前端交付质量门禁

> 完整规则见 `rules.md`（本目录，唯一权威）。
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

## 布局回归（W2 新增）

改**关键页面**（模型中心/成本/审计/设置渠道/设置模型等 6 页）布局后，跑截图基线 diff：

```bash
cd apps/web
npm run visual:check      # 与 visual-baseline/ 基线比对，差异率 >2% 判回归
npm run visual:baseline   # 有意变更布局时刷新基线（随 PR 提交）
```

- 基线同环境可比：CI 与本地均为无 BFF 的 error 态布局
- 视觉静态规则（V-001~V-003b）已并入 quality-gate：间距 4px 节奏 / 禁止硬编码色值 / 标题字号用尺度 token /
  **小字号任意值 text-[Npx] 阻断新增**（V-003b，存量走 `apps/web/ui-text-debt-baseline.json` 棘轮，只减不增）

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
| V-001 | 间距用 4px 节奏 token（非 4 倍数任意值间距） | quality-gate |
| V-002 | 禁止硬编码色值（#hex/rgb/hsl，用语义色 token） | quality-gate |
| V-003 | 标题（h1-h3）字号用尺度 token，禁 text-[Npx] | quality-gate |
| V-003b | **小字号用尺度 token**：`text-4xs`(9px)/`text-3xs`(10px)/`text-2xs`(11px)/`text-xs`(12px)/`text-md`(13px)，禁 `text-[Npx]`（**阻断**新增；存量见 `ui-text-debt-baseline.json`，只减不增；`components/ui/**` 为上游组件，豁免） | quality-gate |

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

→ `rules.md`（R-* 全量规则 + 六步硬门禁 + 清单 1-7）
→ `lessons.md`（历史教训台账）
