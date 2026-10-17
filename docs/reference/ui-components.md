# UI 组件与设计 token 参考

> 由 scripts/ui-inventory.mjs 生成 —— 禁止手改；改代码或注记后跑 `npm run ui:generate`。

本文件是**生成物**，供人类查阅；agent 的精简版在 `.agents/skills/frontend-coding/ui-components.md`。
改组件 → `cd apps/web && npm run ui:generate`；CI 用 `npm run ui:check` 防漂移。

## 1. 现状统计

| 项 | 数值 |
|---|---|
| 组件文件 | 42 个 / 5081 行 |
| 死组件（零引用） | 20 个 |
| 语义 token（:root/.dark） | 76 个 |
| Tailwind 工具类映射（@theme inline） | 65 条 |
| 字体族 / prose 映射（typography.css） | 3 / 36 |
| 语义注记覆盖 | 42/42 |
| 展示页 demo 覆盖 | 42/42 |

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

### 字体 / 排版（4）

| token | 浅色 | 深色 | Tailwind 工具类 |
|---|---|---|---|
| `--font-sans` | `'LarkHackSafariFont', 'LarkEmojiFont', 'LarkChineseQuote', '-apple-system', 'BlinkMacSystemFont', 'Helvetica Neue', 'Tahoma', 'PingFang SC', 'Microsoft Yahei', 'Arial', 'Hiragino Sans GB', 'sans-serif', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'` | — | `--font-sans` |
| `--font-serif` | `'Geist', 'Geist Fallback', ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif` | — | `--font-serif` |
| `--font-mono` | `'IBM Plex Mono', 'Source Code Pro', monospace` | — | `--font-mono` |
| `--tracking-normal` | `0em` | — | — |

### 圆角 / 阴影（15）

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
| `--shadow-sm` | `0px 2px 12px 0px hsl(0 0% 0% / 0.02), 0px 1px 2px -1px hsl(0 0% 0% / 0.02)` | — | `--shadow-sm` |
| `--shadow` | `0px 2px 12px 0px hsl(0 0% 0% / 0.02), 0px 1px 2px -1px hsl(0 0% 0% / 0.02)` | — | `--shadow` |
| `--shadow-md` | `0px 2px 12px 0px hsl(0 0% 0% / 0.02), 0px 2px 4px -1px hsl(0 0% 0% / 0.02)` | — | `--shadow-md` |
| `--shadow-lg` | `0px 2px 12px 0px hsl(0 0% 0% / 0.02), 0px 4px 6px -1px hsl(0 0% 0% / 0.02)` | — | `--shadow-lg` |
| `--shadow-xl` | `0px 2px 12px 0px hsl(0 0% 0% / 0.02), 0px 8px 10px -1px hsl(0 0% 0% / 0.02)` | — | `--shadow-xl` |
| `--shadow-2xl` | `0px 2px 12px 0px hsl(0 0% 0% / 0.05)` | — | `--shadow-2xl` |

### 动效（7）

| token | 浅色 | 深色 | Tailwind 工具类 |
|---|---|---|---|
| `--duration-instant` | `80ms` | — | `--duration-instant` |
| `--duration-fast` | `150ms` | — | `--duration-fast` |
| `--duration-base` | `200ms` | — | `--duration-base` |
| `--duration-slow` | `250ms` | — | `--duration-slow` |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | — | `--ease-standard` |
| `--ease-decelerate` | `cubic-bezier(0, 0, 0, 1)` | — | `--ease-decelerate` |
| `--ease-accelerate` | `cubic-bezier(0.3, 0, 1, 1)` | — | `--ease-accelerate` |

### 间距 / 尺寸（1）

| token | 浅色 | 深色 | Tailwind 工具类 |
|---|---|---|---|
| `--spacing` | `0.25rem` | — | — |

## 3. Tailwind 工具类映射（`@theme inline` 权威表）

> 写 UI **用这一列的工具类**，不要硬编码数值（V-002）。

| @theme token | 值 | 分类 | 对应工具类 |
|---|---|---|---|
| `--color-background` | `var(--background)` | 色彩 | `bg-background / text-background / border-background` |
| `--color-foreground` | `var(--foreground)` | 色彩 | `bg-foreground / text-foreground / border-foreground` |
| `--color-card` | `var(--card)` | 色彩 | `bg-card / text-card / border-card` |
| `--color-card-foreground` | `var(--card-foreground)` | 色彩 | `bg-card-foreground / text-card-foreground / border-card-foreground` |
| `--color-card-border` | `var(--card-border)` | 色彩 | `bg-card-border / text-card-border / border-card-border` |
| `--color-popover` | `var(--popover)` | 色彩 | `bg-popover / text-popover / border-popover` |
| `--color-popover-foreground` | `var(--popover-foreground)` | 色彩 | `bg-popover-foreground / text-popover-foreground / border-popover-foreground` |
| `--color-primary` | `var(--primary)` | 色彩 | `bg-primary / text-primary / border-primary` |
| `--color-primary-foreground` | `var(--primary-foreground)` | 色彩 | `bg-primary-foreground / text-primary-foreground / border-primary-foreground` |
| `--color-secondary` | `var(--secondary)` | 色彩 | `bg-secondary / text-secondary / border-secondary` |
| `--color-secondary-foreground` | `var(--secondary-foreground)` | 色彩 | `bg-secondary-foreground / text-secondary-foreground / border-secondary-foreground` |
| `--color-muted` | `var(--muted)` | 色彩 | `bg-muted / text-muted / border-muted` |
| `--color-muted-foreground` | `var(--muted-foreground)` | 色彩 | `bg-muted-foreground / text-muted-foreground / border-muted-foreground` |
| `--color-accent` | `var(--accent)` | 色彩 | `bg-accent / text-accent / border-accent` |
| `--color-accent-foreground` | `var(--accent-foreground)` | 色彩 | `bg-accent-foreground / text-accent-foreground / border-accent-foreground` |
| `--color-info` | `var(--info)` | 色彩 | `bg-info / text-info / border-info` |
| `--color-info-foreground` | `var(--info-foreground)` | 色彩 | `bg-info-foreground / text-info-foreground / border-info-foreground` |
| `--color-destructive` | `var(--destructive)` | 色彩 | `bg-destructive / text-destructive / border-destructive` |
| `--color-destructive-foreground` | `var(--destructive-foreground)` | 色彩 | `bg-destructive-foreground / text-destructive-foreground / border-destructive-foreground` |
| `--color-success` | `var(--success)` | 色彩 | `bg-success / text-success / border-success` |
| `--color-success-foreground` | `var(--success-foreground)` | 色彩 | `bg-success-foreground / text-success-foreground / border-success-foreground` |
| `--color-warning` | `var(--warning)` | 色彩 | `bg-warning / text-warning / border-warning` |
| `--color-warning-foreground` | `var(--warning-foreground)` | 色彩 | `bg-warning-foreground / text-warning-foreground / border-warning-foreground` |
| `--color-border` | `var(--border)` | 色彩 | `bg-border / text-border / border-border` |
| `--color-input` | `var(--input)` | 色彩 | `bg-input / text-input / border-input` |
| `--color-ring` | `var(--ring)` | 色彩 | `bg-ring / text-ring / border-ring` |
| `--color-chart-1` | `var(--chart-1)` | 色彩 | `bg-chart-1 / text-chart-1 / border-chart-1` |
| `--color-chart-2` | `var(--chart-2)` | 色彩 | `bg-chart-2 / text-chart-2 / border-chart-2` |
| `--color-chart-3` | `var(--chart-3)` | 色彩 | `bg-chart-3 / text-chart-3 / border-chart-3` |
| `--color-chart-4` | `var(--chart-4)` | 色彩 | `bg-chart-4 / text-chart-4 / border-chart-4` |
| `--color-chart-5` | `var(--chart-5)` | 色彩 | `bg-chart-5 / text-chart-5 / border-chart-5` |
| `--color-sidebar` | `var(--sidebar)` | 色彩 | `bg-sidebar / text-sidebar / border-sidebar` |
| `--color-sidebar-foreground` | `var(--sidebar-foreground)` | 色彩 | `bg-sidebar-foreground / text-sidebar-foreground / border-sidebar-foreground` |
| `--color-sidebar-primary` | `var(--sidebar-primary)` | 色彩 | `bg-sidebar-primary / text-sidebar-primary / border-sidebar-primary` |
| `--color-sidebar-primary-foreground` | `var(--sidebar-primary-foreground)` | 色彩 | `bg-sidebar-primary-foreground / text-sidebar-primary-foreground / border-sidebar-primary-foreground` |
| `--color-sidebar-accent` | `var(--sidebar-accent)` | 色彩 | `bg-sidebar-accent / text-sidebar-accent / border-sidebar-accent` |
| `--color-sidebar-accent-foreground` | `var(--sidebar-accent-foreground)` | 色彩 | `bg-sidebar-accent-foreground / text-sidebar-accent-foreground / border-sidebar-accent-foreground` |
| `--color-sidebar-border` | `var(--sidebar-border)` | 色彩 | `bg-sidebar-border / text-sidebar-border / border-sidebar-border` |
| `--color-sidebar-ring` | `var(--sidebar-ring)` | 色彩 | `bg-sidebar-ring / text-sidebar-ring / border-sidebar-ring` |
| `--font-sans` | `var(--font-sans)` | 字体 | `font-sans` |
| `--font-mono` | `var(--font-mono)` | 字体 | `font-mono` |
| `--font-serif` | `var(--font-serif)` | 字体 | `font-serif` |
| `--radius-sm` | `calc(var(--radius) - 4px)` | 圆角 | `rounded-sm` |
| `--radius-md` | `calc(var(--radius) - 2px)` | 圆角 | `rounded-md` |
| `--radius-lg` | `var(--radius)` | 圆角 | `rounded-lg` |
| `--radius-xl` | `calc(var(--radius) + 4px)` | 圆角 | `rounded-xl` |
| `--duration-instant` | `var(--duration-instant)` | 其他 | `—` |
| `--duration-fast` | `var(--duration-fast)` | 其他 | `—` |
| `--duration-base` | `var(--duration-base)` | 其他 | `—` |
| `--duration-slow` | `var(--duration-slow)` | 其他 | `—` |
| `--ease-standard` | `var(--ease-standard)` | 其他 | `—` |
| `--ease-decelerate` | `var(--ease-decelerate)` | 其他 | `—` |
| `--ease-accelerate` | `var(--ease-accelerate)` | 其他 | `—` |
| `--shadow-2xs` | `var(--shadow-2xs)` | 阴影 | `shadow-2xs` |
| `--shadow-xs` | `var(--shadow-xs)` | 阴影 | `shadow-xs` |
| `--shadow-sm` | `var(--shadow-sm)` | 阴影 | `shadow-sm` |
| `--shadow` | `var(--shadow)` | 其他 | `—` |
| `--shadow-md` | `var(--shadow-md)` | 阴影 | `shadow-md` |
| `--shadow-lg` | `var(--shadow-lg)` | 阴影 | `shadow-lg` |
| `--shadow-xl` | `var(--shadow-xl)` | 阴影 | `shadow-xl` |
| `--shadow-2xl` | `var(--shadow-2xl)` | 阴影 | `shadow-2xl` |
| `--text-4xs` | `0.5625rem` | 字号 | `text-4xs` |
| `--text-3xs` | `0.625rem` | 字号 | `text-3xs` |
| `--text-2xs` | `0.6875rem` | 字号 | `text-2xs` |
| `--text-md` | `0.8125rem` | 字号 | `text-md` |

### 3.1 排版（typography）

- 插件：`@tailwindcss/typography`
- 字体族：`font-sans`（界面默认）· `font-mono`（代码/数字/ID）· `font-serif`（长文衬线，少用）
- 标题字号**必须用尺度 token**（禁 `text-[Npx]`，V-003）；长文正文用 `prose`（其 token 映射如下）

| prose token | 值 |
|---|---|
| `--tw-prose-body` | `var(--foreground)` |
| `--tw-prose-headings` | `var(--foreground)` |
| `--tw-prose-lead` | `var(--muted-foreground)` |
| `--tw-prose-links` | `var(--primary)` |
| `--tw-prose-bold` | `var(--foreground)` |
| `--tw-prose-counters` | `var(--muted-foreground)` |
| `--tw-prose-bullets` | `var(--primary)` |
| `--tw-prose-hr` | `var(--border)` |
| `--tw-prose-quotes` | `var(--foreground)` |
| `--tw-prose-quote-borders` | `var(--border)` |
| `--tw-prose-captions` | `var(--muted-foreground)` |
| `--tw-prose-kbd` | `var(--foreground)` |
| `--tw-prose-kbd-shadows` | `--alpha(var(--foreground) / 90%)` |
| `--tw-prose-code` | `var(--foreground)` |
| `--tw-prose-pre-code` | `var(--accent-foreground)` |
| `--tw-prose-pre-bg` | `var(--accent)` |
| `--tw-prose-th-borders` | `var(--border)` |
| `--tw-prose-td-borders` | `var(--border)` |
| `--tw-prose-invert-body` | `var(--foreground)` |
| `--tw-prose-invert-headings` | `var(--foreground)` |
| `--tw-prose-invert-lead` | `var(--muted-foreground)` |
| `--tw-prose-invert-links` | `var(--primary)` |
| `--tw-prose-invert-bold` | `var(--foreground)` |
| `--tw-prose-invert-counters` | `var(--muted-foreground)` |
| `--tw-prose-invert-bullets` | `var(--primary)` |
| `--tw-prose-invert-hr` | `var(--border)` |
| `--tw-prose-invert-quotes` | `var(--foreground)` |
| `--tw-prose-invert-quote-borders` | `var(--border)` |
| `--tw-prose-invert-captions` | `var(--muted-foreground)` |
| `--tw-prose-invert-kbd` | `var(--foreground)` |
| `--tw-prose-invert-kbd-shadows` | `--alpha(var(--foreground) / 90%)` |
| `--tw-prose-invert-code` | `var(--foreground)` |
| `--tw-prose-invert-pre-code` | `var(--accent-foreground)` |
| `--tw-prose-invert-pre-bg` | `var(--accent)` |
| `--tw-prose-invert-th-borders` | `var(--border)` |
| `--tw-prose-invert-td-borders` | `var(--border)` |
### 3.2 尺度实际用法（从源码统计 197 个文件）

> 回答的是「**实际在用哪几档**」，不是「有哪些档位」；统计按源码文本匹配，可能含少量非样式字符串。

| 类别 | 常用档位（次数） | 离散步长（建议收敛） |
|---|---|---|
| 字号 | `xs`(382) · `sm`(205) · `lg`(16) · `base`(10) · `xl`(3) · `2xl`(1) | `0.8rem`(2) |
| 间距 | `2`(741) · `3`(458) · `1`(450) · `1.5`(331) · `4`(262) · `0.5`(119) | `-0.45rem`(2) · `-0.35rem`(2) |
| 圆角 | `lg`(194) · `xl`(170) · `DEFAULT`(105) · `md`(91) · `full`(69) · `2xl`(27) | `2px`(3) · `calc(var(--radius)-5px)`(3) · `4px`(1) · `inherit`(1) |
| 阴影 | `DEFAULT`(61) · `md`(30) · `lg`(27) · `sm`(13) · `xs`(5) · `2xl`(5) | `0_0_0_1px_hsl(var(--sidebar-border))`(1) · `0_0_0_1px_hsl(var(--sidebar-accent))`(1) |
| 行高 / 字距 | `relaxed`(63) · `none`(8) · `5`(7) · `snug`(4) · `wider`(7) · `wide`(7) · `tight`(5) · `widest`(4) | — |

> ⚠️ 离散步长合计 **16** 处：
> 小字号尤其集中（如 `text-[10px]`），说明"尺度 token 之外还有一套事实上的离散值"。新增 UI 请优先用尺度 token；标题禁 `text-[Npx]`（V-003）。


## 4. 组件规格

| 组件 | 分类 | 行数 | variant | size | 引用 | 死组件 | 文件 |
|---|---|---|---|---|---|---|---|
| `accordion` | 数据展示 | 67 | — | — | 0 | ⚠️ | `src/components/ui/accordion.tsx` |
| `alert` | 反馈 | 72 | default/destructive/success/warning | — | 0 | ⚠️ | `src/components/ui/alert.tsx` |
| `alert-dialog` | 反馈 | 158 | — | — | 9 |  | `src/components/ui/alert-dialog.tsx` |
| `avatar` | 基础 | 54 | — | — | 1 |  | `src/components/ui/avatar.tsx` |
| `badge` | 基础 | 43 | default/secondary/destructive/outline | — | 44 |  | `src/components/ui/badge.tsx` |
| `breadcrumb` | 导航 | 110 | — | — | 0 | ⚠️ | `src/components/ui/breadcrumb.tsx` |
| `button` | 基础 | 70 | default/destructive/outline/secondary/ghost | default/sm/lg/icon | 51 |  | `src/components/ui/button.tsx` |
| `calendar` | 数据录入 | 214 | — | — | 0 | ⚠️ | `src/components/ui/calendar.tsx` |
| `card` | 基础 | 83 | — | — | 3 |  | `src/components/ui/card.tsx` |
| `chart` | 数据展示 | 358 | — | — | 0 | ⚠️ | `src/components/ui/chart.tsx` |
| `checkbox` | 数据录入 | 33 | — | — | 2 |  | `src/components/ui/checkbox.tsx` |
| `collapsible` | 布局 | 34 | — | — | 1 |  | `src/components/ui/collapsible.tsx` |
| `command` | 导航 | 209 | — | — | 1 |  | `src/components/ui/command.tsx` |
| `dialog` | 反馈 | 144 | — | — | 25 |  | `src/components/ui/dialog.tsx` |
| `dropdown-menu` | 导航 | 330 | — | — | 2 |  | `src/components/ui/dropdown-menu.tsx` |
| `empty` | 布局 | 105 | default/icon | — | 0 | ⚠️ | `src/components/ui/empty.tsx` |
| `field` | 数据录入 | 249 | — | — | 0 | ⚠️ | `src/components/ui/field.tsx` |
| `form` | 数据录入 | 168 | — | — | 0 | ⚠️ | `src/components/ui/form.tsx` |
| `image` | 基础 | 184 | — | — | 0 | ⚠️ | `src/components/ui/image.tsx` |
| `input` | 数据录入 | 22 | — | — | 27 |  | `src/components/ui/input.tsx` |
| `input-group` | 数据录入 | 167 | — | — | 0 | ⚠️ | `src/components/ui/input-group.tsx` |
| `item` | 布局 | 194 | default/outline/muted | default/sm | 0 | ⚠️ | `src/components/ui/item.tsx` |
| `label` | 数据录入 | 25 | — | — | 21 |  | `src/components/ui/label.tsx` |
| `native-select` | 数据录入 | 49 | — | — | 0 | ⚠️ | `src/components/ui/native-select.tsx` |
| `pagination` | 导航 | 128 | — | — | 0 | ⚠️ | `src/components/ui/pagination.tsx` |
| `popover` | 反馈 | 49 | — | — | 0 | ⚠️ | `src/components/ui/popover.tsx` |
| `progress` | 反馈 | 32 | — | — | 4 |  | `src/components/ui/progress.tsx` |
| `radio-group` | 数据录入 | 46 | — | — | 0 | ⚠️ | `src/components/ui/radio-group.tsx` |
| `scroll-area` | 布局 | 59 | — | — | 0 | ⚠️ | `src/components/ui/scroll-area.tsx` |
| `select` | 数据录入 | 244 | — | — | 23 |  | `src/components/ui/select.tsx` |
| `separator` | 基础 | 29 | — | — | 3 |  | `src/components/ui/separator.tsx` |
| `sheet` | 反馈 | 140 | — | — | 5 |  | `src/components/ui/sheet.tsx` |
| `sidebar` | 布局 | 728 | default/outline | default/sm/lg | 0 | ⚠️ | `src/components/ui/sidebar.tsx` |
| `skeleton` | 基础 | 14 | — | — | 1 |  | `src/components/ui/skeleton.tsx` |
| `slider` | 数据录入 | 88 | — | — | 0 | ⚠️ | `src/components/ui/slider.tsx` |
| `sonner` | 反馈 | 68 | — | — | 1 |  | `src/components/ui/sonner.tsx` |
| `spinner` | 基础 | 17 | — | — | 0 | ⚠️ | `src/components/ui/spinner.tsx` |
| `switch` | 数据录入 | 32 | — | — | 4 |  | `src/components/ui/switch.tsx` |
| `table` | 数据展示 | 117 | — | — | 0 | ⚠️ | `src/components/ui/table.tsx` |
| `tabs` | 导航 | 67 | — | — | 2 |  | `src/components/ui/tabs.tsx` |
| `textarea` | 数据录入 | 19 | — | — | 14 |  | `src/components/ui/textarea.tsx` |
| `tooltip` | 反馈 | 62 | — | — | 2 |  | `src/components/ui/tooltip.tsx` |

## 5. 死组件清单（决定删 / 留 / 合并）

- `accordion`（67 行，`apps/web/src/components/ui/accordion.tsx`）
- `alert`（72 行，`apps/web/src/components/ui/alert.tsx`）
- `breadcrumb`（110 行，`apps/web/src/components/ui/breadcrumb.tsx`）
- `calendar`（214 行，`apps/web/src/components/ui/calendar.tsx`）
- `chart`（358 行，`apps/web/src/components/ui/chart.tsx`）
- `empty`（105 行，`apps/web/src/components/ui/empty.tsx`）
- `field`（249 行，`apps/web/src/components/ui/field.tsx`）
- `form`（168 行，`apps/web/src/components/ui/form.tsx`）
- `image`（184 行，`apps/web/src/components/ui/image.tsx`）
- `input-group`（167 行，`apps/web/src/components/ui/input-group.tsx`）
- `item`（194 行，`apps/web/src/components/ui/item.tsx`）
- `native-select`（49 行，`apps/web/src/components/ui/native-select.tsx`）
- `pagination`（128 行，`apps/web/src/components/ui/pagination.tsx`）
- `popover`（49 行，`apps/web/src/components/ui/popover.tsx`）
- `radio-group`（46 行，`apps/web/src/components/ui/radio-group.tsx`）
- `scroll-area`（59 行，`apps/web/src/components/ui/scroll-area.tsx`）
- `sidebar`（728 行，`apps/web/src/components/ui/sidebar.tsx`）
- `slider`（88 行，`apps/web/src/components/ui/slider.tsx`）
- `spinner`（17 行，`apps/web/src/components/ui/spinner.tsx`）
- `table`（117 行，`apps/web/src/components/ui/table.tsx`）

## 6. 怎么成长（新增/修改组件时）

1. 改/加组件代码（`src/components/ui/*.tsx`，沿用 `cva` + `data-slot` 约定）。
2. 在 `.agents/skills/frontend-coding/ui-components.notes.md` 补一段 `## <组件名>`（分类/何时用/别用/反例/相关）。
3. 在 `src/pages/dev/ui-kit/demos/<分类>.tsx` 加一条 demo（展示页与截图基线要用）。
4. `npm run ui:generate`，把生成物一起提交；漏做任何一步 `npm run ui:check` 会红（CI 同款）。

## 7. 可视化展示页

`npm run dev` 后打开 **`/dev/ui-kit`**（仅开发环境注册，prod 构建不含）——按分类渲染全部组件与变体、
token 色板，并标注缺 demo 的组件。
