# 前端编码规范（全量规则）

> 定位：**apps/web/** 下编写代码时的正向规范。与 `.agents/skills/frontend-quality/rules.md`（交付门禁 R-* 反模式）互补：本文件管「怎么写」，frontend-quality 管「查」。
> 规则格式：唯一 ID + 级别（MUST/SHOULD/MAY）+ 触发条件 + 正反例 + 检测方式 + 例外。MUST 进 CI 阻断、SHOULD 进 PR 审查、MAY 仅文档。
> 编号族：`FE-*`（编码）、`UC-*`（UI 组件库）、`FE-TEST-*`（测试）。与 quality-gate.mjs 已扫项不重复定义（重复项只引用 R-* 编号）。
> 规则编号永久不变，只追加不修改。

---

## 一、总原则

1. **可读性优先**：命名准确 > 注释解释；小函数 > 长函数。
2. **类型即文档**：契约用类型表达，不靠注释。
3. **状态最小化**：能推导的不单独存；一份数据一个权威位置。
4. **组件即契约**：props 即对外契约，受控/非受控、必填/可选明确。
5. **先对后美再快**：功能正确 > 视觉精致 > 性能微优化。
6. **不做重复**：两处相同逻辑提取，三处相同 UI 抽组件。

## 二、TypeScript 纪律

### FE-TS-001 禁止 any（MUST）
- **触发**：需要标注类型时
- **禁止**：`any`、`as any`、`@ts-ignore`、`@ts-expect-error`、`: any`
- **必须**：`unknown` + 类型守卫收窄；第三方缺类型用 `declare module`
- **正确**：
  ```ts
  function isProject(v: unknown): v is Project {
    return typeof v === 'object' && v !== null && 'id' in v;
  }
  ```
- **错误**：`const proj = data as any; const p: any = {...}`
- **检测**：ESLint `@typescript-eslint/no-explicit-any`（已配 error）+ `no-unsafe-*`；代码审查
- **例外**：极少数适配层（如第三方 SDK 边界），必须注释 `// eslint-disable-line` 并说明

### FE-TS-002 异步状态用判别联合（MUST）
- **触发**：定义异步数据状态时
- **禁止**：`{ loading: boolean; data?: T; error?: string }` 可同时为真
- **必须**：
  ```ts
  type LoadState<T> =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'success'; data: T }
    | { status: 'error'; error: ApiError };
  ```
- **检测**：代码审查
- **例外**：极简一次性请求可直接三态布尔（仍需互斥）

### FE-TS-003 服务端字段口径（MUST）
- **触发**：定义 API 请求/响应类型时
- **必须**：以 BFF 契约为准（`types/` 定义），snake_case 服务端字段只在 UI 边界转换；前端不发明不一致字段
- **检测**：代码审查

### FE-TS-004 import type 纪律（MUST）
- **触发**：import 仅用于类型的模块
- **必须**：`import type { X }`；禁止类型当值引用
- **检测**：ESLint `consistent-type-imports`

## 三、组件契约

### FE-COMP-001 props 先定再写（MUST）
- **触发**：创建新组件时
- **禁止**：先写实现后补 props
- **必须**：先定 `interface XProps` + 状态变体，确认后写实现
- **检测**：代码审查

### FE-COMP-002 展示组件零依赖（MUST）
- **触发**：编写展示/通用组件（`components/ui/`、`components/common/`）时
- **禁止**：import store、api client、router、业务 hook
- **必须**：只收 props，通过回调触发外部行为
- **检测**：ESLint `no-restricted-imports` 按目录配置 + 代码审查

### FE-COMP-003 禁止 render 中创建组件（MUST）
- **触发**：任何组件 render
- **禁止**：render 内 `const Row = () => ...`（每次渲染新引用 → 重挂 → 丢状态）
- **必须**：组件定义在模块顶层，或内联 JSX
- **检测**：ESLint `react/no-unstable-nested-components` + 代码审查

### FE-COMP-004 列表稳定 key（MUST）
- **触发**：渲染列表
- **禁止**：index 作 key（列表可增删时）
- **必须**：业务 id（`project.id`）；静态不变列表可 index
- **检测**：ESLint `react/no-array-index-key` + 代码审查

### FE-COMP-005 组件粒度（SHOULD）
- **触发**：组件超 ~150 行或逻辑复杂
- **必须**：按「是否单独复用/测试/变化」拆分
- **检测**：代码审查

## 四、状态管理（Zustand）

### FE-STATE-001 selector 最小切片（MUST）
- **触发**：组件读取 store 时
- **禁止**：`const { a, b } = useStore()` 解构整个 store
- **必须**：`const a = useStore(s => s.a)` 或 `useShallow` 多选
- **正确**：`const projects = useProjectStore(s => s.projects)`
- **错误**：`const { projects, dataSource } = useProjectStore()`
- **检测**：ESLint 自定义规则 / 代码审查

### FE-STATE-002 persist 白名单（MUST）
- **触发**：使用 persist 中间件时
- **禁止**：持久化 token/密码、临时 UI 状态、服务端缓存
- **必须**：显式 `partialize`、`version`、`migrate`
- **检测**：代码审查

### FE-STATE-003 跨 store 用 getState（MUST）
- **触发**：action/事件中读另一 store 时
- **禁止**：render 中调用 `getState()`
- **必须**：action 内 `useBStore.getState()`；render 中 selector 订阅
- **检测**：代码审查

### FE-STATE-004 写入收敛（MUST）
- **触发**：修改 store 状态时
- **禁止**：组件内散落 setState
- **必须**：通过 store action 修改
- **检测**：代码审查

## 五、API 层

### FE-API-001 统一走 client（MUST）
- **触发**：发起 HTTP 请求时
- **禁止**：页面内裸 `fetch`
- **必须**：走 `lib/api/client.ts`，统一 headers/ApiError
- **检测**：ESLint `no-restricted-globals: fetch` + 代码审查

### FE-API-002 错误三态 + 透传（MUST）
- **触发**：数据请求 UI
- **必须**：loading/error/empty 三态；error 展示 `ApiError.message` 真实根因
- **禁止**：catch 后写死误导文案
- **检测**：代码审查（quality-gate R4）

### FE-API-003 竞态防护（MUST）
- **触发**：可能被覆盖的请求（搜索/详情切换）
- **必须**：AbortController 或请求序号丢弃过期响应
- **禁止**：忽略旧响应的 flag 竞态
- **检测**：代码审查

### FE-API-004 乐观更新 + 回滚（MUST）
- **触发**：可逆操作乐观更新
- **必须**：snapshot → 修改 → 请求 → 失败回滚 → 成功确认
- **禁止**：无回滚乐观更新
- **检测**：代码审查

### FE-API-005 防重复提交（MUST）
- **触发**：创建/提交按钮
- **必须**：请求期间 disabled（或请求级去重）
- **检测**：代码审查

## 六、样式（Tailwind）

### FE-STYLE-001 grid/flex 子项 min-w-0（MUST）
- **触发**：flex/grid 子项含可截断内容
- **必须**：子项 `min-w-0`，长文本 `truncate`/`break-words`
- **检测**：quality-gate（R2）+ 代码审查

### FE-STYLE-002 max-w 仅弹窗窄场景（MUST）
- **触发**：设置最大宽度时
- **禁止**：页面级容器 `max-w-xl/2xl`
- **允许**：DialogContent 等弹窗窄场景
- **检测**：quality-gate（R3）

### FE-STYLE-003 禁内联样式（MUST）
- **触发**：写样式时
- **禁止**：`style={{...}}`（动态值除外：尺寸/进度/图表高度/CSS 变量）
- **检测**：quality-gate（R-UI-001）

### FE-STYLE-004 布局 token / 语义色（SHOULD）
- **触发**：布局与配色
- **必须**：用 design token 与语义色；状态色统一（成功绿/警告黄/错误红/信息蓝）
- **检测**：代码审查

### FE-STYLE-005 先窄后宽（SHOULD）
- **触发**：响应式布局
- **必须**：先 375px 可用，再 `md:`/`lg:` 扩展；动效统一 150-250ms
- **检测**：L3 浏览器验证

## 七、Hooks 纪律

### FE-HOOK-001 顶层调用（MUST）
- **触发**：组件内使用 hooks
- **禁止**：条件/循环/早退 return 后调用 hooks
- **必须**：全部 hooks 在组件顶部
- **检测**：ESLint `react-hooks/rules-of-hooks`

### FE-HOOK-002 依赖数组完整（MUST）
- **触发**：useEffect/useCallback/useMemo
- **必须**：依赖数组完整；不依赖内部状态派生数据（用计算属性）
- **检测**：ESLint `react-hooks/exhaustive-deps`

### FE-HOOK-003 副作用封装（SHOULD）
- **触发**：请求 + 三态 + 重试逻辑
- **必须**：封装为 `useXxx()` 自定义 hook，页面保持薄
- **检测**：代码审查

## 八、可访问性

### FE-A11Y-001 图标按钮语义（MUST）
- **触发**：纯图标按钮
- **必须**：`title` 或 `aria-label`
- **检测**：quality-gate 已扫描

### FE-A11Y-002 表单标签（MUST）
- **触发**：表单控件
- **必须**：`htmlFor`/`aria-label`；键盘可操作
- **检测**：L3 浏览器验证

### FE-A11Y-003 弹窗焦点管理（SHOULD）
- **触发**：Dialog/Sheet 弹窗
- **必须**：打开聚焦、关闭还原；`role="dialog"` + `aria-modal`
- **检测**：L3 浏览器验证

---

# UI 组件库规范（UC-*）

> 定位：`apps/web/src/components/ui/`（通用组件）与 `components/common/`（业务公共组件）的建设规范。
> 现状（2026-10-13）：ui/ 56 个组件（shadcn 风格，Radix + cva + cn）+ common/ 4 个（DemoBadge/EmptyState/FilterBar/ResourceList）。
> 基础层已相当完整，**不重复建设**；缺口集中在文件上传与搜索选择。

## 组件设计规则

### UC-001 三段式结构（MUST）
- **触发**：新增组件
- **必须**：`组件.tsx`（实现）+ 同目录导出 + 仅依赖 `@/lib/utils` 的 `cn` 与 cva 变体；样式走 Tailwind className，禁内联样式（动态值除外）
- **检测**：代码审查（R-UI-001）

### UC-002 props 契约 + cva 变体（MUST）
- **触发**：通用组件
- **必须**：`interface XProps extends React.ComponentProps<"button">` 风格；视觉变体用 cva（`variants: { size, variant }`），默认值明确
- **正确**：`button.tsx` 的 cva 模式（仓库基准）
- **检测**：代码审查

### UC-003 展示组件零业务依赖（MUST）
- **触发**：ui/ 组件
- **禁止**：import store / api client / router / 业务 hook / 业务类型
- **必须**：只收 props，通过回调（onClick/onChange）触发外部行为
- **检测**：ESLint no-restricted-imports（按目录配置）+ 代码审查

### UC-004 状态变体齐全（MUST）
- **触发**：表单/交互组件
- **必须**：default / disabled / loading（如有）/ error 态视觉可辨；纯图标按钮有 title/aria-label
- **检测**：L3 浏览器验证

### UC-005 可访问性（MUST）
- **触发**：所有组件
- **必须**：label 关联、键盘可操作、焦点管理（弹层类）、aria 语义；对比度 ≥ 4.5:1
- **检测**：L3 浏览器验证

### UC-006 复用优先（MUST）
- **触发**：页面需要某 UI 时
- **必须**：先查 ui/ 是否已有；三处以上相同 UI 抽成公共组件；**禁止**页面内各自实现基础 UI（如手写弹窗、手写 switch）
- **检测**：代码审查 + 先查 `.agents/skills/frontend-coding/ui-components.md`（组件清单：55 组件 / variants / 何时用 / 反例）；新增组件由 `npm run ui:check` 强制补注记与展示页 demo

### UC-007 组件即契约（SHOULD）
- **触发**：组件 props 超 6 个
- **必须**：语义分组（`view`/`actions`/`data`）或拆分；不确定受控时给默认值 + defaultValue

### UC-008 动效统一（SHOULD）
- **触发**：过渡/动画
- **必须**：150-250ms 统一时长；尊重 `prefers-reduced-motion`；loading 态有文案+图标

## 缺口与新增优先级

| 优先级 | 组件 | 场景 | 设计要点 |
|---|---|---|---|
| **P0** | **FileUpload / UploadZone** | 模型中心资产、项目资产、立绘/道具上传 | 拖拽 + 点击双入口；多/单文件模式；进度条；类型/大小校验；失败重试；缩略图预览；`accept`/`maxSize`/`maxCount` props；状态：idle→uploading→success/error |
| **P0** | **SearchSelect（combobox）** | 模型选择、渠道选择、模板选择（多页面重复下拉搜索） | command + popover 组合；`searchable`、单选/多选、外部受控 value/onChange；空态"无匹配" |
| P1 | **DatePicker** | 报表/审计按日期筛选 | calendar 之上封装 popover + 预设（今日/近7天/本月）；format 显示 |
| P1 | **ConfirmButton（二次确认按钮）** | 删除渠道/模型/项目（R-CRUD-002 强制） | alert-dialog 封装：`onConfirm` + loading + 危险色 variant；统一文案模式 |
| P2 | **DataTable（表格增强）** | 审计列表、模型列表长表格 | 排序/列显隐/空态/loading 集成（基于现有 table.tsx） |
| P2 | **StatCard / MetricCard** | 成本看板指标卡 | 数值 + 单位 + 同比 + 趋势色；统一数字格式化（toLocaleString） |

> P0 与模型中心/资产功能直接相关（T3 及后续开发用到），随开发任务一并建设；P1/P2 按需求触发，不预先空建。

## 组件建设流程

1. **查**：ui/ 是否已有？common/ 是否已有？能组合现成组件（如 SearchSelect = command + popover）就不新建
2. **定契约**：先写 `interface XProps`（必填/可选、受控/非受控、事件回调签名），确认后实现
3. **建**：cva 变体 + 状态变体 + 可访问性 + 动效统一；实现放 `components/ui/`（通用）或 `components/common/`（业务公共）
4. **验**：`npm run gate` GATE=0 + L3 浏览器验证 default/disabled/error/empty 态
5. **记**：在缺口表勾除已建项，避免重复建设

---

# 前端测试规范（FE-TEST-*）

> 体系：node:test，`cd apps/web && npm test`（`node --experimental-strip-types --test tests/*.test.ts`）。
> 基线：`apps/web/tests/` 已有 17 个测试文件（纯函数/utils/server 逻辑为主）。

### FE-TEST-001 纯函数必有测试（MUST）
- **触发**：`lib/`、`config/`、utils、状态机/规则解析等纯函数
- **必须**：核心纯函数（哈希、规则解析、schema 校验、队列工具、候选生成）必须有单测
- **检测**：覆盖率报告 + 代码审查

### FE-TEST-002 三态与边界覆盖（MUST）
- **触发**：测试数据逻辑/组件逻辑
- **必须**：正常路径 + 空输入 + 边界值（空数组、null、超长）三态覆盖
- **正确**：
  ```ts
  test('空数组返回空结果', () => { ... })
  test('超长输入截断', () => { ... })
  ```
- **检测**：代码审查

### FE-TEST-003 服务端逻辑用 server 测试（MUST）
- **触发**：涉及 API 请求/响应解析的测试（如 audit-stats.server.test.ts 模式）
- **必须**：用 server 测试模式（mock 响应），不依赖真实后端
- **检测**：代码审查

### FE-TEST-004 组件测试按需（SHOULD）
- **触发**：复杂交互组件（表单、弹窗联动、上传）
- **必须**：覆盖关键状态（default/disabled/error/empty）；纯展示组件可不测（靠 L3 浏览器验证）
- **检测**：代码审查

### FE-TEST-005 测试命名可读（MUST）
- **触发**：写测试
- **必须**：`test('动词 + 对象 + 期望结果', ...)`（如 `test('创建草稿校验非法比例拒绝')`），中文描述业务语义
- **禁止**：`test('test1')`、无断言测试
- **检测**：代码审查

### FE-TEST-006 禁止测试依赖本地时区/系统时间（MUST）
- **触发**：涉及时间断言
- **必须**：固定时区/注入时间（CI 跑 UTC，依赖本地时区的测试会假绿/假红）
- **检测**：CI + 代码审查

### FE-TEST-007 测试不跳过（MUST）
- **触发**：提交测试
- **禁止**：`.skip`、`.only`、`SKIP` 残留
- **检测**：CI 守卫

## 测试分层策略

| 层 | 对象 | 手段 | 要求 |
|---|---|---|---|
| L0 纯函数 | lib/、config/、utils | node:test 单测 | MUST（FE-TEST-001） |
| L1 业务逻辑 | 规则解析、队列、候选 | server 测试（mock） | MUST（FE-TEST-003） |
| L2 组件 | 复杂交互组件 | 组件测试（按需） | SHOULD（FE-TEST-004） |
| L3 浏览器 | 页面渲染/请求/交互 | L3 浏览器验证 | 每次 UI 改动必做 |

---

# 质量门禁（写完后必须做）

1. `cd apps/web && npm run gate` → **GATE=0**（typecheck `tsconfig.app.json` + eslint + quality-gate）
2. 自查不命中 R1-R10 反模式（frontend-quality）
3. L3 浏览器验证真实渲染/请求/交互
4. 改全局布局/结构后重跑完整验收

---

# 反模式速查（AI 遇到立即停止并纠正）

| 反模式 | 正确做法 |
|---|---|
| `data as any` / `: any` | `unknown` + 类型守卫 |
| `const { a, b } = useStore()` | selector 最小切片 |
| 组件内裸 `fetch(` | `lib/api/client.ts` |
| render 内定义组件 | 顶层定义 / 内联 JSX |
| 列表 key 用 index | 业务 id |
| catch 写死文案 | 透传 `ApiError.message` |
| 双击重复提交 | 提交期间 disabled |
| useEffect 派生数据 | 计算属性 / useMemo |
| 页面级 `max-w-xl` | 内容区撑满，max-w 仅弹窗 |
| 页面内手写弹窗/switch | 用 ui/ 现有组件 |
| 上传组件页面各自实现 | 抽 FileUpload 公共组件（P0） |
| 下拉选择不可搜索（选项多时） | SearchSelect（P0） |
| 组件 import store/api | 展示组件零依赖（UC-003） |
| 无确认弹窗直接删除 | ConfirmButton（P1） |
| 组件内联 style | cva + className |
| 无断言测试 | 至少一个 `assert`/`expect` |
| `.skip`/`.only` 残留 | 删除后提交 |
| 依赖本地时区 | 固定 UTC/注入时间 |
| 测试依赖真实后端 | server 测试 mock |

---

# 存量违规状态（2026-10-13 已清零）

> 历史存量违规（CharacterStage/3 个 Library 的 any、3 处 store 整对象解构）已于 2026-10-13 清零并通过 GATE=0。
> **新代码从第一行起就必须满足全部 MUST**，不存在「先写后改」；未来如发现存量违规，一触即改、不达标不合入。
