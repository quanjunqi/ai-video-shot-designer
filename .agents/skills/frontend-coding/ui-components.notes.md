# UI 组件语义注记（人手维护 · 生成器的输入）

> 本文件是 `.agents/skills/frontend-coding/ui-components.md` 的**语义来源**：
> 结构事实（variants/行数/引用数/token）由 `scripts/ui-inventory.mjs` 从代码抽取，
> **何时用 / 别用 / 反例 / 分类**只能人写——写在这里，由生成器内联进清单。
>
> 格式（每个组件一段，缺段或缺「何时用」→ `npm run ui:check` 红）：
> ```
> ## <组件文件名，不含扩展名>
> - 分类：基础 | 布局 | 导航 | 数据录入 | 数据展示 | 反馈 | 其他
> - 何时用：一句话说明适用场景
> - 别用：一句话说明什么时候该换别的组件
> - 反例：多条用「；」分隔
> - 相关：用「、」分隔的组件名
> ```

## accordion
- 分类：数据展示
- 何时用：同组多条可折叠内容、一次只看一条时（FAQ、分段设置）
- 别用：单条短内容别折叠；折叠用 collapsible；业务零引用（UC-006）
- 反例：关键规则默认折叠藏起来（R7）；把 accordion 当 tabs 做页面主切换（UC-006）
- 相关：collapsible、card、tabs

## alert
- 分类：反馈
- 何时用：页面内常驻的说明或结果块（错误、警告、成功提示）
- 别用：提示用 sonner；确认用alert-dialog；业务零引用（UC-006）
- 反例：失败只写操作失败不透传根因（R4）；危险场景误用 success variant（FE-STYLE-004）
- 相关：sonner、alert-dialog、empty

## alert-dialog
- 分类：反馈
- 何时用：破坏性/不可逆操作的二次确认（删除渠道、模型、项目）
- 别用：普通表单弹窗用 dialog；只提示结果用 sonner，别都做成确认框
- 反例：删除无确认直接执行（清单 1）；确认按钮只写确定不说清后果（UC-004）
- 相关：dialog、sonner、button

## aspect-ratio
- 分类：基础
- 何时用：锁定媒体容器比例（16:9 预览、3:4 立绘）防加载跳动
- 别用：高度自适应的文本块别锁比例；业务零引用（UC-006）
- 反例：用固定 height 代替比例致窄屏变形（3.1 图片比例）；外层不设 overflow-hidden 致图片溢出（R-UI-006）
- 相关：image、card、skeleton

## avatar
- 分类：基础
- 何时用：展示用户或角色小头像，加载失败回退首字母或图标
- 别用：作品封面等大图用 image 配 aspect-ratio，别用 avatar
- 反例：手写 img 拼头像缺 fallback（UC-006）；用 avatar 承载非人物图片（UC-006）
- 相关：image、badge、item

## badge
- 分类：基础
- 何时用：展示简短状态或分类标签（已发布、草稿、失败），不承载操作
- 别用：可点击标签用 toggle；长文案用 item-description
- 反例：用 badge 当按钮点（应换 button、toggle）（UC-006）；长文本不截断撑破卡片（R-UI-006）
- 相关：separator、kbd、item

## breadcrumb
- 分类：导航
- 何时用：展示三级以上页面层级路径，供用户回跳上级
- 别用：一级页面或返回键足够时别加；业务零引用（UC-006）
- 反例：用 breadcrumb 充当主站导航（应换 navigation-menu）（UC-006）；末级当前页做成可点链接（UC-005）
- 相关：navigation-menu、tabs、pagination

## button
- 分类：基础
- 何时用：触发一次明确动作（提交、打开弹窗、删除），页面主要操作入口
- 别用：跳转用 asChild 包 Link；别用 div 手写按钮（UC-006）
- 反例：用 button 做链接导航（该用 asChild + Link）（UC-006）；自写颜色类不走 variant（UC-002）；请求中不禁用致重复提交（FE-API-005）
- 相关：button-group、toggle、spinner

## button-group
- 分类：基础
- 何时用：把 2–3 个同类操作按钮贴合成组（批量删除、视图切换）
- 别用：需要持久选中态用 toggle-group；业务零引用（UC-006）
- 反例：用 button-group 承载互斥选中态（应换 toggle-group）（UC-002）；组内链接按钮不走 asChild（UC-006）
- 相关：button、toggle-group、select

## calendar
- 分类：数据录入
- 何时用：需要日历视图选日期或区间（报表、审计筛选）
- 别用：只需年/月/日三个下拉时用 select；业务零引用（UC-006）
- 反例：calendar 直接铺满表单整行（应包 popover 触发）（R3）；日期区间无预设只能逐个点（UC-006）
- 相关：popover、input、select

## card
- 分类：基础
- 何时用：把一块相关信息（标题、内容、操作）聚合成独立区块
- 别用：纯列表项用 item；仅作留白容器时别套 card（会卡片套卡片）
- 反例：卡片套卡片导致层级混乱（R3）；CardTitle 长文本不截断溢出（R-UI-006）；卡片内 grid 列缺 min-w-0 挤爆（R2）
- 相关：item、separator、empty

## carousel
- 分类：数据展示
- 何时用：横向浏览一组同质媒体或卡片（参考图、模板预览）
- 别用：条目少于一屏时直接铺开；业务零引用（UC-006）
- 反例：用 carousel 藏关键内容只看得到一部分（R7）；轮播无键盘方向键控制（UC-005）
- 相关：card、image、scroll-area

## chart
- 分类：数据展示
- 何时用：用柱/线/饼图展示指标趋势或占比（成本看板）
- 别用：单一数值用文本卡片；业务零引用（UC-006）
- 反例：图表颜色硬编码十六进制不走 token（FE-STYLE-004）；无数据时不显示空态只留白（R-UI-004）
- 相关：card、empty、skeleton

## checkbox
- 分类：数据录入
- 何时用：独立多选、批量选择与全选（配合列表批量删除）
- 别用：互斥单选用 radio-group；即时生效的设置开关用 switch
- 反例：批量列表无全选入口（R-CRUD-001）；用 checkbox 当设置开关状态含义不清（UC-004）
- 相关：radio-group、switch、label

## collapsible
- 分类：布局
- 何时用：折叠次要详情（高级设置、原始 JSON），由用户主动展开
- 别用：关键信息必须默认可见，别折叠（R7）；组内多项互斥折叠用 accordion
- 反例：把生效规则全文默认折叠（R7）；折叠无过渡动画瞬间跳变（R-UI-005）
- 相关：accordion、card、field

## command
- 分类：导航
- 何时用：命令面板或全局搜索（⌘K），带过滤与分组结果
- 别用：二选一的下拉用 select 或 radio-group，别都塞命令面板
- 反例：用 command 替代普通下拉选择多一次交互（UC-006）；把 command 当 tabs 切换页面（UC-006）
- 相关：popover、input、dropdown-menu

## context-menu
- 分类：导航
- 何时用：右键或长按目标弹出的上下文操作菜单
- 别用：没有右键入口的场景用 dropdown-menu；业务零引用（UC-006）
- 反例：只做右键菜单不给可见操作入口（触屏不可达）（UC-005）；菜单内删除项无二次确认（清单 1）
- 相关：dropdown-menu、alert-dialog、item

## dialog
- 分类：反馈
- 何时用：需要用户聚焦完成的模态内容（表单、详情、选择器）
- 别用：只做二次确认用 alert-dialog；大表单用 sheet 或 drawer
- 反例：用 dialog 做破坏性确认（应换 alert-dialog）（UC-006）；缺 DialogTitle 致 a11y 缺失（UC-005）；弹窗内容不滚动致底部按钮不可达（清单 2）
- 相关：alert-dialog、sheet、drawer

## drawer
- 分类：反馈
- 何时用：移动端底部手势抽屉，可下拉关闭（底部操作面板）
- 别用：桌面端侧栏面板用 sheet；业务零引用（UC-006）
- 反例：桌面主流程用 drawer 手势（鼠标不友好）（UC-005）；drawer 内长内容无独立滚动区（清单 2）
- 相关：sheet、dialog、sidebar

## dropdown-menu
- 分类：导航
- 何时用：点击触发的操作集合（行内更多菜单、用户菜单），支持分组与子菜单
- 别用：右键上下文用 context-menu；表单取值用 select
- 反例：用 dropdown-menu 选表单值（应换 select）（UC-006）；危险项不用 destructive 样式易误点（UC-004）
- 相关：context-menu、select、menubar

## empty
- 分类：布局
- 何时用：列表或区域无数据时的空态（图标 + 说明 + 行动按钮）
- 别用：加载中用 skeleton；筛选无结果要区分文案；业务零引用（UC-006）
- 反例：空态只写暂无数据无行动引导（R-UI-004）；加载态与空态混用致误判（R7）；与 common/EmptyState 重复自建（UC-006）
- 相关：skeleton、spinner、table

## field
- 分类：数据录入
- 何时用：不用 react-hook-form 时组织标签、控件、说明与错误的表单行
- 别用：用 react-hook-form 时改 form；业务零引用（UC-006）
- 反例：手写 div 加 label 拼表单行不复用 field（UC-006）；错误态不设 data-invalid 红字不显（UC-004）
- 相关：form、input、label

## form
- 分类：数据录入
- 何时用：用 react-hook-form 的表单，字段用 FormField 包裹
- 别用：字段少时直接 useState 配 field；业务零引用（UC-006）
- 反例：在 FormField 外调用 useFormContext 报错（UC-002）；同一表单混用 store 与 RHF 两套状态（FE-STATE-004）
- 相关：field、input、label

## hover-card
- 分类：反馈
- 何时用：鼠标悬停即预览补充信息（用户卡、模型说明），无需点击
- 别用：触屏无悬停的场景用 popover；业务零引用（UC-006）
- 反例：把必读信息放进 hover-card（触屏键盘不可达）（UC-005）；用 hover-card 装可交互表单（UC-006）
- 相关：popover、tooltip、avatar

## image
- 分类：基础
- 何时用：渲染对象存储白名单内的图片，需 srcSet、质量与格式优化时
- 别用：非白名单或外链图直接用原生 img；业务零引用（UC-006）
- 反例：给白名单外图片套 Image 期待优化（不生效）；不给 width 与 sizes 却依赖 srcSet（选错档位）（R2）
- 相关：aspect-ratio、avatar、skeleton

## input
- 分类：数据录入
- 何时用：单行文本、数字或密码输入，配合 label 使用
- 别用：多行用 textarea；选项多用 select；前缀用 input-group
- 反例：只有 placeholder 没有 label 与 htmlFor（FE-A11Y-002）；错误态不置 aria-invalid（UC-004）；自写输入框替代 input（UC-006）
- 相关：label、textarea、field

## input-group
- 分类：数据录入
- 何时用：输入框需要前缀图标、后缀单位或内嵌按钮时（金额、搜索）
- 别用：普通输入直接用 input；业务零引用（UC-006）
- 反例：绝对定位手写后缀图标（应换 input-group）（UC-006）；内嵌图标按钮缺 aria-label（FE-A11Y-001）
- 相关：input、button、field

## input-otp
- 分类：数据录入
- 何时用：固定位数验证码输入，逐格填写并自动前进
- 别用：任意长度文本用 input；业务零引用（UC-006）
- 反例：用多个独立 input 手写验证码（粘贴退格失效）（UC-006）；OTP 无 label 说明来源（FE-A11Y-002）
- 相关：input、field、form

## item
- 分类：布局
- 何时用：列表中的单条记录行（图标或头像 + 标题 + 描述 + 操作）
- 别用：结构化多列表格用 table；业务零引用（UC-006）
- 反例：每处手写 li 与 flex 拼列表项（应复用 item）（UC-006）；ItemDescription 不截断撑破行（R-UI-006）
- 相关：table、avatar、badge

## kbd
- 分类：基础
- 何时用：标注快捷键（⌘K、Esc），多见于菜单项与 tooltip 内
- 别用：普通按键文字或代码别用 kbd；业务零引用（UC-006）
- 反例：快捷键写在普通 span 里样式不一（UC-006）；把 kbd 做成可点击元素（应换 button）（UC-006）
- 相关：tooltip、command、menubar

## label
- 分类：数据录入
- 何时用：为表单控件提供可点击文字标签，用 htmlFor 关联控件
- 别用：只做视觉说明时用 field-description，避免误关联焦点
- 反例：label 无 htmlFor 仅靠视觉对齐（FE-A11Y-002）；把 label 当区块标题用（应换 field-legend）（UC-005）
- 相关：input、field、form

## menubar
- 分类：导航
- 何时用：桌面应用式菜单栏（文件、编辑、视图），常配快捷键
- 别用：Web 常规操作用 dropdown-menu；业务零引用（UC-006）
- 反例：为两三个按钮套 menubar（应换 dropdown-menu）（UC-006）；快捷键用纯文本未用 MenubarShortcut（UC-005）
- 相关：dropdown-menu、command、kbd

## native-select
- 分类：数据录入
- 何时用：选项少、需要移动端原生选择器或简单表单提交时
- 别用：需要搜索、分组或自定义渲染用 select；业务零引用（UC-006）
- 反例：20 个以上选项仍用 native-select 不可搜索（UC-006）；控件无 label 关联（FE-A11Y-002）
- 相关：select、input、field

## navigation-menu
- 分类：导航
- 何时用：顶部横向主导航，含子菜单浮层（站点级菜单）
- 别用：侧边多级导航用 sidebar；业务零引用（UC-006）
- 反例：用 navigation-menu 做页内 tab 切换（应换 tabs）（UC-006）；子菜单不可键盘操作（UC-005）
- 相关：sidebar、breadcrumb、menubar

## pagination
- 分类：导航
- 何时用：长列表或表格分页，含页码与上一页下一页
- 别用：几十条内的短列表用滚动或筛选；业务零引用（UC-006）
- 反例：分页项用 div 加 onClick 代替 PaginationLink（键盘不可用）（FE-A11Y-002）；当前页缺 aria-current（UC-005）
- 相关：table、select、button

## popover
- 分类：反馈
- 何时用：点击后浮出的轻量面板（筛选、迷你表单、详细说明）
- 别用：一句提示用 tooltip；模态阻塞用 dialog；业务零引用（UC-006）
- 反例：用 popover 装完整表单当弹窗（应换 dialog）（UC-006）；浮层内容不设宽度约束溢出（R2）
- 相关：tooltip、hover-card、dialog

## progress
- 分类：反馈
- 何时用：展示可量化进度的长任务（生成、上传、批量处理）
- 别用：不可量化的等待用 spinner；纯状态标注用 badge
- 反例：无真实进度却写死百分比动画（应换 spinner）（R4）；不显示当前值与总数文案（UC-004）
- 相关：spinner、badge、skeleton

## radio-group
- 分类：数据录入
- 何时用：少量选项互斥单选（2–5 项，需同时看到全部选项）
- 别用：选项超过 5–7 条用 select；业务零引用（UC-006）
- 反例：用 radio 铺 20 个模型选项（应换 select）（UC-006）；无默认选中造成空白占位（R7）
- 相关：checkbox、select、field

## resizable
- 分类：布局
- 何时用：用户需要拖拽调整分栏宽度或高度的编辑器、对比视图
- 别用：固定比例布局用 grid 与 flex；业务零引用（UC-006）
- 反例：用 resizable 做响应式降列（应换 grid 断点）（FE-STYLE-005）；面板内不设独立滚动致底部截断（清单 2）
- 相关：scroll-area、sidebar、card

## scroll-area
- 分类：布局
- 何时用：局部区域需要独立滚动条并保持统一细滚动条风格
- 别用：整页或简单容器用原生滚动；业务零引用（UC-006）
- 反例：多栏整面板不滚动致底部按钮截断（清单 2）；滚动区缺 min-h-0 撑破父容器（R2）
- 相关：resizable、sidebar、table

## select
- 分类：数据录入
- 何时用：从固定选项中单选，选项较多且需受控值（模型、风格、渠道）
- 别用：选项多且需搜索时用 command 配 popover（P0 缺口）
- 反例：SelectTrigger 显式 w-fit 致同行重叠（R2）；用 select 做多选（应换 checkbox）（UC-006）；选项长文本不截断挤出容器（R-UI-006）
- 相关：command、popover、radio-group

## separator
- 分类：基础
- 何时用：分隔同级内容块或菜单分组，表达这里换了一组
- 别用：需要间距时用 gap 或 padding；业务零引用（UC-006）
- 反例：用 separator 替代布局间距（应改 gap 或 padding）（R3）；垂直分隔未设 orientation 高度塌陷（R2）
- 相关：card、item、badge

## sheet
- 分类：反馈
- 何时用：从边侧滑出的辅助面板（详情、设置、移动端菜单），保留上下文
- 别用：需居中聚焦的短表单用 dialog；底部手势抽屉用 drawer
- 反例：用 sheet 承载需全神贯注的长表单（宽度不足）；缺 SheetTitle 与 Description 致 a11y 警告（UC-005）
- 相关：dialog、drawer、sidebar

## sidebar
- 分类：布局
- 何时用：应用级主导航（多级菜单、可折叠图标条），桌面固定移动抽屉
- 别用：页内二级导航用 tabs；业务零引用（UC-006）
- 反例：自写 div 侧栏替代 sidebar（失去移动端适配）（UC-006）；侧栏标题缺 whitespace-nowrap 竖排（R-UI-001）；侧栏内用 grid-cols-3 挤压（R-UI-002）
- 相关：navigation-menu、tabs、breadcrumb

## skeleton
- 分类：基础
- 何时用：已知结构的内容加载占位（列表、卡片首屏），防布局跳动
- 别用：极短加载别闪骨架，按钮内用 spinner；业务零引用（UC-006）
- 反例：用 skeleton 替代空态（无数据也闪骨架）（R-UI-004）；请求失败后永远停在骨架不展示错误（R4）
- 相关：spinner、empty、card

## slider
- 分类：数据录入
- 何时用：在连续区间内粗调数值（强度、阈值、权重）
- 别用：需要精确输入数字用 input；业务零引用（UC-006）
- 反例：用 slider 选值却不回显当前数字（UC-004）；无 aria-label 致读屏不可用（UC-005）
- 相关：input、progress、field

## sonner
- 分类：反馈
- 何时用：操作结果的瞬时反馈（保存成功、复制完成、请求失败）
- 别用：需要用户确认或输入用 alert-dialog；常驻状态用 alert
- 反例：用 toast 代替危险操作确认提示（易错过）（R4）；错误 toast 写死文案不透传根因（R4）
- 相关：alert、alert-dialog、spinner

## spinner
- 分类：基础
- 何时用：局部、无固定结构的等待指示（按钮提交中、小区域刷新）
- 别用：已知结构的首屏加载用 skeleton；业务零引用（UC-006）
- 反例：整页只用 spinner 无文案说明在等什么（UC-008）；spinner 期间按钮不禁用致重复提交（FE-API-005）
- 相关：skeleton、progress、button

## switch
- 分类：数据录入
- 何时用：即时生效的二元设置（启用、停用），点击立即改变状态
- 别用：需提交后才生效的表单字段用 checkbox 加保存按钮
- 反例：切换后不落库不请求致刷新丢失（R-DATA-001）；无 label 只有图形（FE-A11Y-002）
- 相关：checkbox、field、label

## table
- 分类：数据展示
- 何时用：行列对齐的结构化数据展示（审计日志、模型、协议列表）
- 别用：少量卡片式数据用 item 列表；业务零引用（UC-006）
- 反例：长文本列不截断把表格撑宽溢出（R2、R-UI-006）；表格外层缺 min-w-0 挤坏同行控件（R2）；分页排序空态各页手写（应封装 DataTable）（UC-006）
- 相关：pagination、empty、item

## tabs
- 分类：导航
- 何时用：同一页内平级视图切换（规则、版本、任务队列），内容互斥
- 别用：需要同时对比多视图用并排布局；分步流程用向导
- 反例：用 tabs 做路由级页面切换；把关键信息藏进非默认 tab（R7）
- 相关：breadcrumb、navigation-menu、card

## textarea
- 分类：数据录入
- 何时用：多行文本录入（提示词、剧情文本、备注）
- 别用：单行短文本用 input；只读长文本用普通段落
- 反例：用 input 装长提示词致横向滚动（UC-006）；固定 rows 过小且不可自适应（UC-004）
- 相关：input、field、label

## toggle
- 分类：数据录入
- 何时用：单一开关态的工具按钮（加粗、收藏、仅看未读），点击即切换
- 别用：开关用switch；多选用toggle-group；业务零引用（UC-006）
- 反例：用 toggle 当无状态普通按钮（UC-002）；纯图标 toggle 缺 title 或 aria-label（FE-A11Y-001）
- 相关：toggle-group、switch、button

## toggle-group
- 分类：数据录入
- 何时用：一组小图标按钮表示当前生效的视图或格式（互斥或多选）
- 别用：一次性动作用 button-group；业务零引用（UC-006）
- 反例：用 toggle-group 承载提交动作（应换 button）（UC-006）；纯图标项缺 title 或 aria-label（FE-A11Y-001）
- 相关：toggle、button-group、tabs

## tooltip
- 分类：反馈
- 何时用：为图标按钮或缩写补充一句短说明或快捷键提示
- 别用：内容多行或需交互时用 popover（tooltip 不可交互）
- 反例：把必读长文案塞进 tooltip（移动端触发不到）（UC-005）；用 tooltip 替代 label 标注表单（FE-A11Y-002）
- 相关：popover、kbd、button
