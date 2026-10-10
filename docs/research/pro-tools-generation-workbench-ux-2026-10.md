# 专业级 / 超能力用户 AI 生成工具的「生成工作台」UX 竞品研究

> 调研日期：2026-10-10
> 目标读者：漫剧导演工坊「智能创造」（`/create/image|video|audio`）产品与前端设计
> 目标：为一个 **多模型聚合网关 + 积分计费** 的生成工作台，提炼参数深度、批量/队列管理、复用工作流的可借鉴设计

---

## 0. 方法与证据边界

- 共执行 **15 组 web_search（累计 60 条查询）+ 40 次 web_fetch**，其中 34 个来源成功抓取并用于本报告。
- **规则：本文出现的每一条 UI/行为事实，都来自我实际抓取到的页面**（末尾来源清单）。凡是推断、或只在搜索摘要里出现而未能抓取的内容，一律标注「⚠️推断」或「⚠️未验证」。
- 抓取技巧说明（对后续复现有用）：Mintlify 系文档站（docs.comfy.org、fal.ai/docs、docs.magnific.com、docs.upscayl.org）和 Replicate 文档支持在 URL 末尾加 `.md` 取回**原始 Markdown**，绕开导航栏造成的正文截断；GitHub 用 `raw.githubusercontent.com`（wiki 用 `raw.githubusercontent.com/wiki/...`）；GitHub Issue/PR 用 `api.github.com` 取 JSON 正文。
- 失败/剔除的来源：deepwiki.com（HTTP 429）、civitai.com 文章页（fetch failed，两次）、npmjs.com（403，改用 unpkg 取 README）、wandb 官方文档（已跳转到 CoreWeave 托管域名）。这些工具的事实改由其它已抓取来源覆盖。

---

## 1. 逐工具事实卡

### 1.1 ComfyUI（节点式，本地 / Comfy Cloud）

**1) 布局与面板**
当前界面主要由：主菜单；**左侧导航侧边栏**（ASSETS 资产 / Nodes 节点库 / Models 模型库 / Workflows 本地工作流 / **Templates 内置工作流模板**）；左下工具栏（Help、Console —— 二者都打开运行日志、Shortcuts、Settings）；**顶部区域**（当前打开的工作流、New Workflow 按钮、**右侧运行与队列控制区**、登录状态、Quick Access 打开右侧面板）；右下画布控件（移动/平移、小地图、连接显示）。文档另列出"四个侧边面板"：Workflow History Queue（Queue）、Node Library、Model Library、Workflows。来源：[Interface Overview](https://docs.comfy.org/interface/overview)
旧版菜单可通过 Settings → Comfy → Menu → `Use new menu` 切回（旧菜单仅英文）。

**2) 参数深度**
- 参数就是节点上的 widget，天然"按功能分段"；节点通过连线组合，类型不兼容无法连接（文档举例：图像输出不能直接连到期望数字的输入）。来源：[ComfyUI Workflows](https://docs.comfy.org/basic-concepts/workflow)
- **APP mode**：把任意工作流"降级"成一张表单 —— 4 步 builder（选输入 → 选输出 → 预览 → 设默认视图），选中的输入/输出会在右侧面板排布，运行时只显示这些输入 + 一个 Run 按钮；窄屏/移动端自动变成 tab 布局（输入 / 输出 / 素材）。**APP mode 下参数是"被挑出来的子集"，不是全集**，这是"给非专家的深度降维"最典型的官方实现。分享链接只支持 Comfy Cloud。来源：[APP mode](https://docs.comfy.org/interface/app-mode)
- **Subgraph**：把一组节点打包成一个可复用节点；"Parameters Panel"可**重排 widget 顺序、用眼睛图标控制可见性**，不必进入子图；可发布成 `Subgraph Blueprints` 进节点库（发布会复制，实例之间互不影响）。来源：[Subgraph](https://docs.comfy.org/interface/features/subgraph)
- 官方也承认参数与节点太碎：提供 **Node docs**（任意节点内看文档）、Templates、Partial Execution（只跑子图）。来源：[Interface Overview](https://docs.comfy.org/interface/overview)、[docs llms 索引](https://docs.comfy.org/llms.txt)

**3) 队列管理**
- 侧边栏第一个面板即 **Queue = 工作流历史队列**（"所有队列信息"）。来源：[Interface Overview](https://docs.comfy.org/interface/overview)
- 用户实际描述（Issue 正文）：v0.4.0 后找不到 `Clear All Queue`，回复是"藏得很深：靠近 `Cancel current run` 的地方有 `view job history`，悬停或点它就在里面"。该 Issue 状态 open、有 3 条评论、2 个 👍。来源：[ComfyUI_frontend Issue #7319](https://github.com/Comfy-Org/ComfyUI_frontend/issues/7319)
- 队列项有状态区分：PR 正文明确写出 `pending` / `running` / `initialization` 三态，且**取消逻辑必须分状态**：`running`/`initialization` 调 `api.interrupt(promptId)`，`pending` 调 `api.deleteItem('queue', promptId)`。修复前的 bug 是"Cancel 按钮对所有任务都调 interrupt，对 pending 任务静默失败（日志：Prompt ... is not currently running, skipping interrupt）"，而右键菜单里的 "Cancel job" 是对的。修复后 `QueueProgressOverlay.vue` 与 `useJobMenu.ts` 行为一致，并在取消后 `queueStore.update()` 刷新。来源：[PR #7788](https://github.com/Comfy-Org/ComfyUI_frontend/pull/7788)
- APP mode 运行时顶部出现 **Cancel this run**，底部面板可在 queue 视图与 results 视图之间切换。来源：[APP mode](https://docs.comfy.org/interface/app-mode)
- ⚠️未验证：Queue 面板是否支持拖动重排、是否有单条"用相同参数重跑"。

**4) 复用与溯源（ComfyUI 最强的一块）**
- 工作流本身就是 JSON，可脱离产物独立保存/分享。来源：[ComfyUI Workflows](https://docs.comfy.org/basic-concepts/workflow)
- **两种保存格式**：Save Format（`File → Save`/`Ctrl+S`，含节点标题、坐标系/颜色/分组等布局信息，用于前端再次打开） vs **API Format**（`File → Export Workflow (API)`，用数字节点 ID 做 key，**剔除位置/颜色/分组**，用于 API 提交；仍可在 UI 打开但丢失布局）。来源：[Workflow API Format](https://docs.comfy.org/development/api-development/workflow-api-format)
- **产物内嵌工作流元数据**：写出两个 JSON 字段 `workflow`（完整图，含布局，用于恢复画布）与 `prompt`（执行用 API prompt）；容器覆盖 **PNG（tEXt chunk）、动画 PNG、动画 WebP（EXIF，`workflow:{JSON}` 字符串）、MP4/WebM（容器 metadata tag）、`.latent`/`.safetensors`**。恢复方式：**把生成的文件拖到画布上**，或 File → Open。来源：[Workflow Metadata](https://docs.comfy.org/development/api-development/workflow-metadata)
- 该文档还明确列出局限（对我们要做溯源时极有价值）：内嵌元数据**不是数字签名**、不证明作者；**不包含模型文件、输入素材、自定义节点包**；移动/重命名模型或节点会导致恢复出的工作流跑不起来；图/视频编辑器重编码会丢；`--disable-metadata` 会关掉。结论原文："Treat embedded metadata as optional and untrusted input." 来源同上。

**5) 多模型 / 多工作流**
- 模型在 `ComfyUI/models/` 下按目录分类；按 `r` 刷新节点定义获取最新模型。来源：[Interface Overview](https://docs.comfy.org/interface/overview)
- **Templates 把"工作流 + 依赖模型"打包成一体**：模板在节点 `properties.models` 里内嵌 `name`/`url`/`directory` 三元组；加载模板时自动检查缺哪些模型文件并提示下载（桌面版点 Download 自动下，其它版本给浏览器下载 + 明确的目标目录树）。当前**只支持 Hugging Face 与 Civitai 链接，且只接受 `.safetensors`/`.sft`；`.gguf` 被视为不安全、不显示链接**。模板由单独的 Python 包 `comfyui-workflow-templates` 版本化，全部模板托管在独立仓库，官方模板不许用第三方节点。来源：[Workflow Templates](https://docs.comfy.org/interface/features/template)
- 能力不匹配的处理是"**缺失即提示 + 强制补齐**"，而不是静默降级。

**6) 失败 / 诊断**
- 节点缺失、报错、拿不到必需输入时"工作流无法完成，**该节点会被标记**出来，方便定位"。来源：[ComfyUI Workflows](https://docs.comfy.org/basic-concepts/workflow)
- 模板缺模型有专门的下载提示弹窗；文档同时提醒"若模型已下到子目录，可忽略弹窗，只要在 loader 节点里选对模型"（即**已知的误报**）。来源：[Workflow Templates](https://docs.comfy.org/interface/features/template)
- 左下工具栏的 Help 与 Console 都指向运行日志。来源：[Interface Overview](https://docs.comfy.org/interface/overview)

**7) 本地 vs 云 / API-first**
- ComfyUI 前端已是独立 pip 包（`comfyui-frontend-package`），版本独立演进；模板、内嵌文档各自独立版本号。来源：[Interface Overview](https://docs.comfy.org/interface/overview)、[Workflow Templates](https://docs.comfy.org/interface/features/template)
- Cloud 侧支持 Team Workspaces（共享工作流与订阅积分）。来源：[Interface Overview](https://docs.comfy.org/interface/overview)

### 1.2 Comfy Cloud / Partner Nodes：积分与并发（对"聚合网关 + 积分"最直接的对标）

- **积分入口**：默认不显示，需先登录账号，然后在 `Settings → Credits` 看余额、购买与 `Credit History`。购买走 Stripe，支持信用卡 / 微信 / 支付宝（微信与支付宝**仅在以 Comfy Credits 结算时**可用）。来源：[Credits Management](https://docs.comfy.org/interface/credits)
- **成本前置**："Check the **price badge on the API node** to estimate the cost before running it. Actual costs can vary based on image size, generation quantity, and other parameters." 来源同上。
- **负余额**：因 partner node 有时在**执行前**不报成本，单次执行可能超出余额导致负余额；余额为负时**无法继续运行 Partner Nodes**，必须先充值。来源同上。
- **过期策略**：月度积分在账单周期末过期；充值积分自购买起 1 年过期；未使用积分不退。来源同上。
- **并发是两套独立限制**（这一点对企业级聚合网关至关重要）：**Partner Node 并发**（按**终身付费总额**分档，$0→1、≤$100→5、≥$100→10、≥$500→20、≥$1000→40；单次成本 ≥$5 的模型并发降为账户档位的**四分之一**，下限 1）与 **Cloud job 并发**（按 Cloud 计划/订阅档位）。两者独立执行，"有效吞吐受先到的那个限制"。来源：[Partner Node Concurrency Limits](https://docs.comfy.org/tutorials/partner-nodes/concurrency-limits)
- 超限行为：Partner Node 超限**立即 429**（被禁用时 403）；并发与**余额无关**（余额 0 时即使有空槽也会因积分不足失败）。响应头 `X-Concurrency-Limit` / `X-Concurrency-Current` / `X-Concurrency-Remaining`。仅"在飞"的调用占槽位，**已完成的调用立刻释放**。来源同上。

### 1.3 fal.ai：Playground / Sandbox / Workflow Endpoints / Queue / 计费

**1) 布局：模型页 = Playground tab + API tab**
- 每个模型页面按 tab 组织：**Playground** tab 填输入直接跑；**API** tab 展示**完整 input/output schema 与类型信息**；页面同时展示价格、平均时延、可直接复制的代码示例。来源：[Playground](https://fal.ai/docs/documentation/model-apis/playground)
- Playground 表单**由模型的 input schema 自动生成**：必填字段有标记、可选字段有合理默认值、接受图像/视频/音频的模型可直接上传文件。Run 后结果出现在表单下方。来源同上。
- **代码 / 表单双视图**："Use the input-mode selector to switch from **Form** or **JSON** to **Python**, **JavaScript**, or **cURL**。The generated snippet uses your current inputs and the selected endpoint"，文档承诺 "no gap between what you tested and what you ship"。来源同上。
- 自部署 app 的 Playground 在 dashboard 的 **Testing → Playground**，可切换 endpoint；已提交的请求在 **Requests** 里查。命名带 `image_url` 后缀的字段会渲染成图片上传控件，`Hidden()` 包裹的字段在表单里隐藏但 API 仍可用。来源同上。

**2) Playground vs Sandbox（官方对比表）**
| | Playground | Sandbox |
|---|---|---|
| 目的 | 测单个模型/endpoint，复制代码 | 比较多模型 |
| 位置 | 模型页 / app dashboard | `fal.ai/sandbox` |
| 代码生成 | Python / JS / cURL | 无 |
| 分享 | Request links | 带预览的分享链接 |
来源：[Playground](https://fal.ai/docs/documentation/model-apis/playground)

**3) Sandbox：多模型比价型工作台（本报告最值得抄的一个界面）**
- 目标原文："Run the same prompt or input across multiple models to see which produces the best results"，支持文生图/图像编辑/多图编辑/放大/抠图；文生视频/图生视频/首尾帧/放大/抠图/视频配音频；文生音乐/TTS/音效。来源：[Sandbox](https://fal.ai/docs/documentation/model-apis/sandbox)
- **Canonical input（规范输入）是核心机制**：不同模型字段名不同（`prompt` vs `text` vs `description`），Sandbox 用一套规范化输入，提交时**自动重映射**到每个模型自己的 schema。文档给出完整别名表（如 `image_url` ← `image`/`source_image`/`input_image`/`control_image_url`/`reference_image_url`/`start_image_url`；`duration` ← `video_length`）以及**值变换行为**（`aspect_ratio` 的 `16:9` 可能被转成 `landscape_16_9` 或 `square_hd`；`duration` 自动吸附到模型枚举值；`scale` 转成离散 `"2"`/`"4"`）。来源同上。
- **Model sets**：把模型分成策展集合 —— State of the Art / Anime Style / Fast Generation / 自定义集合。**模型集合是 operation 级别的**。来源同上。
- **Run vs Request 的计数模型**："Run = 一次提交；如果选 3 个模型 × quantity 2x，这次 run 含 6 个 request"；每个 run 有唯一 share ID、记录全部输入参数、追踪每个 request 的状态/成本/时长、生成社交预览图。来源同上。
- **成本前置 + 颜色阈值**：运行前显示预估成本（按所选模型与 quantity），在 prompt bar 底部用**绿（<$1）/ 黄（$1–$2.50）/ 红（>$2.50）**徽章；实际成本可能因输出复杂度（如更长视频）而变化。来源同上。
- **结果卡徽章与动作**：结果上标 **Fastest / Cheapest / Free**；hover 结果有 **"Use as input"** 按钮把结果接到兼容的 operation（Sandbox 会自动切到合适的 operation）。来源同上。
- **Input Card（开启 Show Metadata 时可见）动作**：**Copy**（把该 run 的设置填回表单）、**Rerun**（立刻同样再跑一次）、**Archive**（从 Sandbox 移除，请求历史仍可查）、**Share**（生成分享链接）、**Bookmark**；**也可点击 input card 里单个字段，只把那个值复制到当前表单**。来源同上。
- **历史检索**：文本**语义**搜索（搜 prompt 等文本字段）、**图片相似**搜索（上传图）、**主色**搜索（选颜色）；过滤维度含操作类型、团队成员、仅书签、**相似度阈值**。来源同上。
- **免费额度**：仅可在 Sandbox 与 Playground 用，**不能通过 API 或 Workflows 用**（`Note:` 原文）。来源同上。
- **自建 app 接入 Sandbox 的校验语义**：加入时校验 schema，图标 ✓绿=完全兼容 / ⚠黄=有警告（部分字段需变换）/ ✕红=不兼容（无法加入）/ ℹ蓝=有信息（部分字段会被自动变换）。并声明私有 endpoint 在 Sandbox 里可能拿不到成本与时长指标。来源同上。

**4) Workflow Endpoints：多步流水线 = 一个 endpoint**
- 把多个模型串成一个 endpoint，中间产物通过**流式事件**暴露：`submit`（含 app_id/request_id/node_id）、`completion`（某步完成，含该步 output）、`output`（最终结果）、`error`（含 `error.status`、`message`、`error.body` 透传底层校验错误）。来源：[Workflow Endpoints](https://fal.ai/docs/documentation/model-apis/workflows)
- 官方示例 `workflows/fal-ai/sdxl-sticker`：fast-sdxl 生成 → rembg 抠图 → face-to-sticker，三步一次调用。

**5) 队列（与聚合网关最相关的语义定义）**
- 三态：`IN_QUEUE`（等待 runner，可用 `queue_position`）/ `IN_PROGRESS`（已路由到 runner，可带 logs）/ `COMPLETED`（可取结果，带 `metrics.inference_time`、`error`、`error_type`）。来源：[Asynchronous Inference / Queue](https://fal.ai/docs/documentation/model-apis/inference/queue)
- **关键保证**：队列中的请求**永不丢弃**；无可用 runner 时等待并把 runner 扩容；**无队列长度上限**；runner 失败（503/504/连接错误）自动重新入队并**最多重试 10 次**。来源同上。
- **取消语义分状态（必须抄）**：仍在 `IN_QUEUE` → 立刻移除、永不执行；已 `IN_PROGRESS` → **只发取消信号**，"如果 app 未实现取消端点，请求可能仍然完成"。HTTP 返回 `202 CANCELLATION_REQUESTED` / `400 ALREADY_COMPLETED` / `404 NOT_FOUND`。来源同上。
- **三种超时必须区分**（原文表格）：`start_timeout`（服务端，绝对截止，在开始处理前检查，过期返回 504 且不再重试，**不限制推理时长**）/ `client_timeout`（客户端，含排队+处理，不影响服务端）/ `request_timeout`（**由 app 开发者**设定，限制单次尝试，超时杀 runner 并重试，默认 3600s）。来源同上。
- **优先级**：`X-Fal-Queue-Priority` 取 `normal`/`low`，**作用域是"每用户每 endpoint 的队列"**，即低优先级只在你自己的请求之间降级，用户之间仍公平；文档明确建议"面向用户的交互请求用 normal，后台批处理用 low"。来源同上。
- **亲和性**：`hint`（`X-Fal-Runner-Hint`）把请求尽量路由到处理过同 hint 的 runner（例如已加载某模型/适配器的机器）—— 对"多模型聚合网关"里减少模型冷加载很有参考价值。来源同上。
- `X-Fal-No-Retry` 可为单次请求关掉自动重试。来源同上。

**6) 计费（积分模型的最佳实践样例）**
- **预付费积分**制，积分同时决定**并发上限**。来源：[Pricing](https://fal.ai/docs/documentation/model-apis/pricing)
- 计费单位按模型类型：图像**按张或按百万像素**（分辨率越高越贵）；视频**按秒或按条**；其它按请求或 GPU 秒。计费单位与单价在模型页和 pricing 页展示，也可通过 Platform API 查（`GET /v1/models/pricing?endpoint_id=...` 返回 `unit_price`/`unit`/`currency`）。来源同上。
- **不计费项**：HTTP 500 及以上的服务端错误不计费；**排队等待时间不计费**。来源同上。
- 还有 `estimate`（成本预估）、`usage`（含 `cost_subtotal`/`cost_discount`/`cost_total` 的分页用量）、`billing-events`（逐请求成本明细，含 nano USD 精度）、`analytics`（按 endpoint 的时间桶指标，含成功/错误率、时延分位数；`prepare_duration` 是排队/准备时间）。来源：[fal llms.txt 索引](https://fal.ai/docs/llms.txt)
- 并发限制文档补充：新账号并发为 **2**；随**近四周已付发票总额**自动提升，自助上限 **40**；购买积分后几分钟内生效；达到上限的请求**等待**而非拒绝，并以指数退避重试，**并发相关的重排没有最大重试次数**。来源：[Concurrency Limits](https://fal.ai/docs/documentation/model-apis/concurrency-limits)

### 1.4 Replicate

- **Playground**：每个模型有自己的 playground 页面，用**表单**运行，文档原文称"gives you a visual view of all the inputs to the model, and generates a form for running the model right from your browser"；定位是"试模型的起点"，之后就转 API（Python/JS 客户端示例紧随其后）。来源：[Run a model](https://replicate.com/docs/topics/models/run-a-model.md)
- **冷启动语义被显式写进文档**：模型"热"时响应快、"冷"时需要拉取并加载数 GB 代码，**有时要几分钟**；热门公开模型冷启动少见；官方指出"按实际运行时间计费，所以冷启动不影响成本"。来源同上。
- **模式**：同步（`Prefer: wait`，默认保持连接 60 秒，可 `Prefer: wait=5`）vs **异步（默认）**：立即返回 prediction id，可用 webhook（`webhook_events_filter`）或轮询。若同步等待超时，返回未完成的 prediction（`starting`/`processing`），可用 `Location` 头或 `urls.get` 继续取。来源：[Create a prediction](https://replicate.com/docs/topics/predictions/create-a-prediction.md)
- **截止时间**：`Cancel-After` 头（5 秒 ~ 24 小时，支持 `30`/`30s`/`5m`/`2h` 写法）。文档明确区分"prediction deadline（预测本身何时取消）"与"sync wait（HTTP 连接保持多久）"。来源同上。
- **状态机**：`starting` / `processing` / `succeeded` / `failed` / **`canceled`（用户取消或开始后超截止）/ `aborted`（开始前就超截止）**。预测运行 **30 分钟**超时（需更长要联系官方）。来源：[Prediction lifecycle](https://replicate.com/docs/topics/predictions/lifecycle.md)
- **计费与取消挂钩**：`aborted`（从未开始）不计费；`canceled`（已开始）**为取消前已运行的时间付费**。来源同上。
- **每个 prediction 自带 Web URL**（`https://replicate.com/p/{id}`，`urls.web`）：创建时即有、完成后仍可访问，用于**查看详细日志/输入/输出/指标**、分享给同事或客户、可视化监控。文档给了用 cURL + jq 取最近一条 prediction 的 web URL 的示例。来源：[Create a prediction](https://replicate.com/docs/topics/predictions/create-a-prediction.md)
- **监控面板**：登录后在 dashboard 看到 prediction 列表，含状态、运行时长等摘要。来源：[Prediction lifecycle](https://replicate.com/docs/topics/predictions/lifecycle.md)
- **版本与可复现**：模型页有 **Versions tab**；文档原文"Versioning is essential to making machine learning reproducible: it helps guarantee that a model will behave consistently regardless of when or where it's being run"，模型作者改数据/修 bug/升级依赖都会发新版本，避免影响使用旧版本的人。来源：[Model versions](https://replicate.com/docs/topics/models/versions.md)
- **分享**：web 界面有 **Share 按钮**把 prediction 变公开，别人可查看；默认只有自己可见。来源：[Share a prediction](https://replicate.com/docs/topics/predictions/share-a-prediction.md)

### 1.5 InvokeAI（Unified Canvas + 队列 + Gallery）

**1) 布局：三种工作流并列**
文档把生成方式明确列成 Text to Image / Image to Image / **Unified Canvas** 三条并列路径，Canvas 的描述是"an advanced AI-first image editing tool…regenerate elements, edit content or colors (**inpainting**), or extend the image (**outpainting**)"。来源：[Image Generation](https://invoke.ai/concepts/image-generation/)

**2) Unified Canvas（把四种生成模式收进一个画布）**
- 两层：**Base Layer** + **Mask Layer**（`Q` 键切换）。来源：[Unified Canvas](https://github.com/thinkyhead/InvokeAI/blob/2d5180002d5693132040214161fefee9004258c4/docs/features/UNIFIED_CANVAS.md)
- **Staging Area**：生成结果先落在暂存区，此时不能操作画布；可 Prev/Next 浏览、**单独保存某张到 gallery（不提交到 Base）**、丢弃；"接受"才提交到 Base 层。文档还承认"丢弃在单次会话内可撤销，但未保存的生成在画布重置后会丢失"。来源同上。
- **Bounding Box 自动判定生成模式**（这是它最聪明的设计）：框在**空白 Base 区域** → TextToImage；框在**有内容且无透明/无 mask** → ImageToImage；框在**有内容 + 有 mask** → Inpainting；框跨**有内容与透明区** → Outpainting（同时 inpainting mask 区域）。来源同上。
- **Seam Correction 参数**（Size / Blur / Strength / Steps）用于拼接边缘，文档给了经验值（例如 96 宽 + 16 blur、strength 0.7）。来源同上。
- **Infill & Scaling**：`Scale Before Processing`（小框时先生成大图再缩放，默认开）、`Inpaint Replace`（用噪声替换原 RGB，值越高越偏离原图）、`Infill Method`（Patchmatch 优先，Tile 兜底 + Tile Size）。来源同上。
- 工具：Mask Options（Enable Mask / Preserve Masked Area 反相）、Creative Tools（Brush 在 Base/Mask 自动切换语义、Erase/Fill Bounding Box）、Canvas Tools（Move、Reset View、**Merge Visible** 用来缓解浏览器性能问题）。来源同上。

**3) 队列（从源码可观测到确切动作集）**
`QueueActionsMenuButton` 组件包含：**Cancel current**（`isDestructive`，图标 ✕，`useCancelCurrentQueueItem`）、**Clear queue**（`isDestructive`，图标垃圾桶，走确认弹窗 `useClearQueueDialog`）、**Resume**（仅当 feature status `resumeQueue` 开启）、**Pause**（仅当 `pauseQueue` 开启）、**Open queue**（`setActiveTab('queue')`）。按钮旁有动态定位的 `QueueCountBadge` 显示队列数量；菜单里还嵌了 `SessionMenuItems`（新建会话）。来源：[QueueActionsMenuButton.tsx](https://github.com/invoke-ai/InvokeAI/blob/5e3d1c442c80817a03255ed0f70ce296a70eab82/invokeai/frontend/web/src/features/queue/components/QueueActionsMenuButton.tsx)
⚠️未验证：队列内单条拖动重排、单条删除（源码路径 `QueueList.tsx` 在我的抓取中 404，可能已改名）。

**4) Gallery + 复用链（"gallery 即工作入口"）**
- Gallery 分成 **Boards**（`Uncategorized` 永在；图与视频**多态共存**在同一 board，按创建时间排序）；顶部有 board disclosure 与设置。来源：[Gallery Panel](https://invoke.ai/features/gallery/)
- 设置项：预览尺寸滑杆、**Auto-Switch to New Images**（新图自动加载进当前结果面板，"即使生成时你在别的 tab 也生效"）、**Auto-Assign Board on Click**（开启时，**点 Invoke 那一刻选中的 board** 就是目标，从而可以"连续排队、各进不同 board"；关闭时出现固定的 Auto-Add Board 下拉）、是否显示分辨率徽章。来源同上。
- **Virtual Boards**（如 By Date）：**按需计算的只读视图**，不落库；不能拖拽、无右键菜单、不能改名/删除；生成新图会立刻更新计数，但**新图仍然存到真正的 auto-add board**（"虚拟 board 是视图不是目的地"）。可折叠状态跨刷新保留。来源同上。
- Board 右键菜单：Auto-add to this Board、Download Board Images（打包 zip，**视频不含在内**）、Delete Board（**Delete Board Only 保留内容 → Uncategorized** vs **Delete Board and Assets 永久删除**）。删除是"先删记录再删文件"，失败时**宁可保留完整图片**，并用 journal 在下次启动时清理残留；"Clear Intermediates"同理。多用户下 Delete Board and Assets 只删自己的媒体。来源同上。
- **元数据与复用动作**（对"复用工作流"极有参考价值）："Every image generated by InvokeAI stores its generation metadata (prompt, seed, models, etc.) **directly inside the file**"，选中图后点 **Info 按钮**读取。右键菜单（\* 号表示需要元数据）：
  - 快速：Open in New Tab / Download / **Star**（置顶）
  - 生成与工作流：**Load Workflow**（把保存的工作流载入 Workflow tab）/\* **Remix Image（载入全部设置但**不含 seed**）** /\* **Use Prompt** /\* **Use Seed** /\* **Use All** /\*（全部设置载入控制面板）
  - 路由：**Send to Image to Image**、**Send to Unified Canvas（替换当前画布内容）**
  - 组织：Change Board（也支持拖到 board 缩略图上）、Delete Image
  来源同上。
  注意 `Remix Image` 与 `Use All` 的差异 —— **"保设置但不保 seed"是一个专门的动作**，这正是"想再要一张但不要一模一样"的常见需求。

### 1.6 Stable Diffusion WebUI (AUTOMATIC1111)

**1) 布局与面板**
- 顶部 tab：txt2img / img2img / **Extras** / **PNG Info** / Checkpoint Merger / Train / Settings / Extensions；tab 顺序可配置（`Settings → User interface → UI tab order`），tab 可隐藏。来源：[modules/ui.py](https://github.com/AUTOMATIC1111/stable-diffusion-webui/blob/master/modules/ui.py)、[User Interface Customizations](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/User-Interface-Customizations)
- 生成页结构（从源码）：`Toprow`（Prompt / Negative prompt / Generate 区 / 工具行 / Styles UI）→ 参数列（尺寸、CFG、Batch、Accordions、Scripts）→ 输出面板（gallery / generation_info / infotext / html_log）。来源：[modules/ui.py](https://github.com/AUTOMATIC1111/stable-diffusion-webui/blob/master/modules/ui.py)
- **Quick Settings 顶栏**：可以把任意设置放到页面顶部；官方提醒"需要重启才生效的设置放这里没意义"。来源：[User Interface Customizations](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/User-Interface-Customizations)
- 参数标签页整体可折叠：`txt2img_settings_accordion` 为真时出现 "Open for Settings" 折叠面板（默认收起）。来源：[modules/ui.py](https://github.com/AUTOMATIC1111/stable-diffusion-webui/blob/master/modules/ui.py)

**2) 参数深度**
- **Accordion / InputAccordion**：`Hires. fix` 用 `InputAccordion(False, label="Hires. fix")` —— **勾选即启用整个分组**；扩展也用 `gr.Accordion(open=False, label=...)`（Forge 的 FreeU 示例即如此）。来源：[modules/ui.py](https://github.com/AUTOMATIC1111/stable-diffusion-webui/blob/master/modules/ui.py)、[Forge README](https://github.com/lllyasviel/stable-diffusion-webui-forge)
- **UI 默认值/范围可写**：`ui-config.json` 可改默认值、min/max/step（文档给出 `txt2img/Width/maximum: 2048 → 4096` 的完整示例），并且有 UI 内路径：调整滑块 → `Settings > Defaults` → `View changes` → `Apply`。来源：[User Interface Customizations](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/User-Interface-Customizations)
- **预设/风格**：`styles.csv` + Styles 下拉 + "Save Style" / "应用"按钮；style 会参与 token 计数（`include_styles_into_token_counters`）。来源：[modules/ui.py](https://github.com/AUTOMATIC1111/stable-diffusion-webui/blob/master/modules/ui.py)、[ThinkDiffusion FAQ](https://learn.thinkdiffusion.com/thinkdiffusion-faqs/)
- **批量的两个正交维度**（本项目聚合网关必须区分）：源码中 `batch_count = gr.Slider(minimum=1, step=1, label='Batch count')`（**无上限**，对应 API 参数 `n_iter`）与 `batch_size = gr.Slider(minimum=1, maximum=8, step=1, label='Batch size')`；二者可并排显示（`dimensions_and_batch_together`）或独立成行。来源：[modules/ui.py](https://github.com/AUTOMATIC1111/stable-diffusion-webui/blob/master/modules/ui.py)；API 字段名见 [Features wiki 的 params 列表](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/Features)
- **参数扫描 / 网格**：**X/Y/Z plot** —— "X and Y are used as the rows and columns, while the Z grid is used as a batch dimension"；支持区间语法 `1-5`、`1-5 (+2)`、`10-5 (-3)`、`1-3 (+0.5)`、`1-10 [5]`、`0.0-1.0 [6]`；**Prompt S/R**（search/replace）用第一个值作关键字替换其余值，逗号需按 CSV 规则加引号。来源：[Features wiki](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/Features)
- 另有 **Prompt matrix**（`|` 分隔，生成所有组合，"all with the same seed"）与 **Prompts from file or textbox**（逐行一个 job，`--prompt ... --steps 10 --batch_size 2 --seed 9` 这种命令行风格，**顺序执行**）。来源同上。
- **Seed 家族**（本节直接回应"random/fixed/increment/deviate"）：
  - Seed 输入默认是数字框（`--use-textbox-seed` 可改为文本框："no up/down, but possible to input long seeds"，反证默认带上下箭头）。来源：[Command Line Arguments](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/Command-Line-Arguments-and-Settings)
  - **"Extra" 勾选框在 seed 旁边**，展开两组功能：**Variation seed + Variation strength**（"At maximum strength, you will get pictures with the Variation seed, at minimum - pictures with the original Seed"）与 **Seed resize**（指定原图分辨率，使换分辨率后仍相似）。来源：[Features wiki](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/Features)
  - 源码里定义了这套图标：`🎲 random_symbol`、`♻️ reuse_symbol`、**`⇅ switch_values_symbol`**（seed ↔ subseed 切换），以及 `↺ restore_progress`、`💾 save_style`、`📋 apply_style`、`🗑 clear_prompt`、`🎴 extra_networks`、`📐 detect_image_size`。来源：[modules/ui.py](https://github.com/AUTOMATIC1111/stable-diffusion-webui/blob/master/modules/ui.py)
  - **复现性风险被单独建 wiki 页**（`Seed breaking changes`），并且 prompt editing 的 `[from:to:when]` 在 1.6.0 起把 `1.0–1.0~2.0` 的小数解析为 hires 阶段，**会改变历史 seed 的结果**；权重实现变更同样使"保存的 seed 可能产出不同图片"。来源：[Features wiki](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/Features)、[wiki Home 索引](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki)
  - ⚠️未验证：A1111 没有原生的 "increment/decrement seed" 按钮（搜索结果里有第三方 wiki 提及，但我未抓到官方来源）。

**3) 队列 / 中断 / 跳过（Toprow 的确切措辞）**
- `Interrupt` 按钮 tooltip：**"End generation immediately or after completing current batch"**；`Skip` 按钮 tooltip：**"Stop generation of current batch and continues onto next batch"**；`Generate` 按钮 tooltip：**"Right click generate forever menu"**。Prompt 输入框 placeholder 教快捷键：**"Press Ctrl+Enter to generate, Alt+Enter to skip, Esc to interrupt"**。来源：[modules/ui_toprow.py](https://github.com/AUTOMATIC1111/stable-diffusion-webui/blob/master/modules/ui_toprow.py)
- Interrupt 有二次语义：当 `job_count > 1` 且开启 `interrupt_after_current` 时，第一次点会提示 **"Generation will stop after finishing this image, click again to stop immediately."**（`gr.Info`），再点才立即中断。来源同上。
- 任务通过 **Gradio 队列**串行执行（`from modules.call_queue import wrap_gradio_gpu_call, wrap_queued_call...`；`--no-gradio-queue` 可禁用队列改用 HTTP 请求）。来源：[modules/ui.py](https://github.com/AUTOMATIC1111/stable-diffusion-webui/blob/master/modules/ui.py)、[Command Line Arguments](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/Command-Line-Arguments-and-Settings)
- ⚠️未验证：A1111 官方 wiki 与 `ui.py`/`ui_toprow.py` 中**没有**可视化的队列列表、重排、暂停、逐项取消入口；`Interrupt`/`Skip` 是唯一的控制面。这一"缺失"本身是重要证据。

**4) 复用与溯源（A1111 的强项）**
- **PNG info**：generation 参数写入 PNG 的 text chunk（"You can view this information later using any software that supports viewing PNG chunk info"）；prompt 里的 `#` 注释**不会写进 PNG info**。来源：[Features wiki](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/Features)
- **PNG Info 标签页**：上传图 → 显示参数 HTML + 隐藏的 generation_info 文本框 → 一排按钮把参数**发送到 txt2img / img2img / inpaint / extras**。来源：[modules/ui.py](https://github.com/AUTOMATIC1111/stable-diffusion-webui/blob/master/modules/ui.py)
- **↩ 粘贴按钮** tooltip：**"Read generation parameters from prompt or last generation if prompt is empty into user interface."**（即"从提示词文本或上次生成恢复参数"）。来源：[modules/ui_toprow.py](https://github.com/AUTOMATIC1111/stable-diffusion-webui/blob/master/modules/ui_toprow.py)
- **批处理也能吃元数据**：img2img 的批处理有 `Parameters to take from png info` 复选组，选项为 **Prompt / Negative prompt / Seed / CFG scale / Sampler / Steps / Model hash**，并可指定 png info 目录；说明文字是"Prompts from png info will be appended to prompts set in ui"。来源：[modules/ui.py](https://github.com/AUTOMATIC1111/stable-diffusion-webui/blob/master/modules/ui.py)
- **文件名即索引**：`Images filename pattern` 支持 `[seed] [steps] [cfg] [width] [height] [styles] [sampler] [model_hash] [model_name] [date] [datetime] [job_timestamp] [prompt_hash] [prompt] [prompt_spaces] [batch_number] [generation_number] [clip_skip] [denoising]` 等，默认 `[seed]-[prompt_spaces]`。来源：[Features wiki](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/Features)
- **Save 时追加 CSV**：generated images 存到目录，"generation parameters will be appended to a csv file in the same directory"。来源同上。
- 4 个 PasteField 分组（txt2img/img2img/inpaint/extras）是把一套参数映射到多个页面的机制。来源：[modules/ui.py](https://github.com/AUTOMATIC1111/stable-diffusion-webui/blob/master/modules/ui.py)

**5) 多模型组合**
- **Extra networks**："A single button with a picture of a card on it… next to the big Generate button"，把 Textual Inversion / LoRA / Hypernetworks 统一成卡片式浏览器，**点卡片即把模型插入 prompt**。来源：[Features wiki](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/Features)
- LoRA 语法 `<lora:filename:multiplier>`；文档明确三条硬限制（都是专业人士会踩的坑）：**LoRA 不能放进 negative prompt**；该语法在生成前被抹掉，所以**不能用 `[<lora:one>|<lora:two>]` 这类 prompt editing**；**一个 batch 里有多个不同 prompt 时只会用第一个 prompt 的 LoRA**。Hypernetwork 语法 `<hypernet:filename:multiplier>`；SD2.0+ 的 LoRA 当时不受支持。来源同上。
- **Override settings** 下拉（`txt2img_override_settings`，多选）作为"临时覆盖全局设置"的旁路。来源：[modules/ui.py](https://github.com/AUTOMATIC1111/stable-diffusion-webui/blob/master/modules/ui.py)

**6) 失败 / 性能 / 诊断（面向本地显存的坦白说明）**
- `--lowvram` 的代价被明说："about **10 times slower** compared to normal operation on my RTX 3090"；`--medvram` 通过不同批处理 cond/uncond 降低显存；另有 `--medvram-sdxl`、`--lowram`、`--upcast-sampling`、`--no-half-vae`、`--opt-sdp-no-mem-attention`（"makes image generation deterministic"，即**性能与可复现性的取舍被写进参数文档**）、`--no-hashing`、`--disable-nan-check`。来源：[Features wiki](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/Features)、[Command Line Arguments](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/Command-Line-Arguments-and-Settings)
- **TAESD**：轻量 VAE 可让 `--lowvram` 下的最大生成从 1152×1152 提到 2560×2560（有小幅质量损失）。来源：[Features wiki](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/Features)
- **Prompt validation**：超长时"在文本输出框给出警告，显示哪部分被截断并忽略"。来源同上。
- Gradio 进度动画会拖慢推理（"about 10% faster when the tab with gradio is not active"），因此默认**用静态 "Loading..." 文本替换动画**，`--no-progressbar-hiding` 可还原 —— 这是"UI 性能 vs 反馈感"的显式取舍。来源同上。
- 音频通知：根目录放 `notification.mp3` 即会在生成完成时播放。来源同上。

**7) 本地 vs 云 / API-first**
- `--listen`（局域网）/ `--port` / `--share`（gradio.live）/ `--gradio-auth user:pass`、`--ngrok`。来源：[Command Line Arguments](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/Command-Line-Arguments-and-Settings)
- **API 模式**：`--api` 启动 API、`--api-auth`、`--api-log`、**`--nowebui`（只起 API 不起 UI）**、`--api-server-stop`（允许通过 API 停/重启/杀服务）。source 同上。这证明"UI 与 API 同源、可只留 API"是这类工具的成熟做法。

### 1.7 Forge / reForge

- **Forge** 定位是 A1111 的"资源管理与速度"分支，基于 SD-WebUI 1.10.1，仍是 Gradio 4；README 的 Quick List 里直接点名了这些**用户可见的开关**：GPU Weight 滑杆、**"Quene/Async Swap toggle and swap location toggle"**、Flux BNB NF4 / GGUF 量化档位与 LoRA 支持。来源：[Forge README](https://github.com/lllyasviel/stable-diffusion-webui-forge)
- **Forge 把全部显存管理标志"移除"了**（reForge README 转述并适用于 Forge2 线）："All previous CMD flags like `medvram, lowvram, medvram-sdxl, precision full, no half, no half vae, attention_xxx, upcast unet`, ... are all **REMOVED**. Adding these flags will not cause error but they will not do anything now."；默认就能在 4GB 显存跑 SDXL、2GB 跑 SD1.5。来源：[reForge README](https://github.com/Panchovix/stable-diffusion-webui-reForge)
- **性能开关默认关闭、并要求用户自担风险**，每个都写清代价：`--always-offload-from-vram`（更慢但更省显存/更安全）、`--cuda-malloc`（更快但"many users reported issues that the async malloc will crash the program"）、`--cuda-stream`（小显存上快 15%–25%，但 2060 上更容易出纯黑图、1080/2060 更容易 OOM）、`--pin-shared-memory`（配合 cuda-stream 再快 ≥20%，但**共享显存 OOM 会导致整个程序崩溃且无法动态恢复**）。来源同上。
- **"UI 被塞满"被官方当成拆分理由**：reForge 把内置扩展（HiDiffusion、Skimmed CFG、Differential Diffusion、AutomaticCFG、PixArt/StableCascade/SD3 支持等）**移出主仓库**，原文 "Since the UI got really cluttered with built in extensions, I have removed some of them and made them separate repos"。来源同上。
- **诊断做成状态表**：Forge README 用一张 `Component | Status | Last Test` 表逐项声明（Basic Diffusion/LoRAs/All ControlNets/Forge Canvas… = Normal；Microsoft Surface 触压 = Broken, pending fix；ControlNets (Union)/(Flux) = Not implemented yet；OFT LoRAs = Broken）。来源：[Forge README](https://github.com/lllyasviel/stable-diffusion-webui-forge)
- 另：Forge 把 `p.extra_generation_params.update(...)` 写进生成参数（示例里 FreeU 的 b1/b2/s1/s2 都会进 infotext），**扩展参数也会进入可溯源链路**。来源同上。

### 1.8 Fooocus

- **设计哲学原文**："similar to many online image generators like Midjourney, the manual tweaking is not needed, and users only need to focus on the prompts and images"，安装到出图"点击次数严格少于 3 次"。来源：[Fooocus readme](https://github.com/lllyasviel/Fooocus/blob/main/readme.md)
- **参数分层**：主界面只留 prompt 与图；其余全在 **Advanced** 之下，按 Midjourney/Leonardo 的对照表组织：`--style` → Advanced → Style；`--stylize` → Advanced → Advanced → Guidance；`--quality` → Advanced → Quality；`--repeat` → **Advanced → Image Number**；`--no` → Advanced → Negative Prompt；`--ar` → Advanced → Aspect Ratios；InsightFace → Input Image → Image Prompt → Advanced → FaceSwap；用户友好版 ControlNet → Input Image → Image Prompt → Advanced。来源同上。
- **功能按"对图做什么"组织**（而非按模型管线）：`Input Image → Upscale or Variation`（Vary Subtle/Strong、Upscale 1.5x/2x）、`Input Image → Inpaint or Outpaint`（Inpaint / Up / Down / Left / Right）、`Input Image → Image Prompt`、`Input Image → Describe`。来源同上。
- **预设（preset）**：default / anime / realistic，**可在浏览器里直接切换**；`--disable-preset-selection` 关闭；`--always-download-new-model` 控制切预置时是否自动下载，默认回退到 `previous_default_models` 并打印终端输出。来源同上。
- **默认值持久化**：`config.txt` 可改 `default_model`、`default_refiner`、**`default_loras: [["x.safetensors", 0.5], ...]`**、`default_cfg_scale`、`default_sampler`、`default_scheduler`、`default_positive_prompt`、`default_negative_prompt`、**`default_styles`**、各 `path_*`。文档同时警告"想清楚再改，改坏了删掉 config.txt 即恢复默认"。来源同上。
- **批量与变体（不用网格也能做扫描）**：
  - **Array Processing**：`[[red, green, blue]] flower` 会"**为每个元素生成一张图**"（示例明确说要生成 3 张就把 image number 提到 3）；**数组不能嵌套**，支持 inline LoRA 作为数组元素。
  - **Wildcards**：`__color__ flower`，从 `wildcards/color.txt` 随机取（**随机性由 seed 决定**），在 Developer Debug Mode 下可勾 "Read wildcards in order" 改为**按顺序**取；可嵌套组合。
  - **Inline LoRAs**：`flower <lora:sunflowers:1.2>`。
  来源同上。
- **元数据开关**：`--disable-metadata` 关闭元数据保存；另有 `--disable-image-log`、`--disable-enhance-output-sorting`、`--disable-analytics`、`--disable-server-log`。来源同上。
- **失败/性能提示写得非常"产品化"**：明确最低 4GB VRAM + 8GB RAM、必须开启虚拟内存（并给出截图指引与 40GB 磁盘要求）、**指出 Nvidia 驱动 >532 有时比 531 慢 10 倍**并给出回退链接、报 `MetadataIncompleteBuffer`/`PytorchStreamReader` 即模型文件损坏需重下、`RuntimeError: CPUAllocator` 的处理。来源同上。
- **i18n 是配置文件级**：`language/*.json` 只需 `{"Generate": "生成", ...}`，用 `--language` 指定；若无 `--language` 但存在 `language/default.json` 则永远加载它。来源同上。
- 项目状态：**LTS、只修 bug、无迁移到新架构的计划**（并推荐 Flux 用户转向 Forge / ComfyUI / SwarmUI）。来源同上。

### 1.9 SwarmUI

- **自我定位的双入口**（对"专家工作台 + 大众工作台"的取舍极其有参考价值）："Beginner users will love Swarm's primary **Generate tab** interface… Advanced users may favor the **Comfy Workflow tab** to get the unrestricted raw graph, but will still have reason to come back to the Generate tab for convenience features (image editor, auto-workflow-generation, etc) and powertools (eg Grid Generator)." 并有 **`Use This Workflow`** 按钮把自定义 Comfy 工作流带回 Generate tab。来源：[SwarmUI README](https://github.com/mcmonkeyprojects/SwarmUI)
- **参数设计原则（原文）**："SwarmUI is designed on the principle of **exposing all the parameters to you, but making them approachable**"，具体三条：① 所有参数**分组**，组可开合，相关的地方有开关滑杆；② **每个参数旁边有一个紫色 `?` 图标，点击弹出解释和示例**；③ "Lock in your `Seed` to a constant one before trying to avoid unrelated changes."（把 seed 固定住再调参，作为方法论写进引导）。来源：[Basic Usage](https://github.com/mcmonkeyprojects/SwarmUI/blob/master/docs/Basic%20Usage.md)
- **布局细节**：Generate tab 底部有 **Models** 标签（左侧文件夹树 + 模型列表，**视图可在卡片/缩略图/列表间切换**），也可点信息栏上的模型名调出**快速下拉**；底部标签区与主区域之间的分隔条**可拖动收起**。来源同上。
- **Grid Generator（批量比较）**：`Tools` tab → 选 `Grid Generator` → 可命名 → 选一个轴 → 自己填值或**点右侧按钮填示例值** → "You'll notice a new axis box is available automatically. **You can add as many as you want.**" → 点 `Generate Grid`（**该按钮会替换掉 `Generate Image`**，切回空白工具即恢复）→ 点输出链接边生成边看。来源同上。
- **多后端与自动分摊**：`Server → Backends` 可加多个 ComfyUI（同机多卡就改 GPU ID）、A1111、`Swarm-API-Backend`（远端）；"your first generation goes to the first backend, your second to the second one, etc."，大 batch / 连点 Generate / grid 会自动铺开到所有后端。**已知限制**：自定义 Comfy 工作流 tab **只用第一个 Comfy 实例**。来源同上。
- **组合式能力**：文生图 + IP-Adapter + 图生视频可以同时开，"generally trust Swarm will automatically figure out how to combine them appropriately"，出问题再提 issue。来源同上。
- **内置提示词 DSL（能力最全的一家，含区域与自动局部重绘）**：`<weight[1.1]:...>`（并支持 Ctrl+↑/↓ 调权重）、`<alternate:cat, dog>`/`<alt:...>`、`<fromto[0.5]:cat, dog>`、`<random:red|blue>`（**"seeded by the main seed - so if you have a static seed, this won't change"，可用 `Wildcard Seed` 参数覆盖**）、`<wildcard:animals,not=cat,dog>`（**带输入自动补全**）、`<setvar[color]:...>` / `<var:color>`、`<setmacro[...]>` / `<macro:...>`、`<trigger>`（**从模型/LoRA 元数据里自动填触发词**）、`<repeat[3]:cat>`、`<embed:filename>`、`<lora:filename:backbone:textenc>`、`<preset:name>`、**`<param[CFG Scale]:1>`（可直接改 UI 参数，也能 `<param:CFG Scale>` 回读；支持按 `<refiner>`/`<base>`/`<video>`/`<segment:...>` 分区）**、`<segment:face,0.6,0.5>`（**CLIPSeg / YOLOv8 自动分割 + 局部重绘**，模型自动下载，支持 `yolo-model-1` 指定第 N 个检测、`<segment:face|hair>` 合并组）、`<clear:background>`、`<break>`、`<region:x,y,w,h,strength>`、`<object:x,y,w,h,s1,s2>`（区域 + 自动 inpaint 回贴）、`<base>` / `<refiner>` / `<video>` / `<videoswap>` / `<extend:frames>` / `<comment:...>`。来源：[Prompt Syntax](https://github.com/mcmonkeyprojects/SwarmUI/blob/master/docs/Features/Prompt%20Syntax.md)
- **它自己承认这些的边界**（诚实度值得学）：权重对 T5 系模型"效果很差"，对 LLM 文本编码器"因模型而异，很多模型完全无效果"；区域提示"小区域可能被忽略，区域逻辑对模型的作用相当弱"，且 MM-DiT 模型（SD3/Flux）"只在早期步响应区域，后期完全忽略"。来源同上。
- **错误引导**：出问题先看界面里的错误信息，否则去 `Server → Logs` tab。来源：[Basic Usage](https://github.com/mcmonkeyprojects/SwarmUI/blob/master/docs/Basic%20Usage.md)

### 1.10 Krita AI Diffusion（把 AI 塞进已有编辑工作流的反向设计）

- **设计目标原文**（对"创意用户"的诉求表述得最清楚）："**Precision and Control** — Creating entire images from text can be unpredictable…restrict generation to selections, refine existing content with a variable degree of strength, focus text on image regions…"；"**Workflow Integration** — *Most image generation tools focus heavily on AI parameters.* This project aims to be an unnoticed tool that integrates and synergizes with image editing workflows in Krita. Draw, paint, edit and generate seamlessly **without worrying about resolution and technical details**."；"**Strong Defaults** — Versatile default style presets allow for a **streamlined UI**." 来源：[Krita AI Diffusion README](https://github.com/Acly/krita-ai-diffusion)
- **形态**：不是独立应用，而是 Krita 的 **docker 面板**（Settings ‣ Dockers ‣ AI Image Generation）；不装本地后端时可 **Configure 连接云端**（Interstice Cloud）。后端是 ComfyUI（可用自建/远端）。来源同上。
- **Workspaces（按任务切换的界面模式）**：Generate / **Upscale** / **Live** / **Custom Graph** / **Animation**，用 docker 左上角的切换按钮切换。来源：[First Steps](https://docs.interstice.cloud/basics)
- **生成即预览 + 显式 Apply**：结果**先作为画布预览**，常用"同一输入生成多张、挑最好的"；结果进 generation history 供快速挑选与比较；点 Apply 或双击缩略图才把结果作为**新图层**叠上去。文档解释这个"反直觉"的设计理由："generally ends up more efficient than explicitly discarding all unwanted results." 来源同上。
- **动作用语义命名而非参数命名**（极重要的一条）：strength < 100% 时按钮从 **Generate** 变成 **Refine**；画布上有选区且 strength=100% 时按钮变成 **Fill**。来源同上。
- **Upscale workspace**：超分模型 + 倍率；"Refine upscaled image" 会**分块（tile）逐块生成**以处理 4K+；`Image guidance` 让输出更贴近原图；**`Tile overlap` 用来消除拼接缝**（代价是更慢）。来源同上。
- **Live workspace**：为实时性牺牲质量，UI 简化，画/改参数即刷新预览；**"In live mode it [seed] is kept constant, so the image only changes when your input does. Modify the seed to get a different variation."** —— 这是"默认锁 seed"作为交互前提的最佳例证。来源同上。
- **Control Layers**：`Add control layer` 建立涂鸦/线稿/深度/姿态等控制层（README 附截图列表：Scribble / Line art / Depth / Pose）；**Regions** 用图层划分区域并分别给文字描述；**IP-Adapter** 做参考图/风格迁移/换脸。来源：[README](https://github.com/Acly/krita-ai-diffusion)、[docs 首页](https://docs.interstice.cloud/)
- **队列与历史（README 的 Features 列表）**：**"Job Queue: Queue and cancel generation jobs while working on your image."** 与 **"History: Preview results and browse previous generations and prompts at any time."** 来源：[README](https://github.com/Acly/krita-ai-diffusion)
- **Custom Graph**：作为 ComfyUI 的扩展点，可自定义工作流并**从 Krita 传入画布/图层/选区**，"You can also build custom UI for parametrization!"。来源：[First Steps](https://docs.interstice.cloud/basics)
- **显存与分辨率处理**：本地建议 ≥6GB VRAM（"Otherwise generating images will take very long or may fail"）；插件哲学是"用户不该为了 AI 而牺牲画面质量"，因此**自动裁剪/缩放**以适配技术约束，把分辨率细节留给高级用户。来源：[README](https://github.com/Acly/krita-ai-diffusion)、[First Steps](https://docs.interstice.cloud/basics)
- 云端语义：远程 ComfyUI server 亦可（"Using a remote server is also possible this way"），本地 server 已在运行时自动连接。来源：[README](https://github.com/Acly/krita-ai-diffusion)

### 1.11 云机型 UI：ThinkDiffusion / RunDiffusion

**ThinkDiffusion（本质是"按小时租一台带 UI 的机器"）**
- 启动决策是**三选**：UI（A1111 或 SD.Next）× SD 版本（SD1.5 / SDXL）× 机器档位（**FAST 16GB $0.50/小时**、**RAPID 24GB $1.50/小时**）。来源：[ThinkDiffusion FAQ](https://learn.thinkdiffusion.com/thinkdiffusion-faqs/)
- **Auto-stop 计时器**：启动前用 🔼/🔽 设定上限（默认 1 小时），顶栏 `STOP` / `➕ CHANGE` 随时调整，剩 10 分钟给警告，**提前 STOP 会把剩余时间退回余额**。来源同上。
- **多机与协作**：`My Machines` 侧栏 → `↗️ Launch another machine`，可开任意多台；"Any device logged in can launch and manage the same machines in real-time"。来源同上。
- **计费语义**："Your credits only run down when you have a machine actively running"；卖点原文是"a dedicated VM workspace that will be consistently fast…**letting you do your work uninterrupted and not wasting time in a public queue**"。来源同上。
- **持久化文件面板**：内置文件浏览器 = 个人持久云盘，"files will stay persistent across all sessions & machines"；支持建文件夹、复制文件链接、从本地上传模型/扩展、按 URL（如 Civitai）或 Google Drive 传大模型；**非 Pro 会员 48 小时无活动会被清空**，Pro 无上限。来源同上。
- **设置跨机持久 + 恢复默认的路径**：A1111 的 Prompt styles（`../user_data/a1111/configs/styles.csv`）、Settings（`config.json`）、UI 元素默认值（`ui-config.json`，路径 `Settings > Defaults > View changes > Apply`）、Quicksettings 列表（`Settings > User interface > Quicksettings`）全部持久；并明确"若平台更新了默认值而你有自定义 config，需要删掉自定义文件再起新机器才会生成新默认"——**这是一条真实的版本/配置冲突处理规则**。来源同上。

**RunDiffusion（云上的 ComfyUI 外壳）**
- 界面更新后：**左侧栏把 Queue、Node Libraries、Workflows、Model Library 放进可折叠面板**；Settings 在左下；顶左是 Workflow / Edit / Help 下拉菜单；顶右保留 Manager、**收藏自定义节点列表**、Hide Menu。来源：[RunDiffusion 界面说明](https://www.rundiffusion.com/comfyui-interface-on-rundiffusion-april-23-2025)
- **平台特有图标**（云外壳的价值所在）：**Server Manager**、**Civitai Downloader**、**Manage Multiple Sessions**，位于最左侧。来源同上。
- 文档坦言 UI 变动会让"旧教程全部失效"（"if you can't find what they're clicking, you're not wrong—it moved"），说明**云外壳的 UI 变更成本会转嫁为用户困惑**。来源同上。
- 启动流程：选 Open Source Apps → ComfyUI → 选硬件与会话时长 → Launch。来源同上。

### 1.12 扩展案例：Regional Prompter / ControlNet（A1111 生态）

- **核心做法是把"分区"编码进提示词文本**：`BREAK` 分隔区域，`ADDROW`/`ADDCOL` 触发 2D 分区（从左上角起按列/行切），`ADDBASE`/`ADDCOMM` 声明基座/公共段；`Divide ratio` 支持比例（`1,2,1`）或像素（`300,100,112`），`;` 分隔符自动激活 2D 模式；`Base ratio` 设置基座提示的混合权重（如 0.2 → `20%*BASE + 80%*REGION`）。来源：[Regional Prompter README](https://github.com/hako-mikan/sd-webui-regional-prompter)
- **可视化与模板生成**：输入区域比例 → 点按钮让区域显示出来 → **把生成的 prompt 模板复制粘贴到输入框**；"Overlay ratio" 可在 inpaint 时加载目标图查看区域。来源同上。
- **mask 模式**：手绘或用外部图上传 mask，颜色体系是 `HSV(degree,50%,50%)` 按最大间距依次取色（`0,180,90,270,...`）；mask 以 `{preset}.png` 存在扩展目录 `regional_masks/`；**最多 360 个区域**；特殊编号 `-1` 用于擦除。来源同上。
- **两种计算模式的取舍被表格化**：Attention（默认，"Normally, use this one"）vs Latent（更慢，"generation time is the number of areas × the generation time of one pic"，但能把 LoRA 分离到不同区域）；文档还解释精度差异（512×512 时 Attention 在 U-Net 深处区域只有约 8×8 像素，Latent 是 64×64 因而精确）。来源同上。
- **能力不匹配用矩阵表回答**（这是"多模型聚合"最该学的沟通方式）：`Model × Mode` 表，Z-Image/Krea2/Anima 对 Latent/Attention/Region LoRA 分别标 ○ / △ / ×，并对 △ 与 × 给出原因（"Region LoRA still names blocks the way the U-Nets do, so it has nothing to match on these models and does nothing"）；另有 `Mode × Client` 表（A1111/Forge/reForge × Attention/Latent/LoRA），△ 的注脚是"Supported, but may not function properly with large batch sizes. Depends on VRAM."。来源同上。
- **API 暴露是一串位置参数**：`alwayson_scripts: { "Regional Prompter": { "args": [True,False,"Matrix","Vertical","Mask","Prompt","1,1,1",...] } }`，文档给出 **20 个位置**的完整编号表（含默认值）。来源同上。
- **元数据**：README 明确 "Setting parameters saved in PNG info"。来源同上。
- **已知问题公开列出**（含 workaround）：gradio 导致 mask 连续上传两次失败、Latent 模式 LoRA 损坏（给出 4 条缓解路径）、BREAK 数与区域数不匹配导致 `IndexError: list index out of range`。来源同上。

### 1.13 后处理步骤：Magnific / Topaz / Upscayl

**Magnific（API schema 可证；前端界面未能抓取，⚠️未验证其滑杆布局）**
- 异步：提交返回 `task_id`，可轮询或用 `webhook_url`；状态 `CREATED / IN_PROGRESS / COMPLETED / FAILED`。来源：[Upscaler Creative API](https://docs.magnific.com/api-reference/image-upscaler-creative/post-image-upscaler)
- **参数深度（全档位）**：`scale_factor`（2x/4x/8x/16x，越高越慢）、**`optimized_for`（9 种场景：standard / soft_portraits / hard_portraits / art_n_illustration / videogame_assets / nature_n_landscapes / films_n_photography / 3d_renders / science_fiction_n_horror）**、`prompt`（"Prompt to guide the upscale process. **Reusing the same prompt for AI-generated images will improve the results**"）、`creativity` / `hdr` / `resemblance` / `fractality`（四个都在 **-10 ~ +10**，默认 0，分别对应"AI 创造力 / 细节与清晰度 / 与原图的相似度 / 提示词强度与每平方像素的复杂度"）、`engine`（automatic / magnific_illusio / magnific_sharpy / magnific_sparkle）、`filter_nsfw`。来源同上。
- **错误结构对前端友好**：400 的 `application/problem+json` 返回 `{message, invalid_params:[{field, name, reason}]}`（例：`Parameter 'page' must be greater than 0`）——**字段级错误定位**，适合直接渲染到表单对应字段。来源同上。

**Topaz Photo（批处理与"设置复制"）**
- 批量：导入多图或直接拖文件夹；**Autopilot** 逐图自动分析并套用最佳滤镜（每张图左下角绿点表示 Autopilot 生效），"Once the analysis on the first file is complete, click Select All checkmark in the filmstrip, then click Export Images"，Autopilot 会接着处理队列中其余文件。来源：[Topaz Photo Batch Processing](https://docs.topazlabs.com/topaz-photo/functions/batch-processing)
- **手动模式的两条复用路径**：① `Apply > Current Settings to Selected Images`（在一张上调好 → Ctrl+A 或 Shift 点选 → 右键/filmstrip 三点菜单 → 应用），"This is best for batches of images that are shot in similar conditions or created the same way"；② `Apply > Preset > [preset]`（把已保存的 Preset 应用到多张）。来源同上。
- 单图也可覆盖 Autopilot："simply make any manual edit. Once you change a setting, those manual settings will be used for that image."（**逐图覆盖全局自动决策**）。来源同上。

**Topaz Gigapixel（File List = 元数据表格化的画廊）**
- **File List 在预览下方**，可用拖拽分隔线、左箭头按钮或 `View > Show/Hide file list` 展开收起。来源：[File List](https://docs.topazlabs.com/topaz-gigapixel/functions/file-list)
- **列即溯源信息**：Name（按导入顺序）、Original size、**Scale & Output size**、**AI model**（Auto mode 生效时显示闪电图标）、**Settings**（各模型参数值，悬停显示更多细节）、**Face Recovery**。来源同上。
- 批处理：`+ Add image` 继续加图；**用 checkbox 多选一次给多张设值**；"Batches are only limited by your system's hardware"，出问题就减少每次数量。来源同上。
- 批处理前置设置：先到 `Preferences > Upscale and Resize > Set output size`（Scale / Width / Height / Longest）与 Output Resolution，再导入。来源：[Gigapixel Batch Processing](https://docs.topazlabs.com/topaz-gigapixel/functions/batch-processing)
- **Compare 工具（并排比较的正确形态）**：位于 AI models 列表顶部或 hover 模型名；弹窗让用户**最多选 4 个模型**（2–3 个也行）；点击 Compare 后**视图按窗格分割，每格显示一个模型的结果**，蓝色描边标示当前活动窗格；可点击窗格后用右栏模型头换模型；右上角有导航控件、右下角缩放控件；点窗格右上角 `╳` 移除；不足 4 个时左下角有 `+ Add model to compare`；满意后点 `Apply model`。来源：[Compare](https://docs.topazlabs.com/topaz-gigapixel/functions/compare)

**Upscayl（批量的反面教材）**
- 有 **Batch Upscayl**（选择文件夹批量处理）；可选 GPU ID（多卡时指定用哪张，Windows 需把系统设为高性能模式否则会被覆盖）。来源：[Upscayl README](https://github.com/upscayl/upscayl)
- **取消语义明确是坏的**（FAQ 原文）："I stopped the magic Batch Upscayl and my images haven't been processed, compressed, or are in the wrong scale! — When a model doesn't support an action, **Upscayl will finish upscaling all the images first before post-processing them.** What this means is that you should simply **wait** for the process to finish." 来源同上。
- 其它可借鉴点：模型可扩展（`custom-models` 仓库）、有 CLI 版（`upscayl-ncnn`）、明确说明能力边界（"cannot de-blur or do focus adjustment"，给了正例图库 `COMPARISONS.MD`）、硬件门槛单列（Vulkan GPU 必需，多数核显不可用）、文档站结构（Introduction / Troubleshooting / Logs / 4 个 API 端点）。来源同上、[Upscayl Docs](https://docs.upscayl.org/introduction)

### 1.14 元数据 / 溯源 / 提示词复用（跨工具的横向专题）

**A1111 生态的事实**（见 §1.6 第 4 点）：PNG tEXt 参数块；`PNG Info` 页 + 一键发送到 txt2img/img2img/inpaint/extras；批处理按 png info 取参（可勾选 Prompt/Negative prompt/Seed/CFG scale/Sampler/Steps/Model hash）；文件名 pattern；同时写 CSV；prompt 注释不写入元数据。

**ComfyUI 的事实**（见 §1.1 第 4 点）：PNG tEXt / 动画 WebP EXIF / MP4-WebM 容器 tag / safetensors；`workflow` + `prompt` 双字段；拖回画布恢复；`--disable-metadata`；非签名、不含依赖、重编码易丢。

**Civitai：把跨生成器的元数据统一成一套库**（`@civitai/generation-metadata`，README 明确说 parsers "extracted from the civitai.com app"，并有真实图片语料做行为锁定）
- **支持的生成器与存放位置**（这是目前公开资料里最完整的一份对照）：
  | 生成器 | 容器 | 元数据位置 |
  |---|---|---|
  | Automatic1111（及兼容：Forge、站内 civitai） | PNG、JPEG | `parameters` 文本块 / EXIF UserComment |
  | ComfyUI | PNG、WebP、JPEG(legacy) | `prompt` + `workflow` chunk / EXIF Model tag / UserComment JSON |
  | SwarmUI | PNG | `parameters` 里的 `sui_image_params` JSON |
  | RuinedFooocus | PNG | `parameters` 里带 `software` 标记的 JSON |
  并强调"Detection order matters (formats overlap) and is preserved from the original app implementation"。来源：[@civitai/generation-metadata README](https://unpkg.com/@civitai/generation-metadata@0.4.0/README.md)
- **统一后的 `raw` 结构**（schema-backed 字段）：`prompt`、`negativePrompt`、`sampler`、`steps`、`cfgScale`、`seed`、`clipSkip`、`hashes`（`model`/`vae`/`lora:NAME`/`embed:NAME`）、`resources`、`additionalResources`、`civitaiResources`、`comfy`、`version`、`engine`、`extra`；**其余一律作为 passthrough key 原样保留**（如 `'Model hash'`、`width`、`'Denoising strength'`、`'AddNet Module 1'`、ComfyUI 的 `models`/`vaes` 数组）。来源同上。
- **采样器名归一化**：单一 `samplerMap` 表，形状为 `A1111 显示名 → [原生别名]`（如 `'Euler a' → ['euler_ancestral']`），只单向使用（ComfyUI/SwarmUI/RuinedFooocus 解析器用别名反查并改写成 A1111 名，karras 时带 `_karras` 重试）；A1111 解析器不用它。可传入空 Map 关闭归一化。来源同上。
- **"缩放/转码会静默毁掉元数据"是它存在的理由**，写入侧提供 `copyMetadata(originalFile, resizedBytes)`（**基于源图的 raw tags 重新嵌入，不依赖解析结果**，因此对 parser bug 免疫、能保留自己都解析不了的元数据）；并有明确的往返保真表：JPEG→JPEG **字节无损**；PNG→PNG 文本块原样重嵌；JPEG↔PNG 互转有规定路径；**任何格式 → WebP 直接抛错**（"Metadata writing is not supported"，建议先用 `canEmbedMetadata()` 判断）。来源同上。
- **可粘贴文本解析**：`parseGenerationText` 解析 A1111 风格的 `parameters` 字符串（即"copy generation data"格式），产出与读文件**同一个 envelope**；但警告"anything that parses is labeled `generator: 'automatic1111'`（无法可靠判断来源工具），所以不要把粘贴路径的 tool 当作权威"。来源同上。
- **两个明确的反模式警告**：① **"三个不同的东西都叫 workflow"**：`raw.workflow` 是字符串（civitai 的工作流名，如 `txt2img`）、ComfyUI 的工作流 JSON 在 `raw.comfy`、`MetadataPayload.workflow` 才是 PNG 的 `workflow` chunk —— 命名碰撞是可追溯性事故。② **A1111 格式是开放式**，扩展会加任意 `Key: value`，所以统一层用 **denylist（`a1111ExcludedKeys`）而不是 allowlist**，否则会静默丢参数。来源同上。
- 工程化附带：真实图片 fixture 语料（每个 generator 若干张 + `.expected.json`）、`bless` 流程（CI 从不自动 bless，"a changed expectation is always a reviewed, deliberate decision"）、可拖图检查的 playground、issue 模板可把原图自动 ingest 成 fixture。来源同上。

**W&B（团队/训练侧的对照物，用于"运行对比"）**
- Project 的 tab 结构：**Overview / Workspace / Runs / Automations / Sweeps / Reports / Artifacts**。来源：[W&B Projects（现托管于 CoreWeave Docs）](https://docs.coreweave.com/products/wandb/track/project-page)
- **Workspace**：个人的可视化 sandbox，用于"compare experiments…working on the same problem with different architectures, hyperparameters, datasets, preprocessing"；**Runs sidebar** 提供每个 run 的：操作菜单（重命名/删除/停止活跃 run）、**可见性眼睛开关**（决定哪些 run 出现在图上）、**颜色**、**搜索**（按名搜索并同时过滤图）、**Filter**（缩小可见 run 集合）、**Group**（按某个 config 列动态分组，"Grouping makes plots show up with a line along the mean value, and a shaded region for the variance"）、**Sort**（如按最低 loss 排序，"Sorting will affect which runs show up on the graphs"）、**展开成完整表格**、折叠快捷键、以及"N selected / 总数"的计数（默认图只显示前 10 条，可在图设置里调）。来源同上。
- **Runs tab**：列可**拖拽排序、Pin、Hide**，可一次显示/隐藏/固定多列；可按多列**优先级排序**；可写**过滤表达式**；可**Group**；对 Runs tab 的自定义会**同步反映到 Workspace 的 Runs selector**。来源同上。
- **Artifacts**：有 Versions（多版本切换）、Metadata、Usage（含下载代码片段 + 产出它的 run 与使用它的 run 链接）、Files（`requirements.txt`、`wandb-metadata.json`、`wandb-summary.json` 等）、**Lineage（"shows run types as blocks and artifacts as circles, with arrows to indicate when a run of a given type consumes or produces an artifact"）** ——**这是"产物血缘图"的最佳参考实现**。来源同上。
- Reports：把多张图 + markdown 存成快照分享（"Add notes to run workspace" 也可加 markdown 面板）。来源同上。
- Sweeps 与 Automations 是训练侧的自动化（本报告不展开）。来源同上。

---

## 2. 横向归纳：超能力工具反复出现的 12 个模式

> 每条后面括号里是来源工具，链接见 §5。

**P1 三段式空间分工：参数区 / 运行与队列区 / 结果（画布+资产）区**
- ComfyUI：左侧栏（资产·节点·模型·工作流·模板）+ 顶右"运行与队列控制区" + 中央画布。
- InvokeAI：三个并列工作流（t2i / i2i / Canvas）+ 独立 queue tab + Gallery Panel。
- fal：模型页 tab（Playground | API）+ Sandbox 独立画布区 + 底部 prompt bar（含成本）。
- SwarmUI：中央结果 + 底部 Models/参数卡 + Tools（Grid Generator）。
- A1111：生成参数列 + 输出面板（gallery/generation_info/infotext/html_log 四件套）。
→ **队列和结果是两个不同的"地方"，不是一个东西。**

**P2 "参数分组 + 分组级开关 + 逐参数内联说明"是长期唯一可行解**
- SwarmUI 原文把它写成设计原则（分组、开关滑杆、紫色 `?` 弹说明）。
- A1111 的 `InputAccordion`（勾选即启用整组）与扩展的 `Accordion(open=False)`。
- ComfyUI 的节点 widget + Subgraph 的参数面板（重排/隐藏）。
- Fooocus 把所有非 prompt 的东西压进 Advanced。
→ 深度不靠"把滑杆都摊开"，靠"分组 + 按需展开 + 就地解释"。

**P3 参数应当由 schema 驱动，UI 只是 schema 的视图之一**
- fal：Playground 表单**由 input schema 自动生成**；`API` tab 展示完整 input/output schema 与类型；同一份值可在 **Form / JSON / Python / JS / cURL** 之间切换，且生成的代码"包含你在表单里配置的全部参数"。
- ComfyUI：模板把模型依赖写进节点 `properties.models`（name/url/directory），加载时据此校验与下载。
- A1111：`PasteField` 把每个 UI 组件映射到 API 字段名（`api="cfg_scale"` 等），同一个参数表同时服务 UI、PNG info 与 API。
→ 我们做聚合网关时，**Catalog 的 capabilities 应当是唯一的参数事实源，表单/JSON/代码/元数据都是它的投影**。

**P4 "预设 / 配方（preset / recipe / style）"是让长参数表可复用的手段**
- A1111：`styles.csv` + Styles 下拉 + 一键应用。
- Fooocus：`config.txt` 的 `default_*` + 三种 preset（可在浏览器切换）。
- SwarmUI：Presets + `<preset:name>` 语法可随机选预置。
- Krita：自定义 presets（自定义 checkpoint/LoRA/sampler）。
- Topaz：Presets 页 + `Apply > Preset` 到批量。
- fal：**Model sets**（State of the Art / Anime / Fast / 自定义）。
→ 配方不只是"参数集"，还要能带**模型版本**（SwarmUI 的 `<trigger>` 从模型/LoRA 元数据自动填触发词就是这个思路）。

**P5 队列是可管理对象，不是一个进度条**
- ComfyUI：Queue = 工作流历史队列；每项有状态；异常取消逻辑被修过。
- InvokeAI：Cancel current / Clear queue / Pause / Resume / Open queue + 计数徽章。
- fal：`queue_position`、logs、`inference_time`、`error_type`、priority、hint、永不丢弃的承诺、最多 10 次自动重试。
- Replicate：完整状态机 + 截止时间 + Web URL。
- ThinkDiffusion：卖点就是"不排公共队列"（用专用机器替代队列）。
- 反例：A1111（只有 Interrupt/Skip，无可视队列）、Upscayl（中途停会烂尾）。

**P6 取消语义必须区分"排队中 / 执行中"，而且要和计费挂钩**
- fal 写得很直白：`IN_QUEUE` 取消=立刻移除、永不执行；`IN_PROGRESS` 取消=只发信号，"may still complete if the app does not handle cancellation"。
- ComfyUI：pending 用 `deleteItem`，running/initialization 用 `interrupt` —— **混用会导致静默失败**（PR #7788 的案发经过）。
- Replicate：`aborted`（从未开始）不计费，`canceled`（已开始）**要付已运行时间**。
→ 我们的"取消"按钮必须在 UI 上区分这两种状态，并在二次确认里说明积分扣法。

**P7 生成元数据写进产物本身，并且要能"再注入"**
- A1111：PNG tEXt 参数块 + PNG Info 页 + 发送按钮。
- ComfyUI：覆盖 PNG/WebP/MP4/WebM/safetensors 多种容器，存 `workflow` + `prompt` 两个字段。
- Civitai：跨 4 种生成器的统一解析 + `copyMetadata` 解决"缩放/转码丢元数据"。
→ 反面：任何"元数据只在数据库、不随文件走"的架构，会在导出、转发、二次编辑时断链。

**P8 结果不是终点，而是下一步的输入（显式动作链）**
- InvokeAI：`Send to Image to Image`、`Send to Unified Canvas`、`Load Workflow`、`Remix Image`（**全部设置但不含 seed**）、`Use Prompt`、`Use Seed`、`Use All`。
- fal Sandbox：hover 结果 → `Use as input`（自动切到兼容 operation）。
- ComfyUI：把生成的图拖回画布即恢复工作流。
- A1111：PNG Info 页 → 发送到 txt2img/img2img/inpaint/extras；paste 按钮从 prompt 或上次生成恢复参数。
- Krita：结果需显式 Apply 成为新图层，可叠多张后擦除不需要的部分。
- Topaz：`Apply > Current Settings to Selected Images`。
→ **"保设置但不保 seed"（Remix）与"全部照抄"（Use All）必须是两个不同按钮。**

**P9 比较是独立功能，不能靠人眼记忆**
- A1111：X/Y/Z plot（X=列、Y=行、Z=批次）+ Prompt S/R。
- SwarmUI：Grid Generator（轴可任意增，按钮会替换 Generate Image）。
- Topaz Gigapixel：Compare 最多 4 个模型并排、窗格可换模型、`+ Add model`、`Apply model`。
- fal Sandbox：同 prompt 跑多模型 + 结果上标 Fastest / Cheapest / Free + 成本徽章三色阈值。
- W&B：Runs 表（列可 pin/hide/拖拽、多列排序、过滤表达式、Group）+ Workspace（眼睛开关/颜色/分组均值与方差阴影）。
→ 聚合网关天然要"同一提示词横向比多个模型"，这是**差异化卖点**而非附属功能。

**P10 Seed 家族（随机/固定/变体/分辨率/批量扫描）是专业度的分水岭**
- A1111：seed 输入 + **"Extra" 勾选展开 Variation seed/strength 与 Seed resize**；`🎲 / ♻️ / ⇅` 三个图标；X/Y/Z plot 直接扫 seed；prompt editing 与权重实现变更导致**历史 seed 结果变化**（专门开 wiki 页记录）。
- Fooocus：wildcards 与数组的随机性**绑定 seed**，可 `Read wildcards in order` 改变为顺序取；`--repeat` = Image Number。
- SwarmUI：`<random:>`/`<wildcard:>` **由主 seed 播种**，另有 `Wildcard Seed` 覆盖（并提醒用户"如果你发现随机项不变但 seed 在变，检查是不是误开了 Wildcard Seed"）；`<param[Seed]:...>` 可按区域/阶段分别设 seed。
- Krita Live：**默认锁死 seed**，因为实时预览的前提是"只有我的输入在变"。
- InvokeAI：`Remix Image` 明确排除 seed。
→ 建议做成 **seed 策略枚举（固定 / 随机 / 递增 / 微调 ±N / 沿用父任务）**，而不是一个裸数字框。

**P11 多后端 / 多模型的调度与配额本身就是产品级 UX**
- fal：并发随充值提升（新号 2 → 自助上限 40）、per-endpoint 限流、`X-Concurrency-*` 响应头、`priority`（**per-user per-endpoint**，用户之间仍公平）、`hint` 亲和路由、`X-Fal-No-Retry`、**排队不计费**。
- Comfy Cloud：**Partner Node 并发（按终身付费分档，且 ≥$5/次的模型并发降为 1/4）与 Cloud job 并发是两套独立限制**，"有效吞吐受先到者约束"；429 vs 403；价格徽章前置。
- SwarmUI：多后端自动铺开；**但自定义 Comfy 工作流只用第一个实例**（能力与调度的耦合限制必须写出来）。
- RunDiffusion：把 `Server Manager` / `Manage Multiple Sessions` 做成一级图标。
→ 聚合网关必须显式区分"**积分余额**"与"**并发额度**"两件事（Comfy 文档专门用 FAQ 解释这个混淆），并把"排队等待不扣积分"作为文案写清楚。

**P12 失败与性能提示要出现在 UI 里，而不是只躺在文档里**
- SwarmUI：每个参数一个 `?`；错误一般显示在界面，否则 `Server → Logs`。
- A1111：超长 prompt 在文本框下方警告并指出被截断的部分；`--lowvram` 的 10× 慢写在文档；`notification.mp3` 完成提示。
- Fooocus：驱动版本、虚拟内存、模型损坏、CPUAllocator 都写进 README 并给截图。
- Forge：把风险开关默认关闭并写明"崩了别报 bug"；用 Status 表声明哪些功能不可用。
- Magnific API：400 返回字段级 `invalid_params`。
- fal：`error.body` 透传底层校验（如"ensure this value is less than or equal to 8"），且有独立的 `error_type`。
→ "**可解释的失败**"比"更多的重试"重要。

---

## 3. 综合判断：对「多模型聚合网关 + 积分计费」的取舍

### 3.1 值得抄进「智能创作」页（且能服务创意用户）

| # | 借鉴点 | 具体参考实现 | 为什么适配我们 |
|---|---|---|---|
| B1 | **Schema 驱动的动态参数表单 + 表单/JSON/代码三视图** | fal Playground 的 input-mode selector；API tab 展示完整 schema 与类型 | 一个页面同时服务创意用户（表单）与集成方（代码），减少两套 UI |
| B2 | **参数分组 + 分组级开关 + 逐参数内联说明** | SwarmUI 的紫色 `?`；A1111 `InputAccordion` | 参数多而不乱；`?` 就是最省成本的知识沉淀 |
| B3 | **统一"规范输入"层 + 显式字段别名与值变换表 + 兼容性校验徽章** | fal Sandbox 的 canonical input / 别名表 / ✓⚠✕ℹ | 与本项目 Catalog `capabilities` JSONB 的设计目标完全一致，fal 已把工程细节公开 |
| B4 | **队列即工作区**：pending/running/completed 分段 + 位置 + 逐项取消 + 暂停/恢复 + 全部清空 + 重试 | InvokeAI QueueActionsMenu（5 个动作）；fal queue_position/priority | 批量出图是漫剧的常态，队列必须有管理面 |
| B5 | **明确区分 start_timeout / request_timeout / client_timeout** | fal 的三行对照表 | 避免"点了一次没反应"与"任务被莫名杀掉"两类投诉 |
| B6 | **成本前置 + 结果徽章 + 免费额度可见** | fal Sandbox 的绿/黄/红阈值、Fastest/Cheapest/Free | 积分计费平台的核心信任机制；Comfy 也把价格徽章放在节点上 |
| B7 | **元数据随产物走 + 可再注入（copy/re-embed）** | A1111 PNG info、ComfyUI 多容器、Civitai `copyMetadata` | 直接服务 AGENTS.md 的"资产唯一事实源"与"可审计" |
| B8 | **结果即输入的动作链** | InvokeAI 的 Send to i2i / Send to Canvas / Remix（不含 seed）/ Use All | 分镜→资产→视频天然需要"上一环节产物作为下一环节输入" |
| B9 | **比较视图（网格 + 并排）+ 可配置"轴"** | SwarmUI Grid Generator（轴可任意加）；Topaz Compare 4-up；W&B Runs 表 | "同一提示词比多个模型"是聚合网关的独有卖点 |
| B10 | **预设/配方可保存-加载-分享，并携带模型与 LoRA 版本** | A1111 styles.csv、Fooocus config.json、SwarmUI presets + `<trigger>` | 与"项目级角色库 + 模型目录"互补 |
| B11 | **模型卡 = 价格 + 时延 + schema + 示例** | fal 模型页组织；Replicate Versions tab | 让"选哪个模型"变成可比较的决策 |
| B12 | **能力不匹配要给矩阵表，不要静默降级** | Regional Prompter 的 ○/△/× 表 + 理由；Forge Status 表；Sandbox 校验图标 | 多模型聚合必然遇到"这个模型不支持这个参数" |
| B13 | **intent-named 动作（Generate → Refine → Fill）** | Krita 按 strength/选区自动改按钮文案 | 比"denoising strength=0.6"对创意用户友好一个数量级 |
| B14 | **"取消"要分状态且与计费规则挂钩** | fal 的 IN_QUEUE/IN_PROGRESS 取消语义；Replicate aborted vs canceled 计费 | 积分平台的退款/扣费争议源头就在这里 |

### 3.2 太专家化 —— 不要作为创意用户的默认界面

| # | 专家专属设计 | 出处 | 我们的替代方案 |
|---|---|---|---|
| E1 | 节点图编辑器本身 | ComfyUI / SwarmUI 的 Comfy Workflow tab | 我们已有「无限画布」；智能创作页只提供"挑好的工作流模板 + 表单"，不做节点默认视图 |
| E2 | 全量参数平铺（30+ 滑杆） | A1111 txt2img 参数列 | 基础/进阶/专家三层，默认只露基础 |
| E3 | 显存/精度/卸载开关 | A1111 `--medvram/--lowvram`、Forge 的 fp8/attention、reForge 的 `--cuda-stream` | 云网关里这些对用户无意义；改暴露"质量 / 速度 / 成本"三档，由后端映射 |
| E4 | 文本 DSL（BREAK/ADDROW、`[a:b:0.5]`、`<random:>`） | Regional Prompter、A1111 prompt editing、SwarmUI 语法 | 用结构化 UI（分区、分镜、镜头、角色槽位）表达同样语义 |
| E5 | 原始 XY/Z 三轴网格与 `1-10 [5]` 这类区间语法 | A1111 X/Y/Z plot | 保留"轴"概念，值用下拉/芯片（chip）选择，预设几组常用扫描 |
| E6 | Seed resize / variation strength 的数值 | A1111 Features wiki | 映射成意图按钮："保持构图 / 换姿势 / 换表情 / 完全新构图" |
| E7 | 自定义 Python、自定义节点依赖管理 | A1111 `--allow-code`、ComfyUI Custom Nodes | 平台侧白名单 + 官方模板，不做用户级依赖安装 |
| E8 | 默认展开的原始 runner 日志 | fal 把 `with_logs` 做成可选参数本身就是证据 | 默认折叠，失败时自动展开相关片段 |
| E9 | 手动 mask 配色体系（HSV 取色） | Regional Prompter | 用命名区域 + 画笔/套索 + 图层名，不让用户记颜色 |
| E10 | 多后端/多机管理与 GPU ID 选择 | SwarmUI Backends、Upscayl GPU ID、RunDiffusion Server Manager | 完全后端化，用户只看到"并发 / 排队"两个概念 |

### 3.3 反模式清单（专业人士真正抱怨的，均有来源）

| # | 反模式 | 证据 |
|---|---|---|
| A1 | **把关键队列操作藏进二级菜单** | ComfyUI：`Clear All Queue` 被移到 `view job history` 里，用户开 issue 要求恢复（+1×2） |
| A2 | **同一个"取消"按钮对不同状态用同一个 API，导致部分状态静默失败** | ComfyUI PR #7788：pending 任务取消无声失败，日志才写原因 |
| A3 | **停止批处理会产生不完整/尺寸错误的产物，且没有提示** | Upscayl FAQ：必须先 upsample 全部图再后处理，"just wait" |
| A4 | **UI 被内置扩展塞满** | reForge：把内置扩展拆出主仓库，理由原文是 "the UI got really cluttered" |
| A5 | **同一概念多个名字** | Civitai 包警告"三个不同的东西都叫 workflow"（`raw.workflow` / `raw.comfy` / PNG chunk） |
| A6 | **封闭式 allowlist 会静默丢扩展参数** | Civitai 选择 denylist 的理由：A1111 格式开放，扩展加任意 `Key: value` |
| A7 | **重编码/缩放静默丢元数据** | Civitai 写 `copyMetadata` 的存在理由；ComfyUI 文档明说重编码会丢 |
| A8 | **兼容性靠口口相传** | Regional Prompter 需要 ○/△/× 支持表；Forge 需要逐组件 Status 表 |
| A9 | **多后端/自定义工作流的能力限制没写在 UI 上** | SwarmUI：自定义 Comfy 工作流只用第一个实例 |
| A10 | **成本不透明 / 不前置** | 反向正例：fal 的成本徽章三色阈值、Comfy 的节点价格徽章与负余额 FAQ、fal 的逐请求 billing-events |
| A11 | **冷启动无提示** | Replicate 必须用文档解释冷启动"有时要几分钟"；UI 上不标注就会被当成卡死 |
| A12 | **取消后仍计费/仍产出却不告知** | fal：IN_PROGRESS 取消"may still complete"；Replicate：canceled 仍按已运行时间计费 |
| A13 | **平台更新默认值后与用户自定义配置冲突** | ThinkDiffusion：需删除自定义 `config.json` 才能拿到新默认；并发提示要用户自己处理 |
| A14 | **云外壳 UI 频繁变动导致旧教程全部失效** | RunDiffusion 专文说明"你找不到按钮不是你的错，它被移走了" |

---

## 4. 落到「智能创作」页的最小可执行清单

> 结合 AGENTS.md 的约束（前端只走 BFF、`capabilities` JSONB 声明能力、禁止硬编码参数映射、execution 锁定任务快照）。

1. **参数面板**：从 `capabilities` 生成表单；分三档（基础/进阶/专家）+ 分组开关 + 每字段 `?`；右上角提供 `表单 | JSON | 代码` 三视图（代码仅集成方可见）。
2. **运行区**：Generate 按钮旁边就是队列入口（计数徽章），点击展开右侧队列抽屉：`排队中 / 运行中 / 已完成 / 失败` 四段，逐项取消（**按状态调用不同接口**）、全部清空、暂停/恢复、重试（**保留原参数**）与"改参数再跑"（复制到表单）。
3. **成本**：提交前显示预估积分（按 capabilities 里的单价 × 数量），三色阈值；结果卡上标"最省 / 最快"；明确写"排队等待不消耗积分"。
4. **复用**：产物卡片右键 = `用作输入` / `发送到局部重绘` / `发送到放大` / `沿用全部参数` / **`沿用参数但换 seed`** / `仅用提示词` / `仅用 seed` / `载入工作流`。
5. **溯源**：生成元数据同时写入数据库记录与文件本身；提供"重新注入元数据"能力，保证导出/转码后仍可追；对每个 job 存 **模型/渠道/参数快照**（与 execution 的"锁定计划"一致）。
6. **比较**：提供"同一输入跑 N 个模型"的并排视图，支持把某个轴（模型、采样器、步数、seed）抽成网格。
7. **配方**：预设/配方可保存、加载、分享，配方内携带模型与 LoRA **版本号**；配方的字段沿用 `capabilities` 命名，避免第二套词汇。
8. **失败**：字段级错误定位（参考 Magnific 的 `invalid_params[{field,name,reason}]`）+ 能力不匹配矩阵提示 + 日志默认折叠。

---

## 5. 未验证 / 待确认项（诚实标注）

1. **A1111 是否有可视化队列面板/重排**：官方 wiki 与 `modules/ui.py`、`modules/ui_toprow.py` 中均未出现；只有 `Interrupt`/`Skip` 与 `--no-gradio-queue`。⚠️未验证。
2. **A1111 是否有 increment/decrement seed 按钮**：未在官方来源中读到；源码只可见 `🎲/♻️/⇅` 三个符号常量。⚠️未验证。
3. **ComfyUI Queue 面板是否支持拖动重排、单条"同参重跑"**：未找到来源。⚠️未验证。
4. **InvokeAI 队列单条删除/重排**：`QueueList.tsx` 抓取 404（路径可能已变），仅从 `QueueActionsMenuButton.tsx` 确认了 5 个动作。⚠️未验证。
5. **Magnific 网页前端的滑杆/面板布局**：tutorial 页面为 GitBook JS 渲染，抓取只得到导航；结论仅基于 API schema。⚠️未验证前端形态。
6. **ThinkDiffusion 是否提供生成队列面板**：FAQ 只提到多机、文件面板、积分与设置持久化。⚠️未验证。
7. **Civitai 站内"使用生成数据"的按钮文案与交互**：文章页两次抓取失败；本条仅由其官方 npm 包 `@civitai/generation-metadata` 的 README 支撑。⚠️部分验证。
8. **W&B 官方文档域名**：`docs.wandb.ai` 的页面重定向到 `docs.coreweave.com`，本报告引用的是重定向后的页面。已在来源中注明。
9. **ControlNet 扩展本身的文档**：本次未抓取 `Mikubill/sd-webui-controlnet` 的 wiki（仅在 A1111 与 Forge 文档中作为被引用对象出现）。若要补全"多 ControlNet 组合 UI"，需另做一轮抓取。

---

## 6. 来源清单（全部为本次实际抓取）

### ComfyUI
1. [Interface Overview](https://docs.comfy.org/interface/overview)（等价 `.md`：https://docs.comfy.org/interface/overview.md）
2. [Workflow Templates](https://docs.comfy.org/interface/features/template)
3. [APP mode guide](https://docs.comfy.org/interface/app-mode)
4. [ComfyUI Workflows: Nodes, Links, and Visual Programming](https://docs.comfy.org/basic-concepts/workflow)
5. [Subgraph](https://docs.comfy.org/interface/features/subgraph)
6. [Workflow API Format](https://docs.comfy.org/development/api-development/workflow-api-format)
7. [Workflow Metadata](https://docs.comfy.org/development/api-development/workflow-metadata)
8. [Credits Management](https://docs.comfy.org/interface/credits)
9. [Partner Node Concurrency Limits](https://docs.comfy.org/tutorials/partner-nodes/concurrency-limits)
10. [docs.comfy.org llms.txt（文档索引）](https://docs.comfy.org/llms.txt)
11. [ComfyUI_frontend Issue #7319 — Clear All Queue button missing](https://github.com/Comfy-Org/ComfyUI_frontend/issues/7319)（正文经 `https://api.github.com/repos/Comfy-Org/ComfyUI_frontend/issues/7319` 抓取）
12. [ComfyUI_frontend PR #7788 — Cancel button now works for pending jobs](https://github.com/Comfy-Org/ComfyUI_frontend/pull/7788)（正文经 `https://api.github.com/repos/Comfy-Org/ComfyUI_frontend/pulls/7788` 抓取）

### fal.ai
13. [Playground](https://fal.ai/docs/documentation/model-apis/playground)
14. [Sandbox](https://fal.ai/docs/documentation/model-apis/sandbox)
15. [Workflow Endpoints](https://fal.ai/docs/documentation/model-apis/workflows)
16. [Asynchronous Inference / Queue](https://fal.ai/docs/documentation/model-apis/inference/queue)
17. [Concurrency Limits](https://fal.ai/docs/documentation/model-apis/concurrency-limits)
18. [Pricing](https://fal.ai/docs/documentation/model-apis/pricing)
19. [fal docs llms.txt（文档索引）](https://fal.ai/docs/llms.txt)

### Replicate
20. [Run a model](https://replicate.com/docs/topics/models/run-a-model)
21. [Create a prediction](https://replicate.com/docs/topics/predictions/create-a-prediction)
22. [Prediction lifecycle](https://replicate.com/docs/topics/predictions/lifecycle)
23. [Model versions](https://replicate.com/docs/topics/models/versions)
24. [Share a prediction](https://replicate.com/docs/topics/predictions/share-a-prediction)
25. [Replicate docs llms.txt](https://replicate.com/docs/llms.txt)

### InvokeAI
26. [Gallery Panel](https://invoke.ai/features/gallery/)
27. [Image Generation（含 Unified Canvas 定位）](https://invoke.ai/concepts/image-generation/)
28. [Generation Parameters（采样器收敛与低步数批量法）](https://invoke.ai/concepts/parameters/)
29. [QueueActionsMenuButton.tsx](https://github.com/invoke-ai/InvokeAI/blob/5e3d1c442c80817a03255ed0f70ce296a70eab82/invokeai/frontend/web/src/features/queue/components/QueueActionsMenuButton.tsx)
30. [UNIFIED_CANVAS.md](https://github.com/thinkyhead/InvokeAI/blob/2d5180002d5693132040214161fefee9004258c4/docs/features/UNIFIED_CANVAS.md)

### AUTOMATIC1111 / Forge / reForge
31. [Features wiki](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/Features)
32. [Command Line Arguments and Settings](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/Command-Line-Arguments-and-Settings)
33. [User Interface Customizations](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/User-Interface-Customizations)
34. [wiki Home（Seed breaking changes 索引）](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki)
35. [modules/ui.py](https://github.com/AUTOMATIC1111/stable-diffusion-webui/blob/master/modules/ui.py)
36. [modules/ui_toprow.py](https://github.com/AUTOMATIC1111/stable-diffusion-webui/blob/master/modules/ui_toprow.py)
37. [Stable Diffusion WebUI Forge（README）](https://github.com/lllyasviel/stable-diffusion-webui-forge)
38. [stable-diffusion-webui-reForge（README）](https://github.com/Panchovix/stable-diffusion-webui-reForge)
39. [sd-webui-regional-prompter（README）](https://github.com/hako-mikan/sd-webui-regional-prompter)

### Fooocus / SwarmUI / Krita
40. [Fooocus readme](https://github.com/lllyasviel/Fooocus/blob/main/readme.md)
41. [SwarmUI README](https://github.com/mcmonkeyprojects/SwarmUI)
42. [SwarmUI — Basic Usage](https://github.com/mcmonkeyprojects/SwarmUI/blob/master/docs/Basic%20Usage.md)
43. [SwarmUI — Advanced Prompt Syntax](https://github.com/mcmonkeyprojects/SwarmUI/blob/master/docs/Features/Prompt%20Syntax.md)
44. [Krita AI Diffusion README](https://github.com/Acly/krita-ai-diffusion)
45. [Krita AI Handbook — First Steps](https://docs.interstice.cloud/basics)
46. [Krita AI Handbook 首页](https://docs.interstice.cloud/)

### 云机 UI
47. [ThinkDiffusion FAQ](https://learn.thinkdiffusion.com/thinkdiffusion-faqs/)
48. [ComfyUI Interface on RunDiffusion (2025-04-23)](https://www.rundiffusion.com/comfyui-interface-on-rundiffusion-april-23-2025)

### 后处理
49. [Magnific — Upscaler Creative（API）](https://docs.magnific.com/api-reference/image-upscaler-creative/post-image-upscaler)
50. [Topaz Photo — Batch Processing](https://docs.topazlabs.com/topaz-photo/functions/batch-processing)
51. [Topaz Gigapixel — File List](https://docs.topazlabs.com/topaz-gigapixel/functions/file-list)
52. [Topaz Gigapixel — Batch Processing](https://docs.topazlabs.com/topaz-gigapixel/functions/batch-processing)
53. [Topaz Gigapixel — Compare](https://docs.topazlabs.com/topaz-gigapixel/functions/compare)
54. [Upscayl README](https://github.com/upscayl/upscayl)
55. [Upscayl Docs — Introduction](https://docs.upscayl.org/introduction)

### 元数据 / 团队运行管理
56. [@civitai/generation-metadata（README，经 unpkg 抓取）](https://unpkg.com/@civitai/generation-metadata@0.4.0/README.md)（npm 页面：https://www.npmjs.com/package/@civitai/generation-metadata）
57. [W&B Projects（CoreWeave 托管）](https://docs.coreweave.com/products/wandb/track/project-page)
