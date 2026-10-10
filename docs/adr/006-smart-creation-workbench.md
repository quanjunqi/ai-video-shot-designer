# ADR-006：智能创作（三工作台）信息架构与参数面板重设计

- **状态**：提议（待 Owner 确认 §7 的 D1/D3/D4/D8）
- **日期**：2026-10-10
- **相关**：`docs/BACKLOG.md` P0 #2、ADR-003（模型路由层）、ADR-004（中转站与供给池）、`docs/DESIGN.md` §3.4、`docs/TECHNICAL_ARCHITECTURE.md`、`docs/FRONTEND_QUALITY_GATE.md`
- **分支**：`feat/create-workbench-2026-10-10`

---

## 1. 为什么现在做：启动条件的逐条核对

`docs/BACKLOG.md` 把「智能创造三工作台 UI 重构」列为 P0 暂缓项 #2，暂缓理由与启动条件写得很明确：

> **为什么暂缓**：参数表单应由**协议模板**生成，否则改模型就要改前端 —— 依赖底座
> **启动条件**：能力层补全（`capabilities` 用于生成表单与前置校验）
> **现状证据**：`genworkbench/` 仅 2 个组件 + 3 个近乎重复的页面

本次改造前，先逐条核对启动条件是否已满足（**这是本 ADR 的准入依据，不是背景铺垫**）：

| 启动条件要素 | 状态 | 实测证据 |
|---|---|---|
| 模型能力可被前端读取 | ✅ **已具备，无需后端改动** | `model_catalog.capability` JSONB 已在目录响应中返回（`services/production/internal/catalog/postgres.go:35`）；前端 `useSettingsStore.models[].capability` 已持有该字段 |
| 能力查询端点（合并模型 + 模板能力） | ✅ **已存在** | `GET /internal/v1/catalog/models/{id}/capabilities`（`services/production/internal/httpapi/handler.go:143` 注册、`:435` 实现：合并 `model.capability` 与 `protocol_templates.capabilities`，并导出 `supported_modes`） |
| 该端点前端可达 | ✅ **可达，无需 BFF 改动** | BFF `catalogProxy` 泛化转发 `/api/v1/catalog/*` → `/internal/v1/catalog/*`（`services/web-bff/cmd/server/main.go:358-404`，允许 GET/POST/PUT/DELETE） |
| 协议模板能力声明完整度 | ⚠️ **仅 2/9** | `services/production/migrations/021_protocol_capabilities.sql` 只为 `pt_builtin_openai_img`、`pt_builtin_openai` 写入 `capabilities`；其余 7 个内置模板仍是 `{}` |
| 真实执行链路已闭环 | ✅ 已闭环 | `docs/DESIGN.md` 记录 execution 装配引擎已打通真实 HTTP（渠道 → 装配 → 上游 200 → 响应映射提取） |
| 前端是否消费以上能力 | ❌ **完全没有** | `apps/web` 全仓 `capabilities` 关键字命中 **0**；`GenWorkbench.tsx` 对 `useSettingsStore` / `MODEL_CATALOG` / `capability` 的引用命中 **0** |

**结论**：底座条件**基本满足，可以启动**。但第四条决定了设计红线：

> **「参数表单完全由 `capabilities` 生成」当前不可行**（7/9 模板无声明，会渲染出空表单）。
> 必须做成 **能力优先 + 有据可依的降级**，而不是单一数据源。

---

## 2. 现状证据：智能创作页面到底坏在哪

改造前的事实（全部可在源码中复核，不引用任何演示文案）：

### 2.1 三层目录已经建成，生成页面却完全不用它

平台已建立「渠道 → 协议模板 → 模型（能力/计费）」三层目录，但：

| 事实 | 证据 |
|---|---|
| 参数面板来自**每页硬编码数组**，不是目录 | `CreateImage.tsx` / `CreateVideo.tsx` / `CreateAudio.tsx` 各 20–22 行，`params` 里写死 `options: ['SDXL','Flux','MJ-V6']`、`['官方 API','合规中转 API']` |
| 目录里根本没有 SDXL / Flux / MJ-V6 / 官方 API | 内置模型是 `nano-banana-2-lite` / `gpt-image-2` / `Seedance 2.0/2.5` / `MiniMax H3` / `Kling 1.6`…；「线路」在目录里的对应物是**渠道**（即梦/MiniMax/Grsai/Google/OpenAI/ComfyUI） |
| 改模型必须改前端（正是 BACKLOG #2 要消灭的问题） | 同上：模型名与比例/时长/帧率选项全部写在页面里 |
| **能力/计费层只被设置页消费，从未到达创作者** | `aspectRatioCount`/`qualityTiers`/`maxRefImages`/`perSecondStart`/`perImage`/`maxDurationSeconds` 在 `apps/web/src` 的消费点：`pages/SettingsModels.tsx` 18 处、`config/rules/capacity-policy.ts` 2 处、**`components/common/GenWorkbench.tsx` 0 处** |
| 费用是写死的字符串 | `unitCost="¥0.06"` / `"¥0.18"` / `"¥0.04"` 作为 prop 传入，与 `billing.perImage` / `billing.perSecondStart` 无计算关系；`count` 变化时预估费用不更新 |

### 2.2 生成结果是死胡同

| 事实 | 证据 |
|---|---|
| 结果图是占位图，不是真实产物 | `GenWorkbench.tsx:277` `placeholderUrl(\`gen-${j.id}\`)` —— 任何「成功」任务都渲染一张程序生成的占位图 |
| 成功产物不落资产库、不能被其他产品线引用 | `lib/jobRegistry.ts` 的回调注册者只有 `features/comic/ProductionStage.tsx`（video）与 `hooks/useInterpretFlow.ts`（interpret）；**智能创作三页注册数为 0** |
| 与已确认的产品契约冲突 | `docs/TECHNICAL_ARCHITECTURE.md`：`独立无限画布/智能创作 → 候选素材`，且「执行结果归 Asset」；`docs/DESIGN.md` §3.3 要求"画布结果可以作为候选资产提交漫剧审核"。当前智能创作的产出**既不进资产库，也不进漫剧候选** |
| 顺带暴露一个结构问题 | `types/index.ts:660` `Asset.projectId`/`episodeId` **为必填**，没有"无项目归属的个人素材"的位置，所以"结果进资产库"需要先决定归属模型（见 D4） |
| 结果操作是假的 | 下载按钮 `toast.success('演示：已加入下载队列')`；试听按钮 `toast.info('演示：试听占位，无真实音频')` |

### 2.3 创作者的日常动作全部缺失

| 缺失 | 后果 | 证据 |
|---|---|---|
| 草稿不持久化 | 刷新/切走即丢失提示词与参数 | `GenWorkbench.tsx:71` `values` 为组件内 `useState` |
| 无「复用参数再生成」 | 看到满意的历史结果无法回填参数继续迭代 | 历史卡片只有下载/试听两个按钮 |
| 无结果详情/元数据 | 看不到模型、渠道、参数快照，无法复盘 | 卡片仅显示 label/status/cost |
| 失败原因不展示 | 卡片只显示「失败」两字，`ServerTask.error` 未被渲染 | `GenWorkbench.tsx:279` |
| 无提示词辅助、无风格/镜头语言预设 | 平台**已有**风格库（`useStyleStore`，含 `prompt` 字段）与镜头语言库（`useLensStore`），在智能创作页引用数为 **0** | `grep useStyleStore/useLensStore` 命中 comic 各阶段 + 风格库页 + 镜头语言库页，**不含智能创作** |
| 无取消/重试/删除 | 提交错了只能去任务中心处理 | `GenWorkbench` 只用 `createTask`/`listTasks`，未调用 `cancelTask`/`retryTask`（`Tasks.tsx` 才有） |
| 无生成方式切换 | 目录已声明 `modes: ['t2v','i2v','first_last_frame','multi_ref','audio_ref']`、图片 `refImage: true`，页面只有「文生」一种入口 | `capability.modes` 在 `GenWorkbench` 消费点数 = 0 |
| 无参考图上限校验 | `maxRefImages: 1`（MiniMax H3）与 `9`（Seedance 2.0）在 UI 上无差别，超限只在执行期失败 | `ReferenceBar` 不接收上限 |
| 无键盘提交 | 主流产品的 `⌘/Ctrl+Enter` 缺失 | 全文件无 keydown 处理 |
| 轮询与加载态粗糙 | 固定 2000ms 轮询、无退避、无视页面可见性 | `GenWorkbench.tsx:92` |
| 会产生"不该出现的控件" | `DESIGN.md` §3.4 要求"不展示不可用控件"，但参数数组与所选模型无关 | 参数数组为静态字面量 |

### 2.4 三个页面近乎重复（BACKLOG #2 的原话）

三页各自维护一份 `params` 数组、一份 `unitCost`，共用同一个 `GenWorkbench`。差异本应是**能力差异**（图片有比例/张数、视频有时长/首尾帧、音频有音色），现在却编码成了三份互不相关的字面量。

---

## 3. 对标：主流产品是怎么设计的

### 3.1 方法与可信度声明（先读这段）

国内 C 端生成页**几乎全是 JS 渲染**：即梦 / 可灵 / LibLib / 海螺 / 通义万相 / Vidu / 堆友的官网首页
抓回来只有 19–334 字符骨架。因此本节的「界面事实」只采信三类来源：

1. **大厂官方文档**（可信度最高）：可灵能力地图、定价表、并发规则；Vidu 开发者文档
2. **带截图的中文实测横评**（优设、爱范儿、雷科技、新榜等）
3. **官方规则/定价页**

**严格区分「API 能证明能力存在」与「它出现在首屏」** —— 二者不可混用。
未能核实的界面细节集中在报告 §14.6 列出（共 10 类），**不作为本 ADR 的决策依据**。
完整拆解见 [`docs/research/chinese-ai-gen-ux-teardown-2026-10.md`](../research/chinese-ai-gen-ux-teardown-2026-10.md)（501 行、55 条来源链接）。

### 3.2 七个反复出现的范式（附采用者）

| 范式 | 内容 | 采用者（证据来源） |
|---|---|---|
| **A 布局** | **左右两栏（左输入/参数、右结果）仍是主流**，但**正在向「单一输入区 + 内联胶囊 + `@` 引用」收敛** | 左右：可灵、即梦（[优设横评](https://www.uisdc.com/ai-video-14)）、PixVerse（[优设](https://www.uisdc.com/pixverse-magic-brush)）、无界、堆友（左参数/中预览/右灵感库+历史）；收敛：可灵 O1「下方的提示词输入框位置集成了非常多的选项…上方的几个胶囊按钮主要用来控制输入内容的类型」（[优设](https://www.uisdc.com/kling-o1-2)）、Vidu `@` 唤起（[爱范儿](https://www.ifanr.com/1653577)）、Sora 底部输入 |
| **B 能力矩阵** | 官方把「模型 × 能力」标注为**支持 / 不支持 / 条件支持**三态，而不是让用户试错 | 可灵官方能力地图：首尾帧一行 3.0 Turbo **不支持**、3.0 支持、2.6「仅 1080P 且仅无声视频」（[可灵能力地图](https://klingai.com/document-api/guides/capability-map/video.md)） |
| **C 比例选择** | **语义化可视化预设**，并出现 `auto`（按参考图自动） | 无界 6 预设：1:1 头像图 / 1:2 手机屏幕 / 4:3 文章配图 / 3:4 社交媒体 / 16:9 电脑壁纸 / 9:16 宣传海报；可灵 API 比例 8 档含 21:9，O1/3.0 Omni 支持 `auto`（[可灵图片能力地图](https://klingai.com/document-api/guides/capability-map/image.md)）；Vidu `aspect_ratio` 支持 `auto` |
| **D 生成数量** | 有明确**默认值与上限**，且参与成本/并发计算 | 无界默认 **4**、可选 1–20、结果区一屏 5 张；可灵图片 `n` 值**即并发占用数**（n=9 → 占 9 并发，[并发规则](https://klingai.com/document-api/api/get-started/concurrency-rules.md)） |
| **E 复刻优先于重抽** | 结果详情暴露**种子/全部参数/原始参考图**，并能一键「做同款」；局部编辑优于重新抽卡 | PixVerse 作品详情（关键词/种子/纵横比/运动幅度/风格/原始图 + Go Create）、堆友「同款拓展」、星流「做同款 + 查看回放」、Liblib「改的是局部，不是从头再抽四张让你赌」 |
| **F 主体 = 一等资产** | 主体**可命名、可复用、可多图、可跨任务**，且在生成页一级可 `@`；支持**多主体叠加** | 可灵「我的主体」（多角度图建主体、可叠加）、Vidu 主体社区（8 大类、上传 1–3 图、API 上限 7 个主体、`[@name]` 引用）、即梦首页一级导航即「资产/主体」、吐司一级入口「参考创作」 |
| **G 积分可见性** | **生成前可见 + 失败退回 + 明细可查** | 可灵：1 元 = 10 灵感值、**生成时即扣、失败退回**、明细有明确导航（[灵感值规则](https://klingai.com/docs/point-policy)）；MOKI：生成前弹窗告知总消耗（30 镜 × 4 积分 = 120）；即梦：**模型档位即标价**（Seedance 2.0 VIP = 495 积分/条） |

### 3.3 明确的分歧点（没有唯一正确答案，需要我们自己定）

| 争点 | A 阵营 | B 阵营 |
|---|---|---|
| 首屏放什么 | 参数表单优先（无界、堆友、通义万相） | 作品流/对话优先（即梦首页已变「你好，今天想要创作什么?」+ 作品流、PixVerse 热门作品） |
| 参数放哪 | 常驻侧栏全展开（堆友、无界） | 折叠/内联（可灵 O1 输入框内嵌 + 胶囊） |
| 负面提示词 | 独立输入框（无界、堆友、通义万相） | **不存在**（可灵 API 无 `negative prompt` 字段；Vidu API 全链路无该字段） |
| 模型选择时机 | 一开始就选（即梦、可灵、Liblib、堆友） | 推迟到最后（OiiOii 到分镜那一步才确认模型） |
| 排队 | 用会员等级买优先级（可灵「专享快速生成通道」、即梦 VIP 通道） | 用折扣换等待（Vidu `off_peak`：积分更低、48h 内出、可取消、失败返还） |
| 镜头/运动控制 | 结构化参数（Vidu `movement_amplitude` = auto/small/medium/large；PixVerse 运动笔刷） | 语言化/引用化（可灵多镜头靠 `镜头 n, m, words;` 语法；Vidu `@镜头库`） |

### 3.4 反面教材（对我们最有价值的部分）

| 反面教材 | 事实 | 对我们的约束 |
|---|---|---|
| **静默降级模型版本** | 可灵选中「多模态编辑」后会**变为可灵 1.6 模型**处理，结果受影响（[优设](https://www.uisdc.com/ai-video-26)） | **绝不允许静默换模型**；模型变化必须可见（呼应 D2：能力差异要显式声明） |
| **聚合层参数面不统一** | Liblib 只有可灵 3.0 Omni「明确支持选择生成尺寸」（[新榜](https://voice.newrank.cn/study/hot/CA22D5C5433A9F69)） | 聚合平台的价值必须靠「统一能力抽象 + 统一参数面 + 低于原厂价格」三者同时成立；我们的 Catalog/协议模板正是为此而建 |
| **黑盒扣费** | 黑猫投诉标题：「LibTV 平台 Agent **黑盒未明码标价**扣费，服务不可用申请全额退款」；OiiOii「全程不显示规格与积分」 | 必须在**每一步**显示积分预估（呼应 D2 的费用预估与 D6 的模型档位标价） |
| **结果 URL 短命** | 可灵生成的图片/视频**30 天后被清理**；Vidu 结果 24 小时过期 | 「生成成功但图打不开」是必然结果 —— 强力支撑 `BACKLOG.md` #4（产物落盘 MinIO）应尽早做，也说明 D4「本地结果库」只是过渡 |
| **平台停运** | 文心一格 2025-04-01 并入文心一言，2026-07-26 再迁百度文心，原域名 302 到迁移指引页 | 多模型聚合的长期性风险；也说明**目录/协议必须是可替换的配置**而不是写死的代码 |
| **时长上限是成本放大器** | 海螺 Hailuo 2.3 一次最长 6s，要 15s 得生成三次 | `maxDurationSeconds` 必须来自模型能力（我们已有），且要影响费用预估（D2） |

### 3.5 国际产品：问题相同，做法更激进

> **覆盖率与限制**：国际站的正文抓取受出口 IP 拦截限制（Cloudflare/Akamai 403、JS challenge），
> 因此**只采信实际抓到正文的官方文档**：完整覆盖 **Midjourney、Runway、Krea、Recraft、
> ChatGPT Images、Higgsfield**；Adobe Firefly 仅信息架构级；
> **Sora / Pika / Leonardo / Ideogram / Freepik / Luma / Playground / Google Flow 本轮完全未覆盖**（不编造）。

**主流共识（国际）**：

| 共识 | 证据 |
|---|---|
| **参数内联进 prompt 区，取代左侧长参数栏** | Midjourney 的 **prompt pills**（version/sref/moodboard pill + `+N more` 折叠，hover 解释每个 flag，右键 context menu）；Krea 图像模式 = 底部 prompt + 左下模型选择器；Runway 生成面板底部模型下拉；Recraft 左栏生成 + 右栏改图 |
| **参数三层可见性** | Runway：常驻 `Aspect Ratio` + `Duration` → **Advanced 里放 FPS** → **输出格式（ProRes/PNG）在生成时选择且 +5 credits/秒**（证据直接支持 D1 的"常驻 3–4 个 + 高级浮层"，并提示存在第三层"生成时锁定"） |
| **参考图是"有角色的挂载点"，不是单一上传框** | Midjourney 拖拽图片为**每种 reference role 打开独立 drop target**、Omni-Reference 强度滑块（`--ow` 0–1000，默认 100）、视频模式 Start/End Frame 也是可接收拖放的 pill；Runway 拖放到 prompt window；Recraft 文档有 "Attaching references" 专章 |
| **结果 → 下一轮输入的闭环是一等动作** | **Runway 的「Use」菜单**最完整：Use as Character / Retime（**不耗 credits**）/ Expand / **Use Current Frame（当前帧载回为图像输入）**/ Upscale to 4K；Recraft 把 "**bring back the prompt and settings behind any image**" 当卖点；**Midjourney 提交后保留 pills 与参考图、只清空文本** |
| **能力冲突必须显式报错，不静默处理** | Midjourney：`--tile` 与附图冲突时**明确告知不兼容**；受限账号改为 **dimmed controls + 说明 + Appeal 按钮** |
| **失败要有 SLA** | Midjourney："**stalled submits fail cleanly within 2 minutes**" |
| **生成是非阻塞作业** | ChatGPT Images 生成不阻塞对话；结果自动进侧栏 Images 库 |
| **成本分化为模型级 / 时长级 / 分辨率级** | Runway 分模型 per-second 计价（Gen-4 12 / Turbo 5 / Gen-4.5 12 credits 每秒）；Higgsfield 按「模型 × 分辨率档」定价，**quality toggle 改分辨率时价格实时更新** |
| **并发上限公开** | Higgsfield：视频 **1 路**、图像 **2 路**；Unlimited 走标准队列、credits 走优先队列 |

**两个值得单独记下的做法**：

1. **Higgsfield 把"计费模式"做成生成面板里的一个开关**（Unlimited toggle；关掉即 Credit Mode →
   走优先队列）。这说明**成本模式本身可以是 composer 里的控件**，而不是躲在账户页里。
2. **Midjourney Thinking Mode（2026-10）**：生成后**自动诊断 prompt 未命中处**（错物体/布局/结构/文字）
   再重跑 —— 「生成 → 自检 → 重生成」成为新范式，可用于后续的"提示词质量诊断"。

**国际侧的分歧**（与国内一致地没有唯一答案）：

| 分歧 | 路线 A | 路线 B |
|---|---|---|
| 入口形态 | 工作台/控制台（Midjourney Create、Runway、Krea、Recraft） | 对话式（ChatGPT Images） |
| 模型选择 | 下拉/搜索（Runway 面板底部下拉 + Apps View 搜索） | **胶囊即模型**（Midjourney 删 version pill 即换模型）／**无选择器**（ChatGPT 只按套餐分档） |
| 批量语义 | 模式决定（Midjourney Draft 固定 24 图网格） | 模态决定（Krea：图 2–4 张/次、视频 1 段/次） |
| 多模型集成 | 平台自研为主 | **第三方 marketplace**（Firefly 把 FLUX / Gemini / GPT Image / Imagen / Ideogram / Runway 各做成一页） |
| 队列商业化 | 买断走标准队列 + credits 走优先队列（Higgsfield） | 未核实到其他产品的队列分层表述 |

**可直接引用的官方自曝缺陷（Midjourney changelog，罕见的官方来源）**：

- 输入卡顿：「lag across the site: **prompt input typing, settings sliders**, and the slowdown after scrolling deep into your gallery」
- **设置不持久**：「Settings now stick: values no longer reset on their own」→ 直接支持本 ADR 的 D6 草稿持久化
- 提交卡死、快捷键在弹窗下误触
- 语义不清：moodboard 卡片 copy/select 行为不符；`+N more` pill 点击后才正确应用
- 错误文案不准：受限用户此前只看到 moderator error → 改为 dimmed controls + 解释 + Appeal

**对我们的两条纠正性启示**：

- **「不展示不可用控件」要区分两种情形**：**能力不匹配**（该模型不支持图生图）→ **不渲染**；
  **权限/账号受限** → **置灰 + 说明原因 + 申诉入口**（Midjourney 的做法）。
  一刀切"隐藏"会让用户不知道自己缺什么。本 ADR 的 D2(b) 只覆盖了第一种，第二种在实现时一并处理。
- **ChatGPT Images 的反面**：**删除一张图必须删整个会话**（库内无单图删除）→ 我们的结果库必须支持**单条删除**。

### 3.6 专业工具

> **覆盖率**：ComfyUI（含 APP mode / Cloud 并发）、fal.ai、Replicate、InvokeAI、A1111 WebUI、
> SwarmUI、Fooocus、Krita AI Diffusion、Forge / reForge、ThinkDiffusion / RunDiffusion、
> Topaz（Gigapixel / Photo）、Magnific、Upscayl、Civitai 元数据、W&B。
> 完整事实卡（7 维度 × 15 工具 + 12 条横向模式 + 反模式表 + 57 条来源）见
> [`docs/research/pro-tools-generation-workbench-ux-2026-10.md`](../research/pro-tools-generation-workbench-ux-2026-10.md)；
> 该报告同样列了 8 条「未核实」。

这类「超能力用户」工具的价值不在于照抄界面（它们多数对创意用户过于专家化），
而在于**把工程细节想清楚了**，正好补上我们缺的那部分：

**对本 ADR 影响最大的五条**：

1. **参数表单应当由 schema 生成，并且表单只是 schema 的一个视图**（P3）
   fal.ai 的 Playground 表单**由模型 input schema 自动生成**，同一份值可在
   **Form / JSON / Python / JS / cURL** 之间切换，API tab 展示完整 input/output schema 与类型
   （[fal Playground](https://fal.ai/docs/documentation/model-apis/playground)）；
   A1111 的 `PasteField` 把每个 UI 组件映射到 API 字段名，**同一张参数表同时服务 UI、PNG info 与 API**。
   → 直接印证 D2：`Catalog.capabilities` 应是唯一参数事实源，**表单/JSON/元数据都是它的投影**。
2. **「取消」必须区分状态，并且与计费口径绑定**（P6）
   fal 定义得最清楚：`IN_QUEUE` 取消=**立即移除、永不执行**；`IN_PROGRESS` 取消=**只发信号，"may still
   complete if the app does not handle cancellation"**（[fal Queue](https://fal.ai/docs/documentation/model-apis/inference/queue)）；
   Replicate：`aborted`（从未开始）**不计费**，`canceled`（已开始）**按已运行时间计费**
   （[Replicate Lifecycle](https://replicate.com/docs/topics/predictions/lifecycle)）。
   → 新增 **D10**。
3. **「沿用设置」与「沿用全部」必须是两个不同的按钮**（P8）
   InvokeAI 的右键菜单同时提供 `Remix Image`（载入全部设置**但不含 seed**）与 `Use All`，
   另有 `Use Prompt` / `Use Seed` / `Send to Image to Image` / `Send to Unified Canvas`
   （[InvokeAI Gallery](https://invoke.ai/features/gallery/)）；A1111 的 img2img 甚至可勾选
   "Parameters to take from png info"（Prompt/Negative/Seed/CFG/Sampler/Steps/Model hash）。
   → 并入 D6：**「换 seed 重跑」与「完全照抄」是两种意图，不能合成一个按钮**。
4. **生成元数据要随产物走，并且能"再注入"**（P7）
   A1111 写 PNG tEXt 参数块 + `PNG Info` 页；ComfyUI 把 `workflow` 与 `prompt` 两个 JSON 写进
   PNG tEXt / 动画 WebP EXIF / MP4·WebM 容器 tag / safetensors；Civitai 写 `copyMetadata`
   专门解决"缩放/转码静默丢元数据"，并警告**"三个不同的东西都叫 workflow"**
   （[ComfyUI Workflow Metadata](https://docs.comfy.org/development/api-development/workflow-metadata)）。
   → 反向约束：**任何"元数据只在数据库、不随文件走"的架构，会在导出、转发、二次编辑时断链**。
   并入 D4/D6：结果库要存参数快照（与 execution「锁定计划」一致），并把"元数据随产物"作为
   落盘（BACKLOG #4）与媒体处理（#6）的设计前提。
5. **"并发额度"与"积分余额"是两件事**（P11）
   Comfy Cloud 专门用 FAQ 解释这个混淆：**Partner Node 并发（按终身付费分档）与 Cloud job 并发是
   两套独立限制**，"有效吞吐受先到者约束"（[ComfyUI Partner Node 并发](https://docs.comfy.org/tutorials/partner-nodes/concurrency-limits)）；
   fal 的并发随充值提升（新号 2 → 自助上限 40），且**排队时间与服务端 5xx 不计费**
   （[fal Pricing](https://fal.ai/docs/documentation/model-apis/pricing)）。
   → 新增 §7 待确认问题 10。

**值得借鉴但排在后面的**：队列即工作区（分段 + 位置 + 逐项取消 + 暂停/恢复 + 全部清空 + 保留原参数重试）；
三种超时分离（`start_timeout` / `request_timeout` / `client_timeout`）；seed 做成**策略枚举**
（固定 / 随机 / 递增 / 微调 ±N / 沿用父任务）而不是裸数字框；**比较视图**（同一提示词跑 N 个模型并排 +
可配置"轴"的网格）；意图命名动作（Krita：strength<100% 时按钮从 `Generate` 变 `Refine`，
有选区且 100% 时变 `Fill`）。

**明确不要抄的（过于专家化）**：节点图编辑器作为默认视图（我们已有无限画布，智能创作只给"模板 + 表单"）；
30+ 参数全平铺；显存/精度/卸载开关（云网关里对用户无意义，改暴露"质量/速度/成本"三档）；
文本 DSL（`BREAK`/`ADDROW`/`[a:b:0.5]`/`<random:>`）；原始 XY/Z 三轴网格与 `1-10 [5]` 区间语法；
自定义 Python 与依赖安装；多后端/GPU ID 选择；默认展开的 runner 日志。

**反模式（专业人士真正抱怨的，可直接引为设计红线）**：

| 反模式 | 证据 |
|---|---|
| 把关键队列操作藏进二级菜单 | ComfyUI `Clear All Queue` 被移进 `view job history` 引发 issue |
| **同一个"取消"按钮对不同状态调同一 API → 部分状态静默失败** | ComfyUI PR #7788：pending 取消无声失败，只在日志写原因 |
| 停止批处理产生不完整/尺寸错误的产物且无提示 | Upscayl FAQ："just wait" |
| UI 被内置扩展塞满 | reForge 把内置扩展拆出主仓库，原文 "the UI got really cluttered" |
| **同一概念多个名字** | Civitai 警告"三个不同的东西都叫 workflow" |
| 封闭式 allowlist 静默丢扩展参数 | Civitai 因此选 denylist |
| 重编码/缩放静默丢元数据 | Civitai `copyMetadata` 的存在理由 |
| 兼容性靠口口相传 | Regional Prompter 需要 ○/△/× 支持表；Forge 需要逐组件 Status 表 |
| **成本不透明 / 不前置** | 反例正解：fal 成本三色徽章、Comfy 节点价格徽章 |
| 冷启动无提示 | Replicate 必须用文档解释"有时要几分钟" |
| **取消后仍计费/仍产出却不告知** | fal `IN_PROGRESS` 取消 "may still complete"；Replicate canceled 仍按已运行时间计费 |
| 平台更新默认值后与用户自定义配置冲突 | ThinkDiffusion 需删自定义 `config.json` 才能拿到新默认 |

其中**第 2 条与第 11 条直接命中我们当前的实现**：`services/execution/internal/job/store.go:143`
的 `Cancel` 对 `queued` 与 `running` 用**同一条 SQL**（`status IN ('queued','running')`）处理，
前端 `Tasks.tsx` 也用同一个按钮调用同一个 `cancelTask`；并且**全仓不存在积分账本**
（`grep -rln "credits|ledger|wallet|balance" services/*/internal services/*/migrations` 命中为 0，
`cost_estimate` 目前只是展示用字符串）→ 因此"失败退回 / 明细可查"（范式 G）**当前无法实现**，需登记底座缺口。


### 3.7 结论：我们的差距与差异化机会

**已具备但没被用起来的**（这正是 §2 的诊断）：

- 我们的 `model_catalog.capability` + `protocol_templates.capabilities` **在结构上就是范式 B 的答案**，
  甚至比可灵的能力地图更适合做 UI 契约（有 `modes` / `maxRefImages` / `maxDurationSeconds` / `billing` 的结构化字段），
  但前端消费数为 **0**。→ 本 ADR 的 D2 就是把它变成 UI 契约。
- 我们已有**项目级角色库**（ADR-002）与**镜头语言库**、**风格库** —— 这正对应范式 F 与 Vidu 的
  `@镜头库`（报告称之为「最值得抄的一招」），但**在智能创作页的引用数为 0**。→ D7。

**最值得做的三件事**：① 能力当 UI 契约（范式 B）；② 主体/风格/镜头语言一级可 `@` 复用（范式 F）；
③ 积分可见性三件套（范式 G：模型档位标价 + 批量前确认总额 + 失败退回/明细可查）。

### 3.8 证据 → 决策：逐条映射

| 证据（来源） | 对本项目的直接影响 |
|---|---|
| 堆友三栏：**左=模型+描述、中=预览、右=灵感库与创作历史**（[淘江湖](https://jianghu.taobao.com/detail/19078099)） | 支持 D1 保留"历史/预设"的独立位置，但**不作为主视觉** |
| 无界：生成数量**默认 4**、可选 1–20、结果区一屏 5 张（[AIGC.cn](https://www.aigc.cn/57690.html)）；通义万相/即梦「一次生成 4 张消耗 1 额度」 | 我们把 `count` 默认设为 **1** 可能偏保守 → 见 §7 待确认问题 7 |
| 堆友联动校验：「**如果上传了参考图，生成图片比例需与参考图一致**」 | D2 的前置校验应包含**跨字段一致性**（参考图 × 比例），不只单字段范围 |
| 通义万相结果操作含「下载原图 / 再次生成 / **复用创意**」（[CSDN，降级采信](https://blog.csdn.net/weixin_41080437/article/details/149721480)） | D6「复用参数」有直接先例；我们的结果卡必须有此操作 |
| 即梦实测流程「输入提示词后**回车**等待图片生成」（[CSDN](https://blog.csdn.net/2501_94117113/article/details/155308168)） | D6 的提交快捷键：国内主流是**回车提交**，`⌘/Ctrl+Enter` 是国际习惯 → 两者都支持 |
| MOKI：点「生成视频」后**弹窗告知要消耗多少积分**（30 镜 × 4 = 120）（[CSDN](https://blog.csdn.net/m0_56144365/article/details/143356820)） | D2 费用预估之外，**批量提交前必须总额确认**（本项目的分镜级批量正是这种场景） |
| 可灵能力地图的**「条件支持」**（如「仅 1080P 且仅无声视频」）（[可灵](https://klingai.com/document-api/guides/capability-map/video.md)） | **我们的 `capability` 目前只能表达"支持/不支持"，无法表达"条件支持"** → 新增缺口，见 §7 问题 8 |
| Vidu 主体上限 7 个、可灵多主体叠加、`@镜头库`（[爱范儿](https://www.ifanr.com/1653577)） | 强化 D7：`@` 引用应是**多主体叠加**，且镜头语言库要做成可 `@` 词条 |
| 可灵多镜头靠 `镜头 n, m, words;` 语法且**各分镜时长之和必须等于总时长** | 与漫剧分镜的天然形状一致；可作为后续「镜头语言库 → 提示词」的结构化模板 |
| SkyReels 左侧边栏 + 右侧主区（AI 视频/AI 短剧），工具含**小说转剧本/TTS/故事板**（[优设](https://www.uisdc.com/skyreels-v1)） | 同构参考：本项目把"剧本→分镜→视频"放在工坊，把单模态生成放在智能创作 —— 边界是对的 |

---

## 4. 目标

1. **参数面板由模型目录能力驱动** → 换模型 / 改目录不需要改前端（兑现 BACKLOG #2 的启动条件）
2. 创作者在**一个页面**内完成：写提示词 → 调参 → 生成 → 看结果 → 复用迭代 → 落资产
3. 三个工作台共用一套类型化工作台组件，差异来自**能力**而不是三份字面量
4. 生成前可预知代价（费用、时长上限、参考图上限），生成后可复盘（元数据）
5. 视觉与交互达到 `docs/FRONTEND_QUALITY_GATE.md` 的品质标准（Awwwards 级）

---

## 5. 非目标

- ❌ 不改服务边界、不新增/删除微服务（AGENTS.md §7）
- ❌ 不修改 `model_catalog.capability` 的现有字段语义（只做**追加**式扩展，且单独任务卡）
- ❌ 不重做任务中心（`/tasks` 保持"跨类型任务列表"的职责）
- ❌ 不动无限画布与漫剧工坊
- ❌ 不接真实产物落盘（依赖 BACKLOG #4 的 MinIO 落盘）
- ❌ 不引入新的 UI 依赖库（沿用 Radix + Tailwind + 既有 `components/ui/`）

---

## 6. 设计决策

### D1 · 布局：保留「左输入 / 右结果」两栏骨架，把参数栏收敛为输入区内的胶囊

> **本节按 §3 的证据修正过一次**：我最初的提议是「结果主舞台 + 底部 composer」（Sora 形态）。
> 证据不支持这个方向 —— 国内主流是**左右两栏**（可灵、即梦、PixVerse、无界、堆友），
> 底部输入是 Sora 的少数派做法。**真正的趋势不是换骨架，而是把参数从侧栏收进输入区**
> （可灵 O1「下方的提示词输入框位置集成了非常多的选项…上方的几个胶囊按钮主要用来控制输入内容的类型」；
> 星流「复杂的选项栏真没有」）。因此决策改为：**保留两栏，重做左栏的形态。**

**现状的问题不是"左右结构不对"，而是左边是一个 12 字段的静态表单、且与目录完全脱钩**，
同时结果区被压成 `minmax(0,1fr)` 的窄网格，视觉上仍是次要区域。

**决策**：

- **保留两栏**：左栏 = 输入与参数（窄栏），右栏 = 结果（占满剩余宽度，**大图优先**）
- **左栏改为 composer 形态**，自内向外依次为：
  参考图条 → 提示词输入（含 `@` 引用）→ **能力胶囊**（生成方式，来自 `capability.modes`）
  → **参数胶囊**（比例 / 时长 / 清晰度 / 数量）→ **模型档位选择器** → 费用预估 → 生成按钮
- **常显参数只留最高频 3–4 个**，其余进「高级参数」浮层 —— 渐进披露，复用 ADR-005 的核心结论：
  **数据分层 ≠ 界面分层**
- **模型选择不做成参数列表项**，独立为「模型档位」选择器，并在每个档位旁直接标注**预估消耗**
  （范式 G：即梦「模型档位即标价」；反面是 OiiOii/LibTV 的「黑盒未明码标价」投诉）
- **结果区不再是一个"结果历史"卡片**：右栏内以画廊/列表切换，详情用抽屉（含种子与全参数，范式 E）
- 移动端：单列，composer 在上、结果在下

**明确不做**：

- ❌ 整页对话流（chat）布局 —— 生成类产品的单位是「一张图/一条视频」，不是「一轮对话」。
  但**接受**把「提示词优化」做成 composer 内的一个按钮（范式：可灵在生成界面直接内嵌 DeepSeek-R1 扩写）
- ❌ 三栏大表单（堆友式左栏全展开）—— 参数面越统一越该内联，而不是越摆越多

### D2 · 参数面板：能力优先 + 三级降级（**本 ADR 最关键的决策**）

**数据源优先级**：

1. **`model.capability`**（今天即可用，无需后端改动）→ 决定**哪些控件存在**：
   `modes`（生成方式）、`refImage`（参考图）、`maxRefImages`/`maxRefAudios`（上限）、
   `minDurationSeconds`/`maxDurationSeconds`（时长范围）、`qualityTiers`（档位数）、`billing`（费用）
2. **协议模板 `capabilities[mode]`**（`param_mapping` + `required_params`，2/9 有声明）→ 决定
   **控件映射到请求的哪个字段**，以及**提交前必填校验**
3. **前端类型默认控件 schema**（新增 `config/create/control-schema.ts`）→ 仅当 1、2 都未声明时兜底

**红线（三条，缺一不可）**：

- (a) 默认 schema **只声明控件种类与顺序**，**不得声明协议字段名/取值**
  —— 区分「图片模型有比例选择器」（UI 语法，可兜底）与「aspect_ratio 要发到请求的哪个位置」（协议映射，必须来自目录/模板）
- (b) 模型不支持的能力**不渲染控件**（`modes` 无 `i2v` 就不出现参考图入口），而不是渲染后置灰
  —— 满足 `DESIGN.md` §3.4「不展示不可用控件」
- (c) 提交前用 2 的 `required_params` 做**前置校验**，给出字段级原因，而不是提交后由 execution 报错
- (d) **已知表达力缺口**：可灵能力地图的三态里有一档是「**条件支持**」（如「仅 1080P 且仅无声视频」、
  「二次编辑仅支持可灵 1.6」），而我们的 `capability` 只能表达**支持/不支持**。
  这意味着「条件支持」目前无法如实呈现 —— 记为缺口，见 §7 待确认问题 8
- (e) **同一份 schema 允许多种投影**：除表单外提供 `JSON` 视图（同一数据源的只读投影，便于集成与排障复现，
   fal 的 Playground 就是这么做的）；`cURL / Python` 代码视图在确有集成方需求时再做
- (f) **费用展示**：模型档位旁标单价 + 提交前预估 + 三色阈值（低/中/高成本），
  并明确声明**排队等待不计费**（口径见 D10）

### D3 · 比例清单：目录当前只声明「数量」，不声明「清单」（**需 Owner 决策**）

**事实**：`capability.aspectRatioCount` 是**数字**（4/6/3），目录里**没有任何地方**声明具体是哪些比例；
`projects.aspect_ratio` 的 `CHECK ('16:9','9:16','1:1')` 是**项目级字段**，与模型能力无关。
因此前端现在的 `['16:9','9:16','1:1']` 与实际模型能力**没有任何对应关系**。

| 选项 | 做法 | 代价 |
|---|---|---|
| A | 前端维护"每模型比例如清单" | 又是硬编码，回到 BACKLOG #2 要消灭的形态 → **否决** |
| **B（推荐终态）** | `capability` **追加** `aspectRatios: string[]`（保留 `aspectRatioCount` 向后兼容），迁移 + 后端透传 + 设置页可编辑 | 需 production 迁移（新号段）+ 后端 + 设置页，独立任务卡 |
| **C（推荐过渡）** | 用 `aspectRatioCount` 取通用比例清单的前 N 项，并在 UI/数据中**如实标注** `aspectRatioSource: 'count-fallback'` | 零后端改动；不够精确但诚实 |

**建议**：**先 C 后 B**。C 让本次改造不被后端阻塞，B 作为紧随其后的任务卡 ——
避免长期停留在"声称支持 6 种比例、实际只有 3 个按钮"的状态。

### D4 · 结果归属：智能创作需要「个人素材」，而当前 Asset 强制要求 projectId/episodeId

**事实**：`types/index.ts:660` `Asset.projectId`/`episodeId` 为必填；`useAssetStore.upsertAssets`
会对每个资产调用 `createAssetOnServer(projectId, episodeId, id)`。
因此「生成结果进资产库」在**无项目场景下当前无法落地**。

**决策**（分两步，不做假承诺）：

- **本次**：结果落**本地结果库**（`mdp:create-results`，按 kind 分桶，含完整元数据与参数快照），
  支持复用/下载/删除，UI 明确标注"尚未入库"
- **后续**：由 asset 服务提供 `scope=personal`（workspace 级、project 可空）后，再把结果提升为正式资产，
  并开放"提交漫剧候选"（对齐 TECHNICAL_ARCHITECTURE 的 `智能创作 → 候选素材`）

**需 Owner 决策**：是否同意"个人素材（project 可空）"这一数据模型方向。
它不新增服务、不破坏服务边界，但需要 asset 迁移。

### D5 · 三页合一：一个类型化 `CreateWorkbench`

- 路由与 URL **不变**（`/create/image|video|audio`），保障书签与 `DESIGN.md` 的信息架构契约
- 页面文件只声明 `kind`，控件由 D2 的能力/模板/默认 schema 生成
- 删除三份 `params` 字面量与写死的 `unitCost`

### D6 · 状态与手感

- **草稿持久化**：composer 的提示词/参数/参考图按 kind 落本地，刷新不丢；参考图注意体积（只存受限张数/引用）
- **提交快捷键**：**回车提交**（国内主流，即梦实测「输入提示词后回车」）+ `⌘/Ctrl + Enter` 同时支持；
  多行输入需明确「Enter 提交 / Shift+Enter 换行」，避免与提示词换行冲突
- **提交前总额确认**：批量（数量 > 1，或未来分镜级批量）必须弹窗告知总消耗（范式 G：MOKI「30 镜 × 4 = 120 积分」）
- **轮询**：有 `queued/running` 时 2s；无运行中任务时**停止轮询**；`document.hidden` 时暂停，回前台立即拉一次
- **结果卡操作**：hover 出 下载 / **复用参数** / 作为参考图 / 生成变体 / 删除 / 取消 / 重试
  - **「沿用设置（换 seed）」与「完全照抄」必须是两个不同按钮**（InvokeAI 的 `Remix Image` vs `Use All`）：
    前者迭代构图，后者复现同一张图，合成一个按钮会让两者都做不好
- **种子（seed）不是裸数字框，而是策略枚举**：固定 / 随机 / 递增 / 微调 ±N / 沿用父任务
  （A1111 的 `🎲/♻️/⇅`、SwarmUI 的 `<random:>` 由主 seed 播种）
  —— 前提是上游返回 seed；未返回时如实标注"该模型未返回种子"，不编造
- **单条删除必须支持**（ChatGPT Images 的反面：删一张图必须删整个会话）
- **元数据随产物走**：参数快照不仅存数据库，也要能随导出文件携带与重新注入
  （否则导出/转码后溯源断链）；此项与 BACKLOG #4（落盘）/#6（媒体处理）联动
- **详情抽屉**：展示模型 · 渠道 · 全部参数 · 种子（若上游返回）· 耗时 · 费用，并支持**一键回填到 composer**（范式 E）
- **失败态**：渲染 `ServerTask.error` 原文（当前只显示"失败"两字）
- **跨字段校验**：除单字段范围外，还需支持一致性校验（如"上传了参考图时，画面比例需与参考图一致"，堆友先例）

### D7 · 复用平台独有资产：风格库 + 镜头语言库（差异化）

- 风格库（`useStyleStore`，含 `prompt`）→ composer 的**风格预设 chips**：点击把风格提示词追加/替换进提示词
- 镜头语言库（`useLensStore`）→ 视频工作台的**镜头语言插入**（景别/运镜/调度词）
- 这两项是平台相对通用生成产品的**差异化资产**（主流产品没有"漫剧镜头语言"这一概念），
  且数据已在本地 store，接入成本低
- 约束：仅作为提示词片段插入，**不得改写锁定剧本**（沿用 `DESIGN.md` §3.4 的既有约束）

### D8 · 音频：**目录 DB 约束级缺口，需 Owner 决策**

**三条互相印证的事实**：

- `model_catalog.type` 的 CHECK 仅允许 `('text','image','video')`（`services/production/migrations/004_catalog.sql:23`）
  → **音频模型无法入库**
- execution 的 provider resolver 硬拒绝非 text/image/video（`services/execution/internal/provider/provider.go:85`），
  且有测试断言 `Type: "audio"` 必须返回 `ErrUnsupportedModelType`
  → **音频无法执行**
- 而 `docs/DESIGN.md` §3.4 要求"音频首期明确支持语音合成及试听/下载；其他音频能力由模型目录声明"
  → 该要求**当前在数据层与执行层都无法被满足**（文档已承诺、代码做不到）

| 选项 | 做法 | 代价 |
|---|---|---|
| **A（推荐本次）** | 音频工作台只做 composer 重构，卡片**显式标注**"音频未接入执行链路" | 诚实、零后端风险；仍是演示 |
| B | 扩展 `type` 枚举 + execution 适配器 + 迁移 | 跨服务改动，属**底座**范畴，应回到 BACKLOG 的底座线 |
| **C（推荐整体）** | A + 把"音频模型类型缺失"作为新条目登记 BACKLOG（带启动条件） | 需要 Owner 认可"音频暂缓" |

### D9 · 品质门禁（对齐 `FRONTEND_QUALITY_GATE.md`）

- 结果主舞台必须有真实的空态 / 加载态 / 失败态 / 无权限态，不允许用假数据占位生产状态
- 图标按钮带 `title`/`aria-label`；grid 列加 `min-w-0`（R2）；页面容器不用 `max-w-xl/2xl`（R3）
- 交付前执行六步硬门禁，`npm run gate` 必须 GATE=0

### D10 · 队列与取消：区分状态，并且现在就把计费口径定义清楚

**为什么这是一个独立决策**：专业工具的教训表明，「取消」是多模型 + 积分平台**纠纷的源头**，
而我们的实现目前没有任何状态区分（§3.6 末尾的实测）。

**决策**：

- **取消分状态**：
  - `queued`（排队中）→ 取消 = **立即移除，永不执行**，不产生任何费用
  - `running`（执行中）→ 取消 = **只发中断信号**，上游可能仍会完成；
    UI 必须如实告知「任务可能仍会完成」，而不能假装已停止
- **计费口径前置声明**（即使当前还没有积分账本，也要先把契约写进 UI 文案与字段）：
  - 排队等待**不计费**（fal 的做法）
  - 已开始执行后取消 → **按已运行时长/已产出计费**（Replicate 的 `canceled` 口径）
  - 从未开始（`aborted`）→ **不计费**
- **UI 承载**：取消的二次确认里写明该状态下的扣费口径；结果/任务卡上区分展示
  「已取消（未开始，未扣费）」与「已取消（已执行 N 秒，按已运行计费）」
- **队列是可管理对象**，不是一根进度条：`排队中 / 运行中 / 已完成 / 失败` 分段，
  支持逐项取消、全部清空、暂停/恢复、**保留原参数重试**与**改参数再跑**（复制到 composer）
  - 但**关键队列操作不允许藏在二级菜单里**（ComfyUI 的 `Clear All Queue` 教训）
- **三种超时分离**：`start_timeout`（服务端绝对截止）／单次尝试超时／客户端等待，
  避免「点了一次没反应」与「任务被莫名杀掉」两类投诉

**依赖缺口**：本决策的计费部分**依赖一个尚不存在的积分账本**（全仓 `credits/ledger/wallet/balance`
命中为 0，`cost_estimate` 只是展示字符串）→ 已登记 `docs/BACKLOG.md` 第 12 项。
在账本落地前，UI 只做「口径声明」与状态区分，**不假装已经退款**。

---

## 7. 待 Owner 确认

| # | 决策点 | 我的建议 |
|---|---|---|
| 1 | **D1 布局**：是否认可「**保留左输入 / 右结果两栏骨架，把参数收敛为输入区内的胶囊**」，替代"左参数长表单 + 右窄网格"？（我最初的"底部 composer"提议已按对标证据自行推翻） | 认可——国内主流是左右结构，趋势是把参数内联而非换骨架 |
| 2 | **D2 红线**：是否认可"默认控件 schema 可兜底 UI 语法，但协议字段映射必须来自目录/模板"？ | 认可——这是 AGENTS.md 禁区与"7/9 模板无声明"现实的唯一自洽解 |
| 3 | **D3 比例清单**：是否认可"先 C 过渡、紧随 B 补 `aspectRatios`"？ | 认可，且 B 不应拖过本次迭代 |
| 4 | **D4 个人素材**：是否认可"本次先落本地结果库，个人素材（project 可空）另开任务卡"？ | 认可 |
| 5 | **D8 音频**：是否认可"本次只重构 composer，音频执行链缺口登记 BACKLOG"？ | 认可 |
| 6 | **D7 范围**：风格库 + 镜头语言库接入是否纳入本次？ | 纳入——差异化收益高、成本低 |
| 7 | **候选数默认值**：`count` 默认 1 还是 4？（无界默认 4；万相/即梦一次 4 张消耗 1 额度） | 建议默认 **1**，但在下拉里把 4 作为显眼预设——漫剧场景多为单张精修，且 4 张会放大积分消耗，需先确认计费口径 |
| 8 | **`capability` 是否需要「条件支持」**：可灵三态表含"仅 1080P 且仅无声视频"这类条件能力，我们只能表达支持/不支持 | 现阶段靠 `note` 文字说明兜底；若要精确表达需扩展 capability 结构（与 D3-B 同一批后端改动） |
| 9 | **镜头语言/风格词条是否要做成服务端资产**：D7 先接本地 store（`useLensStore`/`useStyleStore`），但 `BACKLOG.md` #3 记录这两个 store **0 个 API 调用** | 本次接本地；「接后端」沿用 BACKLOG #3 的启动条件，不并入本次 |
| 10 | **「积分余额」与「并发额度」是否要在 UI 上分开表述**（Comfy Cloud 专门用 FAQ 解释这个混淆；fal 的并发随充值提升、排队不计费） | 建议**分开**：余额=能不能做，并发=同时能做几个。但**当前全仓没有积分账本**（`cost_estimate` 只是展示字符串），所以本次只做口径声明与状态区分，账本落地见 BACKLOG #12 |
| 11 | **「同一提示词横向比多个模型」是否作为本页的正式功能**（范式：fal Sandbox 的结果标 Fastest/Cheapest/Free；SwarmUI Grid Generator 的轴） | 建议**列为后续独立任务卡**而不是本次——它是聚合网关真正的差异化卖点，但需要队列+成本+并排视图三件套就位 |
| 12 | **D10 队列与取消**：是否认可"取消分 `queued`/`running` 两种语义并前置声明计费口径"，以及队列作为可管理对象（分段/逐项取消/暂停恢复/清空/保留原参数重试）？ | 认可——这是积分平台纠纷的源头，且我们当前的实现在专业工具圈里是已被记录过的缺陷模式 |

---

## 8. 分片落地计划

按 AGENTS.md §5.2（单片 30–90 分钟、改动 < 300 行、每片一个 PR）：

| 片 | 任务卡 | 内容 | 依赖 |
|---|---|---|---|
| 1 | `TASK-CREATE-001`（已建卡） | 能力驱动的控件 schema + 校验 + 费用预估（纯前端，不改布局） | 无 —— **今天可开工** |
| 2 | TASK-CREATE-002 | Composer 布局与结果主舞台（D1）：`GenWorkbench` → `CreateWorkbench` | 1 |
| 3 | TASK-CREATE-003 | 结果元数据 / 复用参数 / 取消·重试·删除 / 轮询优化（D6） | 2 |
| 4 | TASK-CREATE-004 | 草稿持久化 + `⌘Enter` + 空/加载/失败态（D6） | 2 |
| 5 | TASK-CREATE-005 | 风格库 + 镜头语言库接入（D7） | 2 |
| 6 | TASK-CREATE-006 | `capability.aspectRatios` 追加（D3-B）：迁移 + 后端 + 设置页 | Owner 确认 + 迁移号段 |
| 7 | TASK-CREATE-007 | 个人素材（project 可空）+ 结果提升为资产（D4） | Owner 确认 + asset 迁移 |
| 8 | —（登记 BACKLOG） | 音频模型类型缺口（D8） | Owner 确认 |
| 9 | —（登记 BACKLOG） | 补齐其余 7 个内置协议模板的 `capabilities` | 底座线排期 |
| 10 | TASK-CREATE-008 | 队列与取消：状态区分 + 计费口径文案 + 队列抽屉（D10） | 2（需要结果/队列区） |
| 11 | TASK-CREATE-009 | 「同一提示词横向比多个模型」并排视图（待确认问题 11） | 3 + 10 |
| 12 | —（登记 BACKLOG） | 积分账本与并发额度（待确认问题 10 的账本部分） | 底座线排期 |
| 9 | —（登记 BACKLOG） | 补齐其余 7 个内置协议模板的 `capabilities` | 底座线排期 |

**需同步的文档**：`docs/DESIGN.md` §3.4（智能创作段落改写）、`CHANGELOG.md`、
`docs/BACKLOG.md`（#2 改为"已启动" + 新增音频缺口条目）、`docs/architecture/*`（若涉及表结构）。

---

## 9. 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 7/9 协议模板无 `capabilities` | 模板级映射覆盖不全，部分模型走默认 schema | D2 三级降级；补齐模板能力列为第 9 项独立任务 |
| `aspectRatioCount` 只有数量无清单 | 无法显示真实比例 | C 过渡并如实标注；B 补齐 |
| 参考图以 dataURL 存本地草稿 | localStorage 体积爆掉 | 草稿只存受限张数/引用，大图不落本地 |
| 结果仍为占位图 | 用户体验仍是演示 | 本次不承诺真实产物；与 BACKLOG #4（MinIO 落盘）联动 |
| composer 改动大、触及 3 个路由页 | 回归风险 | 分片交付，每片独立 PR + gate；新组件通过验收前保留旧组件 |
| 本线若做 D3-B 需要新迁移号 | 与并行线撞号 | 按 AGENTS.md §12.3 先在 PR 中声明并更新号段表 |
| 音频工作台仍无真实链路 | 与 DESIGN.md 的承诺不一致 | D8 显式标注 + 登记 BACKLOG，消除"文档已承诺、代码做不到"的隐性债务 |
| **没有积分账本，D10 的计费口径无法真正执行** | 用户看到"按已运行计费"却查不到扣费明细 → 正是 LibTV「黑盒未明码标价」投诉的成因 | 账本落地前**只做口径声明与状态区分，不假装已退款**；账本登记 BACKLOG #12 |
| 元数据"只在数据库、不随产物走" | 导出/转码/转发后溯源断链（Civitai 写 `copyMetadata` 就是为解决这个） | D6 要求参数快照随产物可携带/可再注入；与 BACKLOG #4/#6 联动 |
| 队列切片（D10）依赖结果区先成型 | 排片顺序若颠倒会返工 | 严格按 §8 顺序：片 2（结果区）→ 片 10（队列抽屉） |
| 「横向比多模型」（待确认 11）被过早拉进本次 | 范围膨胀，三件套（队列/成本/并排视图）缺一不可 | 明确列为后续独立任务卡，不并入本次 |
