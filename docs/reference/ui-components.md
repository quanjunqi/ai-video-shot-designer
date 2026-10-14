# UI 组件与设计 token 参考

> 由 scripts/ui-inventory.mjs 生成 —— 禁止手改；改代码或注记后跑 `npm run ui:generate`。

本文件是**生成物**，供人类查阅；agent 的精简版在 `.agents/skills/frontend-coding/ui-components.md`。
改组件 → `cd apps/web && npm run ui:generate`；CI 用 `npm run ui:check` 防漂移。

## 1. 现状统计

| 项 | 数值 |
|---|---|
| 组件文件 | 55 个 / 6739 行 |
| 死组件（零引用） | 35 个 |
| 设计 token | 62 个（Tailwind 映射 54 条） |
| 语义注记覆盖 | 55/55 |
| 展示页 demo 覆盖 | 55/55 |

## 2. 设计 token（自动从 `src/tailwind-theme.css` 抽取）

> 规则：**禁止硬编码色值**（V-002）；用下列语义 token 或其 Tailwind 工具类。

### 色彩 / 表面（49）

| token | 浅色 | 深色 | Tailwind 工具类 |
|---|---|---|---|
| `--button-outline` | `rgba(0,0,0, .10)` | `rgba(255,255,255, .14)` | — |
| `--badge-outline` | `rgba(0,0,0, .05)` | `rgba(255,255,255, .08)` | — |
| `--opaque-button-border-intensity` | `-8` | — | — |
| `--elevate-1` | `rgba(0,0,0, .03)` | `rgba(255,255,255, .045)` | — |
| `--elevate-2` | `rgba(0,0,0, .08)` | `rgba(255,255,255, .09)` | — |
| `--background` | `hsl(40 33% 97%)` | `hsl(222 18% 7%)` | `--color-background` |
| `--foreground` | `hsl(24 12% 12%)` | `hsl(220 12% 90%)` | `--color-foreground` |
| `--card` | `hsl(0 0% 100%)` | `hsl(222 15% 10%)` | `--color-card` |
| `--card-foreground` | `hsl(24 12% 12%)` | `hsl(220 12% 90%)` | `--color-card-foreground` |
| `--card-border` | `hsl(40 12% 87%)` | `hsl(222 10% 18%)` | `--color-card-border` |
| `--popover` | `hsl(0 0% 100%)` | `hsl(222 15% 10%)` | `--color-popover` |
| `--popover-foreground` | `hsl(24 12% 12%)` | `hsl(220 12% 90%)` | `--color-popover-foreground` |
| `--primary` | `hsl(28 88% 50%)` | `hsl(32 95% 56%)` | `--color-primary` |
| `--primary-foreground` | `hsl(40 40% 98%)` | `hsl(222 18% 8%)` | `--color-primary-foreground` |
| `--secondary` | `hsl(40 18% 93%)` | `hsl(222 12% 16%)` | `--color-secondary` |
| `--secondary-foreground` | `hsl(24 12% 16%)` | `hsl(220 12% 92%)` | `--color-secondary-foreground` |
| `--muted` | `hsl(40 16% 94%)` | `hsl(222 12% 15%)` | `--color-muted` |
| `--muted-foreground` | `hsl(26 8% 45%)` | `hsl(220 8% 60%)` | `--color-muted-foreground` |
| `--accent` | `hsl(38 85% 91%)` | `hsl(222 12% 17%)` | `--color-accent` |
| `--accent-foreground` | `hsl(28 55% 28%)` | `hsl(32 90% 62%)` | `--color-accent-foreground` |
| `--info` | `hsl(221 83% 53%)` | `hsl(210 80% 58%)` | `--color-info` |
| `--info-foreground` | `hsl(230 100% 98%)` | `hsl(230 100% 98%)` | `--color-info-foreground` |
| `--destructive` | `hsl(4 78% 56%)` | `hsl(4 74% 56%)` | `--color-destructive` |
| `--destructive-foreground` | `hsl(0 0% 100%)` | `hsl(0 0% 100%)` | `--color-destructive-foreground` |
| `--success` | `hsl(140 48% 40%)` | `hsl(140 45% 52%)` | `--color-success` |
| `--success-foreground` | `hsl(115 77% 97%)` | `hsl(115 77% 97%)` | `--color-success-foreground` |
| `--warning` | `hsl(32 92% 46%)` | `hsl(32 90% 55%)` | `--color-warning` |
| `--warning-foreground` | `hsl(33 100% 96%)` | `hsl(33 100% 96%)` | `--color-warning-foreground` |
| `--border` | `hsl(40 12% 87%)` | `hsl(222 10% 18%)` | `--color-border` |
| `--input` | `hsl(40 12% 87%)` | `hsl(222 10% 18%)` | `--color-input` |
| `--ring` | `hsl(28 88% 50%)` | `hsl(32 95% 56%)` | `--color-ring` |
| `--chart-1` | `hsl(28 88% 50%)` | `hsl(32 95% 56%)` | `--color-chart-1` |
| `--chart-2` | `hsl(200 70% 46%)` | `hsl(210 70% 56%)` | `--color-chart-2` |
| `--chart-3` | `hsl(140 48% 40%)` | `hsl(140 45% 52%)` | `--color-chart-3` |
| `--chart-4` | `hsl(320 60% 52%)` | `hsl(320 60% 60%)` | `--color-chart-4` |
| `--chart-5` | `hsl(45 90% 48%)` | `hsl(45 90% 55%)` | `--color-chart-5` |
| `--sidebar` | `hsl(40 30% 96%)` | `hsl(222 16% 9%)` | `--color-sidebar` |
| `--sidebar-foreground` | `hsl(24 12% 14%)` | `hsl(220 12% 90%)` | `--color-sidebar-foreground` |
| `--sidebar-primary` | `hsl(28 88% 50%)` | `hsl(32 95% 56%)` | `--color-sidebar-primary` |
| `--sidebar-primary-foreground` | `hsl(40 40% 98%)` | `hsl(222 18% 8%)` | `--color-sidebar-primary-foreground` |
| `--sidebar-accent` | `hsl(40 20% 90%)` | `hsl(222 12% 15%)` | `--color-sidebar-accent` |
| `--sidebar-accent-foreground` | `hsl(28 60% 32%)` | `hsl(32 90% 62%)` | `--color-sidebar-accent-foreground` |
| `--sidebar-border` | `hsl(40 12% 87%)` | `hsl(222 10% 16%)` | `--color-sidebar-border` |
| `--sidebar-ring` | `hsl(28 88% 50%)` | `hsl(32 95% 56%)` | `--color-sidebar-ring` |
| `--primary-border` | `hsl(from hsl(221 83% 53%) h s calc(l + var(--opaque-button-border-intensity)))` | — | — |
| `--secondary-border` | `hsl(from hsl(220 14% 96%) h s calc(l + var(--opaque-button-border-intensity)))` | — | — |
| `--destructive-border` | `hsl(from hsl(2 84% 62%) h s calc(l + var(--opaque-button-border-intensity)))` | — | — |
| `--accent-border` | `hsl(from hsl(220 14% 96%) h s calc(l + var(--opaque-button-border-intensity)))` | — | — |
| `--muted-border` | `hsl(from hsl(220 14% 96%) h s calc(l + var(--opaque-button-border-intensity)))` | — | — |

### 字体 / 排版（2）

| token | 浅色 | 深色 | Tailwind 工具类 |
|---|---|---|---|
| `--font-mono` | `'IBM Plex Mono', 'Source Code Pro', monospace` | — | `--font-mono` |
| `--tracking-normal` | `0em` | — | — |

### 圆角 / 阴影（10）

| token | 浅色 | 深色 | Tailwind 工具类 |
|---|---|---|---|
| `--radius` | `0.5rem` | — | `--radius-sm` `--radius-md` `--radius-lg` `--radius-xl` |
| `--shadow-x` | `0px` | — | — |
| `--shadow-y` | `2px` | — | — |
| `--shadow-blur` | `12px` | — | — |
| `--shadow-spread` | `0px` | — | — |
| `--shadow-opacity` | `0.02` | — | — |
| `--shadow-color` | `#000000` | — | — |
| `--shadow-2xs` | `0px 2px 12px 0px hsl(0 0% 0% / 0.01)` | — | `--shadow-2xs` |
| `--shadow-xs` | `0px 2px 12px 0px hsl(0 0% 0% / 0.01)` | — | `--shadow-xs` |
| `--shadow-2xl` | `0px 2px 12px 0px hsl(0 0% 0% / 0.05)` | — | `--shadow-2xl` |

### 间距 / 尺寸（1）

| token | 浅色 | 深色 | Tailwind 工具类 |
|---|---|---|---|
| `--spacing` | `0.25rem` | — | — |

## 3. 组件规格

| 组件 | 分类 | 行数 | variant | size | 引用 | 死组件 | 文件 |
|---|---|---|---|---|---|---|---|
| `accordion` | 数据展示 | 67 | — | — | 0 | ⚠️ | `src/components/ui/accordion.tsx` |
| `alert` | 反馈 | 72 | default/destructive/success/warning | — | 0 | ⚠️ | `src/components/ui/alert.tsx` |
| `alert-dialog` | 反馈 | 158 | — | — | 9 |  | `src/components/ui/alert-dialog.tsx` |
| `aspect-ratio` | 基础 | 12 | — | — | 0 | ⚠️ | `src/components/ui/aspect-ratio.tsx` |
| `avatar` | 基础 | 54 | — | — | 1 |  | `src/components/ui/avatar.tsx` |
| `badge` | 基础 | 43 | default/secondary/destructive/outline | — | 39 |  | `src/components/ui/badge.tsx` |
| `breadcrumb` | 导航 | 110 | — | — | 0 | ⚠️ | `src/components/ui/breadcrumb.tsx` |
| `button` | 基础 | 70 | default/destructive/outline/secondary/ghost | default/sm/lg/icon | 45 |  | `src/components/ui/button.tsx` |
| `button-group` | 基础 | 84 | — | — | 0 | ⚠️ | `src/components/ui/button-group.tsx` |
| `calendar` | 数据录入 | 214 | — | — | 0 | ⚠️ | `src/components/ui/calendar.tsx` |
| `card` | 基础 | 83 | — | — | 2 |  | `src/components/ui/card.tsx` |
| `carousel` | 数据展示 | 242 | — | — | 0 | ⚠️ | `src/components/ui/carousel.tsx` |
| `chart` | 数据展示 | 358 | — | — | 0 | ⚠️ | `src/components/ui/chart.tsx` |
| `checkbox` | 数据录入 | 33 | — | — | 3 |  | `src/components/ui/checkbox.tsx` |
| `collapsible` | 布局 | 34 | — | — | 3 |  | `src/components/ui/collapsible.tsx` |
| `command` | 导航 | 209 | — | — | 1 |  | `src/components/ui/command.tsx` |
| `context-menu` | 导航 | 325 | — | — | 0 | ⚠️ | `src/components/ui/context-menu.tsx` |
| `dialog` | 反馈 | 144 | — | — | 25 |  | `src/components/ui/dialog.tsx` |
| `drawer` | 反馈 | 136 | — | — | 0 | ⚠️ | `src/components/ui/drawer.tsx` |
| `dropdown-menu` | 导航 | 330 | — | — | 2 |  | `src/components/ui/dropdown-menu.tsx` |
| `empty` | 布局 | 105 | default/icon | — | 0 | ⚠️ | `src/components/ui/empty.tsx` |
| `field` | 数据录入 | 249 | — | — | 0 | ⚠️ | `src/components/ui/field.tsx` |
| `form` | 数据录入 | 168 | — | — | 0 | ⚠️ | `src/components/ui/form.tsx` |
| `hover-card` | 反馈 | 45 | — | — | 0 | ⚠️ | `src/components/ui/hover-card.tsx` |
| `image` | 基础 | 184 | — | — | 0 | ⚠️ | `src/components/ui/image.tsx` |
| `input` | 数据录入 | 22 | — | — | 26 |  | `src/components/ui/input.tsx` |
| `input-group` | 数据录入 | 167 | — | — | 0 | ⚠️ | `src/components/ui/input-group.tsx` |
| `input-otp` | 数据录入 | 78 | — | — | 0 | ⚠️ | `src/components/ui/input-otp.tsx` |
| `item` | 布局 | 194 | default/outline/muted | default/sm | 0 | ⚠️ | `src/components/ui/item.tsx` |
| `kbd` | 基础 | 29 | — | — | 0 | ⚠️ | `src/components/ui/kbd.tsx` |
| `label` | 数据录入 | 25 | — | — | 19 |  | `src/components/ui/label.tsx` |
| `menubar` | 导航 | 349 | — | — | 0 | ⚠️ | `src/components/ui/menubar.tsx` |
| `native-select` | 数据录入 | 49 | — | — | 0 | ⚠️ | `src/components/ui/native-select.tsx` |
| `navigation-menu` | 导航 | 169 | — | — | 0 | ⚠️ | `src/components/ui/navigation-menu.tsx` |
| `pagination` | 导航 | 128 | — | — | 0 | ⚠️ | `src/components/ui/pagination.tsx` |
| `popover` | 反馈 | 49 | — | — | 0 | ⚠️ | `src/components/ui/popover.tsx` |
| `progress` | 反馈 | 32 | — | — | 4 |  | `src/components/ui/progress.tsx` |
| `radio-group` | 数据录入 | 46 | — | — | 0 | ⚠️ | `src/components/ui/radio-group.tsx` |
| `resizable` | 布局 | 57 | — | — | 0 | ⚠️ | `src/components/ui/resizable.tsx` |
| `scroll-area` | 布局 | 59 | — | — | 0 | ⚠️ | `src/components/ui/scroll-area.tsx` |
| `select` | 数据录入 | 244 | — | — | 22 |  | `src/components/ui/select.tsx` |
| `separator` | 基础 | 29 | — | — | 0 | ⚠️ | `src/components/ui/separator.tsx` |
| `sheet` | 反馈 | 140 | — | — | 1 |  | `src/components/ui/sheet.tsx` |
| `sidebar` | 布局 | 728 | default/outline | default/sm/lg | 0 | ⚠️ | `src/components/ui/sidebar.tsx` |
| `skeleton` | 基础 | 14 | — | — | 0 | ⚠️ | `src/components/ui/skeleton.tsx` |
| `slider` | 数据录入 | 88 | — | — | 0 | ⚠️ | `src/components/ui/slider.tsx` |
| `sonner` | 反馈 | 68 | — | — | 1 |  | `src/components/ui/sonner.tsx` |
| `spinner` | 基础 | 17 | — | — | 0 | ⚠️ | `src/components/ui/spinner.tsx` |
| `switch` | 数据录入 | 32 | — | — | 3 |  | `src/components/ui/switch.tsx` |
| `table` | 数据展示 | 117 | — | — | 0 | ⚠️ | `src/components/ui/table.tsx` |
| `tabs` | 导航 | 67 | — | — | 3 |  | `src/components/ui/tabs.tsx` |
| `textarea` | 数据录入 | 19 | — | — | 13 |  | `src/components/ui/textarea.tsx` |
| `toggle` | 数据录入 | 48 | default/outline | default/sm/lg | 0 | ⚠️ | `src/components/ui/toggle.tsx` |
| `toggle-group` | 数据录入 | 84 | — | — | 0 | ⚠️ | `src/components/ui/toggle-group.tsx` |
| `tooltip` | 反馈 | 62 | — | — | 1 |  | `src/components/ui/tooltip.tsx` |

## 4. 死组件清单（决定删 / 留 / 合并）

- `accordion`（67 行，`apps/web/src/components/ui/accordion.tsx`）
- `alert`（72 行，`apps/web/src/components/ui/alert.tsx`）
- `aspect-ratio`（12 行，`apps/web/src/components/ui/aspect-ratio.tsx`）
- `breadcrumb`（110 行，`apps/web/src/components/ui/breadcrumb.tsx`）
- `button-group`（84 行，`apps/web/src/components/ui/button-group.tsx`）
- `calendar`（214 行，`apps/web/src/components/ui/calendar.tsx`）
- `carousel`（242 行，`apps/web/src/components/ui/carousel.tsx`）
- `chart`（358 行，`apps/web/src/components/ui/chart.tsx`）
- `context-menu`（325 行，`apps/web/src/components/ui/context-menu.tsx`）
- `drawer`（136 行，`apps/web/src/components/ui/drawer.tsx`）
- `empty`（105 行，`apps/web/src/components/ui/empty.tsx`）
- `field`（249 行，`apps/web/src/components/ui/field.tsx`）
- `form`（168 行，`apps/web/src/components/ui/form.tsx`）
- `hover-card`（45 行，`apps/web/src/components/ui/hover-card.tsx`）
- `image`（184 行，`apps/web/src/components/ui/image.tsx`）
- `input-group`（167 行，`apps/web/src/components/ui/input-group.tsx`）
- `input-otp`（78 行，`apps/web/src/components/ui/input-otp.tsx`）
- `item`（194 行，`apps/web/src/components/ui/item.tsx`）
- `kbd`（29 行，`apps/web/src/components/ui/kbd.tsx`）
- `menubar`（349 行，`apps/web/src/components/ui/menubar.tsx`）
- `native-select`（49 行，`apps/web/src/components/ui/native-select.tsx`）
- `navigation-menu`（169 行，`apps/web/src/components/ui/navigation-menu.tsx`）
- `pagination`（128 行，`apps/web/src/components/ui/pagination.tsx`）
- `popover`（49 行，`apps/web/src/components/ui/popover.tsx`）
- `radio-group`（46 行，`apps/web/src/components/ui/radio-group.tsx`）
- `resizable`（57 行，`apps/web/src/components/ui/resizable.tsx`）
- `scroll-area`（59 行，`apps/web/src/components/ui/scroll-area.tsx`）
- `separator`（29 行，`apps/web/src/components/ui/separator.tsx`）
- `sidebar`（728 行，`apps/web/src/components/ui/sidebar.tsx`）
- `skeleton`（14 行，`apps/web/src/components/ui/skeleton.tsx`）
- `slider`（88 行，`apps/web/src/components/ui/slider.tsx`）
- `spinner`（17 行，`apps/web/src/components/ui/spinner.tsx`）
- `table`（117 行，`apps/web/src/components/ui/table.tsx`）
- `toggle`（48 行，`apps/web/src/components/ui/toggle.tsx`）
- `toggle-group`（84 行，`apps/web/src/components/ui/toggle-group.tsx`）

## 5. 怎么成长（新增/修改组件时）

1. 改/加组件代码（`src/components/ui/*.tsx`，沿用 `cva` + `data-slot` 约定）。
2. 在 `.agents/skills/frontend-coding/ui-components.notes.md` 补一段 `## <组件名>`（分类/何时用/别用/反例/相关）。
3. 在 `src/pages/dev/ui-kit/demos/<分类>.tsx` 加一条 demo（展示页与截图基线要用）。
4. `npm run ui:generate`，把生成物一起提交；漏做任何一步 `npm run ui:check` 会红（CI 同款）。

## 6. 可视化展示页

`npm run dev` 后打开 **`/dev/ui-kit`**（仅开发环境注册，prod 构建不含）——按分类渲染全部组件与变体、
token 色板，并标注缺 demo 的组件。
