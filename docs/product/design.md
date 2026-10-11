# 镜序 Studio 前端与漫剧导演工坊设计方案

状态：前端原型已接入并完成多轮产品验收；后端能力待接入  
日期：2026-09-29  
范围：App Shell、独立无限画布、智能创作、漫剧导演工坊、镜头语言库、资产库和设置

> 2026-09-29 验收说明：本文件同时作为当前前端的产品边界和实现对照。当前可运行实现位于 `apps/web`，是 React 19 + Vite 8 + TypeScript + React Router 7 + Zustand + Tailwind 4 + Radix UI + Framer Motion + React Flow 的演示型前端。演示任务、模型、哈希和图片不是后端生产事实源。单集工坊为 7 个导航阶段 + 完成态；现有 Gate 与完成检查仅验证本地状态，真实媒体连续性、原文覆盖和文件哈希需服务端实现。

## 1. 产品边界

平台提供几种并列的创作方式，而不是把所有操作放进同一个编辑器：

- **无限画布**是独立页面，服务自由探索、节点关系和多素材编排。
- **漫剧导演工作台**只采用工坊式界面：项目、剧集、阶段任务、审核和生产。漫剧页面不出现节点画布，也不要求连线。
- 图片、视频、音频工作台负责直接生成；镜头语言库提供可引用的专业表达；资产库统一检索与追溯。
- 工作台共享模型目录、执行任务和资产服务，但各自保留领域状态。画布的节点完成不能代替漫剧 Gate 审核。

本文件描述目标产品及实现契约，并在末尾记录当前前端已落地的演示能力。早期商业立项文档（由 Owner 本地保管，不随仓库公开）曾提出 Vue 3 选型和”画布作为漫剧可选视图”，但这些描述不适用于本次已确认的前端边界。

前后端分离、领域微服务、中间件与高可用的具体实施方案见 [docs/architecture/00-technical-architecture.md](../architecture/00-technical-architecture.md)。该文档是待评审的目标架构，不表示后端服务已经建成。

## 2. 现状与复用

| 现有模块 | 可以复用 | 需要新增或调整 |
|---|---|---|
| `ai-video-shot-designer-skill` 仓库的 `SKILL.md`、`references/`、`config/workflow/` | 剧本事实、导演解读、角色/场景、Gate、版本、审核和依赖规则 | 将 CLI/文件运行时封装成服务；设计多剧集与共享资产的范围 |
| `ai-video-shot-designer-skill` 仓库的 `scripts/shotdesigner/` | 校验、图片候选、空间/镜头、台账与 Adapter | 任务持久化、并发控制、API 契约和可恢复执行 |
| `apps/web/src/layouts/AppLayout.tsx` | 侧栏、顶部导航和响应式基础 | 新导航、面包屑、通知及用户菜单 |
| `apps/web/src/pages/projects.tsx` | 筛选、列表/看板和项目卡交互 | 真正的新建剧本项目、上传与独立项目路由 |
| `apps/web/src/pages/comic.tsx` | 三栏工坊视觉和阶段原型 | 多项目/多剧集、真实阶段数据和审核动作 |
| `apps/web/src/stores/useComicStore.ts` | 原型 UI 状态 | 不再以本地 seed 数据作为生产事实源 |

当前 `apps/web` 已实现多项目/多剧集的本地演示流程，项目创建可保存本地剧本文本并拆集；图片/视频/模型仍为演示数据，不能把按钮提示或本地进度视作真实生成、批准或交付。仓库目前没有正式的 Web API 服务。上表所列旧文件是早期原型背景，不是当前前端的实际入口。

## 3. 信息架构与路由

```text
App Shell
├─ 首页                  /
├─ 无限画布              /canvas
├─ 智能创作
│  ├─ 图片                /create/image
│  ├─ 视频                /create/video
│  └─ 音频                /create/audio
├─ 漫剧导演工作台          /comic/projects
│  ├─ 项目总览/剧集管理    /comic/projects/:projectId
│  └─ 单集工坊            /comic/projects/:projectId/episodes/:episodeId/:stage
├─ 镜头语言库              /shot-language
├─ 资产库                /assets
└─ 设置                  /settings/channels、/settings/models、/settings/preferences
```

任务中心保留为全局工作流入口 `/tasks`，可在侧栏次级区或顶部通知进入。旧 `/projects` 与 `/comic` 链接在迁移期跳转到新目录或当前项目，避免书签失效；不把通用项目与漫剧项目误合并。URL 必须承载选中的项目、剧集和阶段，刷新后恢复当前位置。

单集工坊 `:stage` 枚举：`analyze`（首次解读）→ `directing`（分镜设计·镜头卡）→ `characters`（角色资产）→ `props`（道具资产）→ `scenes`（场景资产）→ `units`（单元规划·镜头→单元映射）→ `production`（视频生产）；完成态 `done` 不单独占 URL，通过剧集状态与工坊顶部徽标表达。全局 TopBar 面包屑与剧集卡阶段文案与枚举保持一致。

### 3.1 App Shell

- 左侧导航固定上述主要入口；“智能创作”展开图片/视频/音频。移动端用可关闭抽屉。
- 顶部按当前路由生成可点击面包屑，提供全局搜索、通知、设置和用户菜单；搜索至少覆盖项目、剧集、资产、镜头语言与模型，并显示对象类型。
- 通知区汇总分析失败、生成完成、待审核、连接离线和资产失效；点击回到有上下文的具体页面。
- 页面保留加载、空状态、失败重试和无权限状态；不能使用已确认的假数据占位生产状态。

### 3.2 首页

首页是可直接使用的工作区，包含最近项目及下一步、图片/视频/音频/漫剧/画布快捷启动，以及创作广场。创作广场有分类标签、搜索、排序和内容卡片；卡片说明类型、作者、适用模型/线路与可复用条件。对当前没有后端的社区数据，应使用明确标注的演示模式，不伪装成真实公开作品。

### 3.3 独立无限画布

首选 React Flow（`xyflow/xyflow`，MIT）建立独立 `/canvas`：缩放、平移、框选、连线、节点参数侧栏、自动保存、撤销/重做与运行状态。节点/边保存为版本化画布文档，执行另编译为统一任务；画布不是漫剧阶段或项目事实源。已有项目资产可以导入画布，画布结果也可以作为候选资产提交漫剧审核，但不得直接成为 canonical 版本。复杂工作流的执行语义、撤销历史及发布条件另行设计，不能依赖 React Flow 自身替代后端编排。

### 3.4 智能创作、镜头语言库与设置

- 智能创作：图片、视频、音频分别展示输入、模型/线路、能力相关参数、费用或资源预估、提交状态、历史和结果操作。音频首期明确支持语音合成及试听/下载；其他音频能力由模型目录声明，不展示不可用控件。
  - **重设计中（2026-10-10）**：见 [`docs/adr/006-smart-creation-workbench.md`](../adr/006-smart-creation-workbench.md)（状态：提议，待 Owner 确认）。要点：**参数控件由模型目录能力驱动**（换模型/改目录不再需要改前端）；保留「左输入 / 右结果」两栏骨架，但把参数收敛为输入区内的胶囊；模型不支持的能力不渲染控件。竞品对标见调研报告《中国 AI 生成产品 UX 拆解（2026-10）》（由 Owner 本地保管）。
  - **已知不一致（待 Owner 决策）**：本段要求「其他音频能力由模型目录声明」，但 `model_catalog.type` 的 DB CHECK 仅允许 `text/image/video`（`services/production/migrations/004_catalog.sql:23`），且 execution provider resolver 拒绝 `audio`（`services/execution/internal/provider/provider.go:85`）—— 音频**当前既无法由目录声明、也无法执行**。缺口登记于 [`docs/development/backlog.md`](../development/backlog.md) 第 9 项。
- 镜头语言库：分类、搜索、筛选、排序和网格/列表；新增条目包含名称、适用场景、镜头/调度参数和示例，可复制或引用到 Shot 草案，但不会改写锁定剧本。
- 设置：渠道配置、模型配置、通用偏好。**模型目录三层结构（L1 渠道 → L2 类型 → L3 能力/计费）**：渠道分**内置（平台集中接入：即梦官方 / MiniMax 官方 / Grsai 聚合 / Google Gemini / OpenAI / ComfyUI 本地·云端，保留启停与编辑、不可删除）**与**自定义（用户自建：名称/类型/鉴权方式/BaseURL，可删除，删除时级联移除其下模型）**两类；**接入协议 protocol**（连接形态，与业务来源 kind 正交）：api = HTTP API 渠道（BaseURL+鉴权+Key），local = 本地端口服务（ComfyUI/Ollama 等自托管，host:port 可达、通常无鉴权；表单动态：本地端口时字段切换为「服务地址」、鉴权自动 none、隐藏 API Key 输入，编辑弹窗 none 时同样隐藏令牌区仅保留清除入口；内置 ComfyUI 渠道 protocol=local）；通道归一化：探测/执行对裸 host:port 自动补全 http:// 前缀；workspace user_channels 表新增 protocol 列（004 迁移）+ CRUD 透传（store/handler/BFF）。**正式化**：API Key 经 workspace 服务 AES-GCM 加密存储（只写不读、不回显；WORKSPACE_CRED_KEY 未配置时 fail-closed 拒绝存储）；连通性检测由 **execution 服务**以唯一一份实现发起真实 HTTP 探测（前端 → BFF 转发 → execution；无凭据=网络层可达性，有凭据=鉴权层，结果如实上报，不再模拟通过）；探测走 SSRF 防护（netguard）：环回/私网/链路本地等默认拒绝，且**如实报告为「被出站策略拒绝」**而非伪装成网络故障（如为本地开发放开，需 `EXECUTION_ALLOW_PRIVATE_UPSTREAM=1`）；模型按类型分文本/图片/视频，各类型内再按能力与计费分化（文本：推理/流式/系统提示词/MaxTokens/Temperature/输入输出积分每百万 Token；图片：参考图/比例数/清晰度档/积分每张；视频：生成方式/最短最长秒/参考图与音频上限/积分每秒起），同类型内按起步单价低到高排列。**模型表单四段式**（基础信息[模型名/模型标识 providerModel/渠道/家族/排序/介绍] → 请求配置[模型级请求路径+方法，执行时=渠道 BaseURL+模型路径，解决同一渠道下不同模型端点不同] → 能力配置[按类型动态显示] → 参数配置[provider 特有 key-value 模板，透传执行器，解决厂商请求字段差异 quality/resolution/top_p 等]），模型卡片摘要展示端点/ID/参数数；模型列表支持多选/全选/批量删除（与渠道页一致）。**模型路由字段已入库**（005 迁移：model_catalog 新增 provider_model/request_path/method/params 4 列 + CHECK method；后端 Model/ModelPatch/store Create/Update 透传，前端 addModel/updateModel 提交新字段；id 规范统一 mod_ 前缀 + 24 字符，前后端校验一致，前端新增模型按规范生成 id，编辑/停用/删除 PUT 不再 404）；**渠道删除级联清凭据**（workspace deleteUserChannel 先删 channel_credentials 再删 user_channels，孤儿 Key 不再残留）。**模型表单迭代**：编辑弹窗隐藏类型选择（编辑什么模型就是什么类型，openEdit 锁定 tab）；参数配置拆为「请求参数（透传执行器）」+「响应参数（响应字段映射，可选，006 迁移 response_params 列，执行器对已知 provider 用内置解析、异构返回时用此模板提取 content/taskId/imageUrl）」两组；两者均支持粘贴 JSON 批量导入（对象 {"k":"v"} 或数组 [{key,value}]，导入即替换，失败 toast 保留原值）；存量内置模型 id 非 mod_ 格式（gemini-3.1-flash-lite 等），PUT 校验放开兼容存量，新模型仍强制 mod_+24。单一事实源 `src/config/models/model-catalog.ts`（平台默认共享目录）；凭据演示环境不持久化，连接测试为假调通（baseUrl 非空且 authType≠none → 通过，标注"真实鉴权待接入"）。接真实模型后：目录迁移 production 服务（`channels`+`model_catalog` 表，版本化留档；已实现并 seed 对齐）、用户凭据归 workspace 租户域（加密注入）、execution 按目录做 provider 路由（六适配器骨架已实现，无凭据时明确报错不假装调通）。前端设置中心三态数据源（server → offline-fallback → demo，BFF 不可达自动降级并显示徽标）；已锁定执行目标（模型+容量+衔接快照）不受目录变更影响。Secret 只写/替换，不向前端回显。**协议模板独立实体（007 迁移：protocol_templates 表 + 7 条内置模板 seed + model_catalog 关联列 protocol_template_id）**：协议（端点/请求方法/请求参数/响应映射）从模型表单中独立为可管理的**协议模板**——平台预置 7 条（OpenAI 兼容 Chat/Images、MiniMax 文本、MiniMax 视频异步、即梦图片、即梦视频异步、Grsai 聚合网关转发、ComfyUI 本地工作流）+ 用户自定义，二者同表（builtin 区分，内置禁删可停用可复制为自定义，被引用禁删 409、内置删除 400）。设置中心新增「协议配置」页 `/settings/protocols`：模板 CRUD 四态 + 多选/全选/批量删除 + 内置徽标 + 引用计数（ref_count 子查询）+ 复制为自定义 + 启停 + version 递增（改一次 +1，审计留痕）。**模型只引用不复制**：模型表单的协议选择器改由 store.templates 驱动，选中模板自动带出 requestPath/method/params/responseParams 且写入 form.protocolTemplateId 落库；编辑态显示「当前协议」只读提示（修改协议请到协议配置），模型级高级配置仍可折叠覆盖。**改一处模板 → 所有引用模型自动生效**（引用关系存模型行，不拷贝协议字段）。前后端：production `/internal/v1/catalog/protocol-templates` POST/PUT/DELETE（handler+CatalogStore+postgres CRUD，Directory 返回 templates 带 ref_count），BFF `/api/v1/catalog/protocol-templates` GET/POST/PUT/DELETE 全通（catalogProxy 放开 DELETE）；前端 client.ts 3 个模板 API + store upsertTemplate/removeTemplate + persist version 3（migrate/merge 补 templates）；ParamEditor 提取为公共组件 `src/components/ParamEditor.tsx`（模型页/协议页复用，JSON 导入保留）。**协议请求预览（轻量版，无服务端改动）**：新增公共组件 `src/components/ProtocolPreview.tsx`，把「渠道 BaseURL + 模型/协议 method+requestPath+请求参数+响应映射」渲染为真实请求形态（请求行 / Headers / Body JSON / 响应解析说明），Key 一律打码（sk-********）不回显。入口两处：协议页每张卡片「预览请求」按钮（渠道 BaseURL 占位标注）；模型页编辑弹窗底部「预览请求」按钮（用当前表单值 + 所选渠道实时渲染，含协议模板引用提示）。用于接入真实模型前自查协议模板设计（URL 拼接/参数结构/响应提取路径是否合理），为 execution 执行器消费做前置验证。**响应解析三层分工（用户批准的三步实施）**：模板层（用户可配）只做静态映射 + 协议形态声明，执行器层（平台内置）做异步轮询状态机/条件分支/内嵌二次解析，Provider 直连层全内置。据此（1）**响应参数升级三列**：字段路径（支持 `choices.0.message.content` 等点路径）+ 类型（string/number/bool/object/array Select）+ 说明/默认值，ParamEditor 增加 `mode="response"` 分支（协议页编辑弹窗响应区已启用；JSON 导入同受支持）；（2）**协议模板新增异步任务声明区**（`async` jsonb：enabled + taskIdField/statusField/doneValue/failValue，008 迁移；内置即梦视频 async=task_id/status/SUCCESS/FAILED、MiniMax 视频 async=Success/Failed；后端 Go model/postgres 三层透传 + Validate 校验；前端 client/store 透传，协议页编辑弹窗新增「异步任务模式」折叠区（Switch + 四字段），卡片显示「异步任务」徽标）；（3）**预览升级异步流程示意**：ProtocolPreview 在请求区上方渲染「提交 → 取 task_id → 轮询 status → =done 完成 / =fail 失败」流程块，模型页预览自动带所引协议模板的 async。已验证端到端：改 async 保存 → DB version+1 + async 落库；编辑弹窗异步区/响应三列/卡片徽标/预览异步流程均经浏览器实测。**协议与模型的关系（重新思索后确立）**：协议模板 = **请求契约（Schema）**——端点/方法/异步形态/响应契约 + **参数规格表**；模型 = **协议的实例化参数**——引用模板（protocol_template_id），只补模板不知道的实例值（providerModel/能力/覆盖值）；执行器 = **装配器**——渠道 BaseURL + 路径 + 三类参数拼成真实请求。**请求参数来源三分类**（ModelParam 升级 role/type/required/desc，010 迁移升级内置 OpenAI Chat 为文档完整规格 14 参数）：`static` 静态默认（模板存值直传：temperature/top_p/max_tokens/n/stream/presence/frequency/stop/tool_choice/response_format）、`model` 模型注入（执行器填 providerModel：`model` 字段由此而来）、`runtime` 运行时注入（执行器按业务构造：`messages`/`tools`/`user`）。前端 ParamEditor 请求模式每行加「来源 Select（静态/模型/运行时）+ 类型徽标 + 必填星标」，JSON 导入支持扩展格式；预览 Body 按来源三分类渲染（static 真值 / model 显示 `<模型标识>` 或当前 providerModel / runtime 显示构造占位说明），并加来源图例；模型页预览传入 providerModel 使 model 注入字段显示真值。由此解决"数组字段（array 是类型不是值）与 model 字段（注入字段）在静态 key-value 中必然缺失"的结构性问题。**execution 装配引擎闭环（真实 HTTP 执行）**：execution 服务新增 `internal/engine`（装配执行核心）、`internal/catalog`（production 目录客户端）、`internal/creds`（workspace 凭据客户端），新增同步测试端点 `POST /internal/v1/tasks/run`（BFF `/api/v1/tasks/run` 经 tasks proxy 透传，dev-local 补 BFF_EXECUTION_URL）。执行流程：modelId → 目录解析（模型行 + 渠道 + 协议模板）→ 渠道凭据 reveal（workspace AES-GCM 解密，只在本进程内物化）→ 引擎按来源三分类装配 Body（static 模板默认值（模型级 params 按 key 覆盖）/ model 注入 providerModel / runtime 取请求业务值，缺失 runtime 字段省略不发送）→ 真实 HTTP（authType bearer→Authorization 头、none→无头；async 模板明确报错拒绝同步测试）→ 按响应映射点路径提取（支持 `choices.0.message.content`、`data.0.url` 等数组索引）→ 返回 status/extracted/rawBody/duration（Key 永不回传）。上游 4xx/5xx 如实返回不假装成功。**配套修复**：production CreateModel 空 method 默认 POST（对齐 DB CHECK）；**011 迁移删除 model_catalog→model_channels 外键**（channel_id 改逻辑引用：用户渠道[workspace user_channels+凭据]与内置渠道[model_channels]均可挂模型，运行期由 execution 解析）。前端模型页每张卡片新增「测试」按钮 → 测试弹窗（模型摘要：渠道/协议/provider ID/端点；runtime JSON 可编辑；「发送真实请求」→ 结果块：成功/失败徽标 + HTTP 状态 + 耗时 + 响应映射提取 + 原始响应体折叠）。已端到端实测：pearapi 渠道（chan-muo4b9zo，Key 加密）挂 OpenAI Chat 协议模型（providerModel=deepseek-v3.2）→ execution 装配 → api.pearapi.ai/v1/chat/completions 真实返回 → 8 个映射字段提取成功（HTTP 200 · ~3s），浏览器测试弹窗全链路验证通过。**协议分类型（012 迁移：protocol_templates 加 type 列 text/image/video/all）**：协议声明适用模型类型（与模型三类 tab 对齐），内置归属 OpenAI 兼容 Chat/MiniMax 文本→text、OpenAI 图片/即梦图片/ComfyUI→image、MiniMax 视频/即梦视频→video、Grsai 聚合网关→all（全类型通用）；后端 Go model/postgres 三层透传 + Validate 枚举校验（CreateTemplate 缺省 all、async 缺省 {}）；前端协议配置页顶部类型 Tab（全部/文本/图片/视频 + 计数）、卡片类型徽标（text 主色/image 翠绿/video 琥珀/all 紫）、编辑与新建弹窗「适用类型」Select；模型页协议下拉按当前模型 tab 过滤（type===tab 或 all 显示）——图片 tab 只见图片协议、视频 tab 只见视频协议，杜绝视频模型误选文本协议。**模型表单协议覆盖视图（编辑/添加弹窗一致化）**：修复编辑态协议下拉缺失（openEdit 补 protocolTemplateId、submit base 补协议字段、协议 Select 移出 !editingId 条件两态常显）；高级配置·请求参数改为**协议基线覆盖视图**（新组件 `src/components/ProtocolParamOverrides.tsx` 两栏：左字段列 key+类型/来源徽标+说明+协议默认值，右覆盖列 150px——static 可覆盖（幽灵输入 hover 浮现、覆盖后主色描边+「已覆盖」徽标+RotateCcw 恢复按钮、清空=恢复跟随模板），model/runtime 只读「由执行器决定」；「本模型新增参数」区独立增删；无模板时降级虚线提示）。**模型只存覆盖不复制**：保存仅落模型级覆盖值（实测 DB params=[{"key":"temperature","role":"static","value":"0.3"}]，未复制协议 14 参数全量），协议变更全局生效；编辑重开覆盖值回显、预览请求合并渲染（协议基线+模型覆盖）均闭环。**配套修复**：mergedParams 覆盖逻辑 bug（Map 副本不写回数组 → 预览恒显示模板默认值，改为 findIndex 直接替换数组元素）；CreateTemplate async 缺省 {}（NULL 违反 NOT NULL 导致 INTERNAL）。协议预览/测试链路实测：文本 tab 下拉仅 OpenAI Chat/MiniMax 文本/Grsai；图片 tab 仅 ComfyUI/OpenAI 图片/即梦图片/Grsai；视频 tab 仅 MiniMax 视频/即梦视频/Grsai；编辑 PearAPI 文本模型覆盖 temperature=0.3 保存 → DB 落覆盖 → 重开编辑回显 0.3 → 预览 Body temperature 0.3（模板默认 top_p=1 共存）。

## 4. 漫剧项目到剧集

### 4.1 项目管理与新建

项目列表有数量、状态筛选、搜索、最近编辑/进度排序、网格/列表切换以及“新建剧本项目”。项目卡显示封面、标题、集数、当前阶段、实际进度、待确认数和下一步；点击进入该项目，不跳转到固定示例。

新建弹窗字段：剧本标题、视觉风格库选项（可搜索和预览、记录风格版本）、剧本文件上传、**默认模型（第 4 步：默认图片/视频模型，预填应用全局默认 `settings.preferences`，创建时写入项目默认值，之后在项目参数页继续调整）**。支持的文件格式、大小和编码需由服务端校验；首期建议 UTF-8 TXT、DOCX、PDF，扫描件需 OCR 能力才可接收。上传时展示校验、进度、失败重试；只在服务端保存并计算原文哈希后创建项目卡。上传的原文作为不可变源版本，后续修改通过新增完整剧本版本，不在编辑器原地覆盖。

视觉风格选择先记为项目的**待确认规格**；不能因为选择了库项就把所有具体造型/场景建议自动批准。新项目状态为待解析，保留上传原件和重试入口。

### 4.2 项目总览与剧集拆分

首次进入项目时，以 `projectId + sourceVersion` 作为幂等键启动剧集解析任务：上传源文件 -> 提取文本 -> 标注候选剧集边界/标题/顺序 -> 完整性校验 -> 待用户核对。页面用任务事件显示真实状态和当前步骤，动画仅作为进度表现；刷新、离开或再次进入不会重复提交。失败时给出原因并允许针对同一源版本重试。用户可调整候选边界和名称，但不可改写、遗漏或重排源文本；**每个候选卡提供「查看原文片段」折叠预览**（展示该候选 `sourceSpan` 对应的源剧本原文，修改起止边界时实时跟随，便于判断切点；范围为空时红字提示），锁定后生成稳定剧集 ID 和剧集卡。

项目总览上部是整体进度与阻塞项，中部是剧集卡列表，侧栏或下方展示项目资产库和参数：画面比例、视觉风格、默认图片模型、默认视频模型。默认模型只是新任务的预设，单次可选其他**已配置且能力兼容**的模型；已提交任务固定模型、Adapter、线路和参数版本。

**视觉风格可随时切换**：项目参数中视觉风格为**紧凑参数项**（当前风格缩略图 + 名称 + 版本，点击触发 `StylePickerDialog` 风格库弹窗）；弹窗内提供**搜索 + 封面网格 + 滚动**（风格库可随时扩充至数十种仍可容纳），点击卡片立即切换并记录新风格版本；切换时该项目下已生成/已确认的旧风格资产自动 `markStale`（标记待复核/重新生成），并 toast 提示受影响资产数。

**源版本迭代（专业修订）**：项目头部提供「修订原文」入口（拆集解析中禁用），弹窗内查看版本历史（v1/v2… 字数与当前标记）并编辑全文；保存时以新文本追加为下一源版本（旧版本文本/哈希/时间原样留档可追溯），切换 `currentSourceVersion` 后清空该项目的旧剧集投影、状态回到 `pending_parse` 并按新版本自动重新拆集（候选待核对，拆集 seed 含版本号保证不同版本产生独立候选）；旧版本的解读/资产/生产产物不会迁移到新版本。项目资产库允许按角色/道具/场景、来源剧集及“全局”标签筛选。

### 4.3 剧集卡

剧集卡展示集号、标题、原文范围、场次/角色/待审核项、阶段与下一步。剧集与场次、Shot、Unit 是不同层级；拆分剧集不等于镜头规划。新剧集首次打开时启动对应源版本的导演分析，已存在结果时直接恢复该阶段。项目进度是按已确认产物与真实生产状态汇总的投影，不凭页面访问次数或定时器增长。

## 5. 单集导演工坊

固定布局：顶部为项目 > 剧集 > 当前阶段及任务/保存状态；左侧是阶段导航和阻塞指示；中央处理一个明确的决策任务；右侧检查来源、产物版本、依赖和待确认项。小屏将右侧收进抽屉。导航可以浏览已形成的内容，但未通过前置 Gate 时生成/推进按钮不可用并说明阻塞原因。

### 5.1 首次解读

解读前置为三步：**① 剧本核对 → ② 模型设置（执行目标）→ ③ 导演解读**。

① **剧本核对**：展示本集剧本（源版本切片，显示源版本号与哈希；范围过短/越界时兜底展示），用户查看并判断是否编辑。源剧本为不可变版本，本集编辑保存为**草稿新版本（未锁版）**，不覆盖源文本；编辑后必须重新核对。**已有解读产物时，保存草稿自动展示「剧本草稿变更影响预览」**：按本集实际存在的下游产物动态列出（导演解读 / 表演基调 / 场次状态变体 / 调度镜头 / 可执行单元与 Prompt / 生产 Take）及失效状态，由用户决定「重新解读本集」（清解读与导演产物、旧资产标 STALE，草稿保留）或「暂不处理，保留现状」——系统不自动清空产物，未同步前解读与草稿不一致由界面明示。

② **模型设置（执行目标）**：未确认不启动解读任务。执行目标语义是**选平台 / 交付方式**；模型选项从模型目录实时派生（enabled 视频模型，按起步单价低到高），容量上限是模型能力属性（目录 `maxDurationSeconds`：MiniMax H3 15s、Seedance 2.5 30s），只约束单元打包，**不绑定创作粒度**——选 30s 模型也可用 12s 单元。模型初始预选**项目默认视频模型**（项目管理页可设置默认图片/视频模型；默认只是新任务预设），工坊内可按需调整，已确认后仍可修改。目录增删/启停模型即时反映到执行目标选项；执行目标确认时快照模型+容量+衔接，不受后续目录变更影响。

解读按顺序运行并逐步展示真实任务事件：剧本解析 → `EV/DLG/LOCK` 提取 → `director_analysis` → **视觉基调与情绪弧线（look & feel：影调 / 情绪曲线 / 节奏 / 参考）** → **场次清单确认（scene breakdown）** → **剧本覆盖与初步单元（PLANNED，两段式）** → 登记资产草案与导演产物。

**剧本解析层（Script IR · 事实/创作分层）**：剧本解析器 `src/config/script/script-parser.ts` 从本集原文用**确定性规则**提取事实层（EV 事件 / DLG 对白 / LOCK 场景·道具连续性 / 场次清单 / 字幕），供用户核对、100% 可追溯；提取不到的内容如实标注为 unparsed，禁止伪造。导演解读（文本模型）只基于事实层做**创作决策**（视觉基调 / 情绪弧线 / 节奏 / 节拍），提示词显式注入【剧本事实层（解析产出，只可引用不可改写）】段——事实层不依赖模型幻觉，创作层不重复提取事实，两层串联不冲突（详见反例库与「用户口径」两段式确认）。analyze 页按两段展示：① **剧本核对区**（解析产出：EV/DLG/LOCK + 场次清单，标注「解析产出 · 供核对」）；② **导演解读区**（创作产物：解读原文 + 视觉基调 + 覆盖/节拍，标注「文本模型产出 · 质量交用户评审」）。

**覆盖两段式**：① **节拍分段（创作层 · 容量无关）**——导演按戏剧需要决定叙事节拍、自然时长与边界理由，不随模型变化；② **容量映射（平台层 · 受模型上限约束）**——节拍打包进单元（≤ `maxUnitSeconds`），容量不足时增加单元、不压缩剧情；同时给出映射后计划总时长与**容量无关的忠实呈现下限**。

解读保留“原文事实 / 连续性约束 / 导演建议 / 未决项 / 用户决定”边界和引用。解读完成停留在解读页，用户核对全部产物后**确认解读**才进入角色资产阶段；确认绑定解读版本，**自动生成不是 `approve`**。导演解读失败时留在可重试状态，不能空白跳页。重试解读只重建草案，不静默覆盖已有版本、审核状态或 `STALE` 标记。已确认的执行目标**可修改**：修改只重映射平台层（覆盖单元 / 可执行单元 / 导演容量项如镜头数与节奏表），创作层（视觉基调 / 场次清单 / 剪辑方案）保留，容量相关项退回待复核；不作为“重新解读”清空产物。历史数据未确认执行目标时显示“未确认”并要求补选后推进，不冒充已确认。

**视频衔接（生成单元参考图组合方式）**：四层解析——① 平台默认 `src/config/rules/transition-policy.ts`（v1.0，默认「开启首尾帧」，随规则版本化）；② 项目默认「视频衔接（默认）」位于项目管理页参数区（与默认视频模型同区，即时保存 `Project.defaultTransitionMode`，可随时更换）；③ 执行目标锁定：analyze 模型设置卡片内嵌衔接选择（继承项目默认、可调），随执行目标确认写入 `ExecutionTarget.transitionMode`，作为「模型 + 容量 + 衔接」本集执行契约；④ 单元级覆盖：units 阶段每单元「高级 · 视频衔接」折叠项（跟随执行目标 / 不衔接 / 开启首尾帧），写入 `UnitItem.transitionMode`，标题行徽标标注生效模式与「· 覆盖」态。衔接语义：不衔接 = 仅用当前镜头自己的首帧或参考图；开启首尾帧 = 当前视频结尾参考下一个分镜首帧（i2v 优先「当前首帧 + 下个分镜首帧」首尾帧，多参模式把下个分镜首帧作为额外参考图）。与连续性台账互补：台账决定参考图来源（上单元真实尾帧 → 本单元，逆向），衔接模式决定组合方式（顺向参考下单元首帧）；不建议放入规则中心 / 设置页 / 风格库。

### 5.2 角色资产

角色清单由本集解读生成，显示来源场次、角色身份条件、当前资产、提示词和待确认原因。准确的生产顺序为：

```text
内部角色分析（仅校验） -> 选角简报确认 -> 中性演员候选/用户选定
-> 场次造型状态确认 -> 组件需求确认 -> 服装/面料/穿着效果、发型/配饰、妆容候选选择
-> 角色定妆融合选择 -> 四视图确认
```

除造型外，角色阶段同时确认**角色表演基调**（声音气质 / 肢体特征 / 情绪基线 / 人物弧线，每角色一条，由解读派生）。表演基调决定“怎么演”，与定妆（长什么样）相互独立，是后续表演/声音方案的上游；由用户逐项评审，系统不判断质量。

用户可针对当前范围点击“重新解读”，生成新草案并显示差异及下游影响；也可手动编辑可编辑的建议/Prompt 字段。两者都必须保存新版本并重新校验，不允许直接修改已批准产物。图片生成使用项目默认或用户选择的已配置模型；未配置图片线路时提供可复制的单图 Prompt 和外部结果导入，不将模型配置作为剧本分析的门槛。

批量勾选是在每个对象前置需求均获批准且模型兼容时，将多个独立任务一起提交；列表逐行显示费用预估、执行/失败/候选/待选择状态，失败可单项重试。单角色操作等价于一个任务。API 返回图片只登记候选，用户选择后校验文件和哈希，才可成为对应角色、状态的 canonical 资产。

### 5.3 道具资产

道具作为场景/镜头资产独立于角色组件，记录源事件、出现剧集/场次、持有者、接触手、位置及状态变化。用户核对规格、Prompt 和候选后选择版本。道具无需强制为每个场次生成新图，但使用中的状态差异必须显式建模。标记“全局”表示本项目内可复用的批准版本，不自动批准别的剧集的剧情用法；跨集引用仍保留版本和来源，变更时显示受影响范围。道具确认后进入场景阶段。

### 5.4 场景资产

依次展示场景功能稿、无人场景母版、从母版派生的补充视图、**场次状态变体**（同一空间的 时间 / 天气 / 光线 / 氛围 差异，逐项确认）、空间骨架 `scene_map`。每一步有预览、来源依据、可编辑建议、重新生成、候选选择和版本确认。场景母版决定外观，`scene_map` 决定边界、锚点、通行区和方位；工坊中的俯视空间图仅是由 `scene_map` 派生的确认投影，不是独立“无限画布”。场景共享按连续空间识别，不机械按剧情场次复制。人物走位与机位方案属于「分镜设计」阶段（镜头卡在资产前声明参考资产需求），不在此确认。

### 5.5 后续生产（拆为三个独立阶段）

#### 5.5.1 分镜设计（directing）

吸收「AI 标准化单镜头分镜模板」23 模块归并为**镜头卡 8 域**，产出**分镜表**（镜头卡矩阵，每镜一份完整世界快照，不依赖 AI 跨镜记忆）：

- **域 1 基础信息**（auto 自动派生）：场次 / 故事时间 / 地点 / 天气 / 画幅 / 预计时长
- **域 2 参考资产**（auto 自动绑定）：角色 / 场景 / 道具 / 风格参考（绑定 canonical 资产，跨镜画风统一）
- **域 3 镜头内世界状态**（director 必填）：人物位置 / 朝向 / 情绪 / 服装道具状态 / 场景状态 / 前置因果——防瞬移与崩道具的关键
- **域 4 核心视觉事件与动作链路**（director 必填）：唯一主视觉事件 / 触发条件 / 动作步骤 / 完成标志 / 收尾定格
- **域 5 人物表演与对白**（director 必填）：情绪强度 / 神态 / 呼吸 / 对白原文（不可增删改写）
- **域 6 摄影与构图**（director 必填）：景别 / 构图 / 焦段 / 相机运动 / 运镜目的 / 机位区域
- **域 7 光影·物理·声音**（inherit 默认继承）：主光 / 色温 / 色调 / 环境特效 / 音效与音画同步——随解读基调自动更新
- **域 8 剧情因果链与镜头收尾**（director 必填）：前置必要状态 / 产生结果 / 后续走向 / 不可逆事件 / 收尾快照（下一镜继承源）

每镜附**镜头自检清单**（导演逐项勾选：人物身份 / 位置朝向 / 动作完整 / 道具数量 / 景别机位 / 对白原文 / 不可逆状态 / 收尾继承）与**生成硬性约束**（镜头独立渲染、禁止跨镜记忆依赖、参考图最高标准、动作完整跑完、对白普通话原文、音画因果同步、不可逆状态不回退）。

字段分层：`auto` 自动派生（只读）、`director` 导演必填（可编辑，质量交用户评审）、`inherit` 默认继承（折叠，随基调更新）。镜头卡是镜头级唯一生产事实源，先声明本镜世界状态 / 事件 / 收尾，单元规划再按模型容量把镜头打包为生成单元。

**分镜表工作台（三步向导 · A+ 默认通道）**：directing 内部拆为**三个子步骤**，每步只承载一层决策，字段按层递增，系统按规则先生成默认、用户只改关键项，质量交用户评审（`Episode.directingStep: 1|2|3` 持久化；旧数据已有已确认镜头时自动推断进步 3 兼容历史评审进度）：

1. **① 镜头拆分（叙事层）**：表格 4 列（镜号/场次/主事件/预计时长），系统按剧本预生成主事件；抽屉仅「主事件 + 预计时长」两个输入；「**一键锁定镜头表**」直接推进——90% 场景 1 次操作完成。
2. **② 镜头语言（视觉层）**：表格列（镜号/景别·机位运动/构图·焦段）；「**应用自动镜头语言**」按平台内置规则 `src/config/rules/camera-defaults.ts`（节拍类型→景别基线：建立空间=全景+固定、推进剧情=中景+固定、情绪转折/收尾钩子=特写+缓推、对白交锋=中景+固定、动作冲突=中景+跟随；情绪强度→机位修正：平静=固定/压抑·紧绷=缓推/爆发·愤怒=推；关键词 inferBeat 兜底「推进剧情」，避开「动作」宽泛词误判）；每镜可手动选择器（景别/机位/运动/构图/焦段）或**引用内置镜头语言条目**（CANNED_CAMERA_LANGUAGE 8 条：定场/对话/过肩/动作/情绪逼近/收尾/空镜/道具特写，选择即填充）；「锁定分镜草案」推进。
3. **③ 细节与连续性（执行层 · 差异评审）**：表格列（镜号/动作·表演/自检/状态）+ 行内快速确认/退回 + 批量；抽屉顶部**继承对照横幅**（上镜收尾→本镜前置，已自动继承只改差异），8 域分区（auto 折叠只读 / director 展开 / inherit 折叠跟随基调）；确认镜头后**自动跳到下一张待确认**，全部确认后关闭。

标题行显示总预计时长；每步抽屉保留 ←/→ 键盘导航与上一镜/下一镜按钮；硬约束折叠区步 3 常驻。

#### 5.5.2 单元规划（units）

`PLANNED` 覆盖在镜头/剪辑方案批准后编译为 `EXECUTABLE` 单元：完整保留剧本覆盖与顺序，增加 `shot_ids / duration_seconds / planned_exit_state / continuity { in, out }`；容量由执行目标（模型上限）决定。**镜头→单元三态映射**：1 镜 = 1 单元 / 多镜 = 1 单元（连续打包）/ 1 镜 = 多单元（按动作可恢复点再切）——分镜表是创作骨架、不随模型变，单元是生产打包、随容量重映射。**连续性台账**：每单元 `continuity.in` = 进入单元前世界状态（来自首镜前置），`continuity.out` = 本单元收尾快照（来自尾镜 causal.endState）；未生成视频时 `out` 只能是计划尾态，真实尾帧须从生成视频截取。单元卡展示「映射」徽标（Sxx 镜头 → 单元）与台上 in/out 两栏。随后逐单元确认**单元资产**（角色四视图 / 场景母版 / 道具等引用，绑定版本与哈希）与**目标模型 Prompt**（面向目标模型转译，不反向定义事实）。资产与 Prompt 确认后才进入生成。 每个单元可单独覆盖视频衔接模式（折叠「高级 · 视频衔接」，跟随执行目标 / 不衔接 / 开启首尾帧）。

#### 5.5.3 视频生产（production）

逐单元生成视频任务 → Take 候选。**内容质量（表演 / 情绪 / 节奏 / 光色 / 全片连贯）全部由用户评审，系统只组织评审上下文**（剧本引用、方案要求、连续性 in/out、上一单元已接受尾帧）并登记用户决定（绑定版本与哈希），不代替判断。已接受 Take 的真实尾帧驱动下一单元，不能拿计划尾态伪装。全部 Take 采纳后执行**制片总检**（机械可验证项：连续性台账一致 / 剧本覆盖完整 / 资产引用与哈希一致 / 无 STALE），通过后完成本集。可从镜头语言库引用表达，但引用仍须接受事实源校验。

## 6. 状态、数据与审核契约

### 6.1 层级与作用域

```text
Workspace -> ComicProject -> SourceScriptVersion -> Episode -> Scene -> Shot -> Unit -> Take
                         └-> ProjectAsset / AssetVersion / EpisodeUsage
```

建议在服务层定义 `projectId`、`episodeId`、`sourceVersion`、`sourceSpan`、`artifactId`、`artifactVersion`、`sha256`、`scope`、`dependsOn` 和 `jobId`。剧集边界映射到原文范围，项目共享资产有不可变版本与逐集引用记录。跨集复用不得违反现有“新案例不得复用其他案例素材”的隔离要求：同一项目内经确认的全局资产可复用；跨项目复用必须走显式导入并重新校验，不把历史结果静默当成本项目事实。

当前 v3.1 `project-ledger.json` 以 `PROJECT`、角色、状态、场景和单元为作用域，并未直接定义多剧集的共享事实。服务化前需要先确定“剧集级产物键与项目级共享资产”映射和迁移/校验测试；不得简单复制多个 ledger 并让共享资产有多个互相矛盾的当前版本。已有 v2.2 Manifest 仍只记录视频生产证据，不复制审核事实。

### 6.2 三类状态分离

- **执行任务**：`queued/running/succeeded/failed/cancelled`，附进度、尝试、错误和时间。
- **内容产物**：`DRAFT/AWAITING_USER/USER_APPROVED/USER_REJECTED/STALE/SUPERSEDED`；候选生成成功停在待选择。
- **项目经营状态**：草稿、制作中、待审核、归档等；不能代替领域 Gate。

人工批准必须绑定 `artifact_id + version + sha256 + user_statement`，决定写追加式审核日志。`regenerate` 创建新候选；编辑或重试导致新版本；上游变化只将依赖下游标记 `STALE`，保留历史。用户“先继续”只允许暂定准备工作，不登记批准。进度使用已通过 Gate 的数量、场次/镜头/Unit 覆盖和待审核数等可解释指标，不给出虚假的单一精确百分比。

## 7. 服务接口草案

接口命名为设计建议，正式实施时以 OpenAPI 和现有 Runtime 合同为准：

| 操作 | 建议接口 | 关键行为 |
|---|---|---|
| 新建与上传 | `POST /comic-projects`、`POST /comic-projects/{id}/script-versions` | 文件校验、哈希、风格版本、幂等 |
| 启动/读取拆集 | `POST /comic-projects/{id}/episode-analysis`、`GET /comic-projects/{id}/episodes` | 同源版本复用 Job，返回候选原文范围 |
| 确认分集 | `POST /comic-projects/{id}/episode-analysis/{analysisId}/decisions` | 校验顺序和完整覆盖，锁定剧集清单 |
| 获取工坊 | `GET /comic-projects/{id}/episodes/{episodeId}/workbench` | 阶段、阻塞、当前版本、下一步 |
| 解读/重试 | `POST /comic-projects/{id}/episodes/{episodeId}/analysis-runs` | 显式版本、输入哈希、影响预览 |
| 资产与审核 | `GET /comic-projects/{id}/assets`、`POST /artifacts/{artifactId}/decisions` | 提交候选选择/确认，绑定版本和哈希 |
| 图片任务 | `POST /generation-jobs`、`GET /jobs/{jobId}`、`GET /jobs/{jobId}/events` | 批量请求展开单项 Job，SSE 状态恢复 |
| 设置 | `GET/POST /channels`、`GET/POST /models`、`POST /channels/{id}/test` | 能力、线路健康、Secret 不回显 |

所有有副作用的请求带幂等键；审核提交使用当前版本/ETag 防止多人覆盖。上传返回临时接收结果，只有校验并落盘后才成为源版本或候选资产。前端请求经 BFF，不直接读写 ledger、运行任意 Python 脚本或持有供应商密钥。较长分析/生成任务在后台持久运行，通过 SSE 订阅，断线后按 Job ID 查询恢复。

## 8. 模型渠道与 ComfyUI

上层统一 `Capability Request -> 模型/Adapter/线路解析 -> Job -> 候选 AssetVersion`。官方 API 与中转 API 分别配置端点、能力、限流和凭证，要求价格与数据处理规则可见；未知模型保持不可执行而不是套用其他模型的 Prompt 格式。

ComfyUI 官方服务端提供 `/prompt` 提交、`/ws` 状态推送、`/history/{prompt_id}` 查询、`/view` 获取结果、`/upload/image` 传图及队列/中断端点。平台保存原始 ComfyUI `prompt_id`、本平台 JobAttempt、Workflow JSON/模型版本和输出文件哈希，以恢复与去重。导入 Workflow JSON 时只映射声明的输入槽，校验自定义节点、权重、显存和许可；不自动安装未知节点。

- 本地 ComfyUI：本地 Agent 主动连接平台并访问用户机器上的 ComfyUI；浏览器和平台不直接暴露/访问任意内网 URL。Agent 管理配对、探测、素材授权、提交、恢复与结果上传。
- 云端 ComfyUI：后端连接受控 Runner；记录实例租约、健康、队列、成本和闲置回收。云部署 URL/凭证不进入浏览器。
- 无已配置线路时展示 Prompt 导出及外部结果导入路径；不显示“生成成功”的假状态。

具体实现参考 [ComfyUI 服务端路由](https://github.com/Comfy-Org/ComfyUI/blob/master/server.py)。画布库参考 [React Flow](https://github.com/xyflow/xyflow)；漫剧工坊的信息层级可参考 [LocalMiniDrama](https://github.com/xuanyustudio/LocalMiniDrama)，但不继承其漫剧画布交互。[openOii](https://github.com/xeronsh/openOii) 的可恢复进度可作原型参考，其自身标注为演示项目。

## 9. 实施顺序

1. **导航与真实项目层**：路由、App Shell、项目创建/上传、分集候选与确认、剧集卡、可恢复的分析任务；保留演示数据隔离。
2. **单集工坊与资产决策**：导演解读、角色/道具/场景任务、候选与批量生成、项目资产引用、审核日志、版本与 stale 反馈。
3. **生产链路与渠道**：Shot/Unit/Take、模型/渠道配置、API 与 ComfyUI 接入、任务中心、费用和交付证据。
4. **并行独立页面**：无限画布、音频工作台、镜头语言库、创作广场；共用服务契约但不阻塞漫剧工坊的正确性验收。

先建立可运行的端到端竖切面，再扩展渠道和高级控件。完整商业化权限、计费、发布和云 GPU 调度仍需按既有平台方案逐步落地，不能仅靠本前端方案声称已完成。

## 10. 验收标准

- 用户上传剧本后能看见真实项目卡；首次进入只启动一次拆集任务，刷新可恢复；用户确认边界后得到多个剧集卡，原文覆盖完整且顺序未变。
- 点击剧集卡进入对应 URL；导演分析成功后定位资产页，但未批准产物仍待确认；失败可按同一输入重试且无重复剧集。
- 角色支持手工修改草案、局部重新解读、单个/批量提交、候选选择及版本化审核；道具不混入角色组件；场景外观和 `scene_map` 分别确认。
- 项目资产可按来源集/全局过滤；跨集引用锁定版本，上游变化只影响实际依赖的产物，并显示阻塞原因。
- 同一图片能力可选择两条已配置线路进行契约测试；本地 Agent 离线和 ComfyUI 任务重启均可恢复或明确失败，不盲目重复提交。
- 用户能只通过工坊完成至少一集从剧本到 Take 采纳的过程，漫剧页面不存在画布交互；独立 `/canvas` 不改变漫剧 Gate。
- 工坊按 7 阶段 Gate 顺序推进：解读未确认、资产未批准或导演阶段产物（表演基调 / 状态变体 / 调度镜头 / 单元资产与 Prompt）未确认时，后续阶段显示阻塞原因；视频生产全部 Take 采纳后仅当机械总检（连续性 / 覆盖 / 哈希 / STALE）通过才可完成本集。
- 自动化覆盖源文件/拆集完整性、Gate/审核哈希、跨集引用、重复请求、任务恢复和前端项目到剧集到资产的关键 E2E。生产数据不得从 localStorage 的示例 Store 恢复为权威状态。

## 11. 当前前端验收结果与实现对照（2026-09-27）

### 11.1 已落地的可验收流程

当前 `apps/web` 已可从首页进入以下完整演示链路：

```text
新建剧本项目
  -> 标题 / 视觉风格版本 / TXT-MD 上传或粘贴
  -> 源文本哈希与拆集任务
  -> 连续、无缺口、无重叠的剧集候选核对
  -> 锁定剧集卡
  -> 首次进入单集：① 剧本核对（查看/编辑，编辑为草稿新版本）-> ② 模型设置（执行目标，预选项目默认视频模型，可随时更换）-> ③ 导演解读任务
  -> 解读产物核对（视觉基调 / 场次清单 / 覆盖两段式：节拍分段 + 容量映射）-> 确认解读
  -> 角色（含表演基调）/ 道具 / 场景（含状态变体）候选生成与人工确认
  -> 分镜设计确认（镜头卡 8 域 + 自检清单）
  -> 单元规划确认（镜头→单元映射 + 连续性台账 + 目标模型 Prompt）
  -> 视频生产：Take 候选 -> 用户采纳 / 退回（系统不判断质量）
  -> 制片总检 -> 完成本集
```

已实现页面与路由：`/`、`/canvas`、`/create/image`、`/create/video`、`/create/audio`、`/comic/projects`、`/comic/projects/:projectId`、`/comic/projects/:projectId/episodes/:episodeId/:stage`、`/shot-language`、`/assets`、`/tasks`、`/settings/channels`、`/settings/models`、`/settings/preferences`。漫剧工坊没有画布交互；无限画布只在 `/canvas`。

### 11.2 本轮验收修复

**2026-09-28 复验补丁**：按真实用户主流程复验首页 → 漫剧项目 → 单集工坊 → 资产库 → 智能创作 → 规则中心，补齐以下交互契约：

- 新建项目的上传与粘贴剧本统一要求至少 100 字；弹窗会显示当前字数和缺口，关闭后清空风格、规则、文件选择和模型状态，避免下次打开继承上一次草稿。
- 智能创作在提示词/合成文本为空时禁止提交并显示原因；图片工作台的“数量”字段现在会展开为最多 8 个独立可追踪任务，并为每个候选显示序号。
- 规则中心的拆集模板接入版本历史展开与恢复；恢复会生成新版本并保留追加式历史链，与环节提示词规则的版本行为一致。
- 项目规则保存不再清空已锁定剧集；已有锁定剧集保持原状，新规则只作用于新建或未锁定剧集。拆集候选缺少项目/拆集状态时安全返回，资产追溯按版本号查找当前哈希而非依赖数组下标。
- 复验确认漫剧工作台仍只使用阶段工坊布局，`/canvas` 是唯一画布入口；解读完成、资产生成和生产任务均不自动批准内容产物。

- 解读完成后会幂等登记本集角色、道具、场景资产草案，避免资产页为空导致主流程中断。
- `EpisodeWorkbench` 和解读 Hook 不再重复启动同一解读计时器；任务中心保留上下文路径，可返回对应阶段。
- 拆集候选默认使用连续完整的原文区间；确认前校验集号连续、标题/摘要非空、首尾覆盖、无缺口/重叠/越界，并允许编辑原文起止位置。
- 上传与粘贴剧本统一最小 100 字校验；切换输入方式不会误用另一标签页残留文本。
- 生成任务根据角色、道具、场景写入正确的上下文路径；生成结果停留在 `AWAITING_USER` 候选，不自动成为 canonical。
- 重试解读只补充不存在的资产，不覆盖已有版本、审核状态或 `STALE` 标记；角色批准按钮禁止空确认声明。
- 阶段 Gate 改为角色/场景全部非失效资产批准后才通过；道具属于可选资产，无道具时不阻塞场景阶段。
- 场景六步展示根据当前候选/批准状态显示“已完成 / 进行中 / 待配置”，不再把未实现步骤伪装成已完成。
- 工坊阶段扩为 7 个导航阶段 + 完成态：解读（含执行目标前置、视觉基调、场次清单、覆盖与初步单元）→ 分镜设计（镜头卡）→ 角色（含表演基调）→ 道具 → 场景（含状态变体）→ 单元规划（镜头→单元映射）→ 视频生产；解读完成停留解读页，用户确认解读后才解锁角色资产。
- 解读与导演阶段产物（表演基调 / 状态变体 / 调度镜头 / 单元资产与 Prompt）均停在 `AWAITING_USER`，由用户逐项评审；系统不判断内容质量，视频生产提供评审上下文（剧本引用 / 方案要求 / 连续性 in/out / 上一单元尾帧）。
- 视频生产全部 Take 采纳后，当前演示版只检查执行单元身份与数量、用户采纳状态、Prompt 确认状态和本集 STALE 资产；真实尾帧连续性、原文覆盖、资产文件哈希须由后端验收，不能将本地检查称为制片总检通过。
- 全局 TopBar 面包屑与剧集卡阶段文案随 7 阶段枚举同步（原“后续生产”更名“视频生产”，新增“分镜设计 / 单元规划”）。
- 执行目标卡按 `confirmed` 状态显式区分：历史数据未选模型时显示“未确认（历史数据需补选目标再推进）”，不冒充已确认；已确认后提供“修改执行目标”入口，修改仅重映射容量、保留创作层。
- 覆盖采用两段式：**节拍分段（创作层，容量无关）** 恒为 5 节拍 13s/12s 交替，边界理由按叙事；**容量映射（平台层）** 随执行目标重映射——Seedance 2.5（30s）→ 3 单元 26s/25s/26s + 8 Shot，MiniMax H3（15s）→ 5 单元 13s/12s；忠实呈现下限恒容量无关（71s）；旧版解读数据缺创作层时显示提示并建议重试解读，不崩溃。
- analyze 前置步骤化：**剧本核对（第 1 步）→ 模型设置（第 2 步）→ 导演解读**。剧本核对展示本集原文切片（源版本+哈希），可编辑为草稿新版本（不覆盖源文本），编辑后需重新核对并建议重试解读；剧本未核对待确认按钮禁用。执行目标初始预选项目默认视频模型（项目管理页 `ProjectParams` 可设默认图片/视频模型，选项已含 MiniMax H3），工坊内可随时更换（修改仅重映射容量）。
- 剧本草稿变更影响预览（#17）：保存草稿且本集已有解读产物时，自动展示下游影响清单（导演解读 / 表演基调 / 状态变体 / 调度镜头 / 可执行单元与 Prompt / 生产 Take，按实际存在的产物动态列出），用户可「重新解读本集」（复用 handleRetry：清解读与导演产物、旧资产标 STALE、草稿保留并自动重跑解读）或「暂不处理，保留现状」；系统不自动清空产物。
- 新建弹窗与项目参数打通（#18）：`NewProjectDialog` 扩为四步（标题 → 视觉风格 → 剧本 → 默认模型），默认图片/视频模型预填 `settings.preferences` 全局默认（选项来自共享常量 `mocks/models.ts`，与 `ProjectParams` 同源防漂移），创建时写入 `defaultImageModel/defaultVideoModel`

**新建弹窗单页化**：四步内容（标题 / 视觉风格 / 剧本 / 默认模型）相互独立、信息量小，合并为**单页可滚动表单**一次填写（底部创建按钮固定吸底，沿用弹窗布局规范）；视觉风格复用 `StylePickerDialog` 的**选择模式**（value/onChange 回调，不落库），与项目参数编辑模式共享同一风格库弹窗。

**风格库弹窗（图文卡片形态）**：风格库弹窗对标主流绘图工具的风格面板——顶部「画面风格提示词」区（跟随选中实时预览，右侧**编辑**按钮可内联修改，保存写入本地覆盖 `mdp:style-overrides` 全局生效，在用该风格的项目资产标记待复核）；中部搜索框固定；风格库为**图文卡片网格**（封面图 + 名称 + 版本 + 提示词，选中卡带「已选」标签，可滚动容纳任意数量）；底部「取消 / 确认使用」两步确认，点击卡片仅选中不生效，确认后才应用。

**规则管理（三类落地）**：
1. **风格库 = 用户数据**：新建 `mdp:style-library`（useStyleStore 持久化），首次初始化内置 8 个默认风格；新增 `/comic/styles` 风格库管理页（新增/编辑/启用停用/删除），停用风格不出现在项目风格选择器，项目存 styleId + styleVersion 快照不受影响；旧 `mdp:style-overrides` 提示词覆盖迁移到风格 `prompt` 字段（画面风格提示词可编辑，保存后全局生效，在用项目资产标记待复核）。
2. **平台规则 = 集中配置**：新增 `src/config/rules/split-policy.ts`（拆集策略：显式章节标记/每集字符预算/最大集数/标题词池）与 `capacity-policy.ts`（容量策略：模型↔最大生成单元秒数映射/忠实呈现下限/容量说明文案），`buildSplitCandidates` / `buildCoverageRemap` / `buildInterpretation` 全部改为读配置；正式版由服务端规则服务下发，前端只读引用 + 本地缓存快照。
3. **导演覆盖 = 项目级优先**：`Project.ruleOverrides`（split：每集字符预算/最大集数；capacity：最大单元秒数），项目参数页「导演覆盖」区可编辑保存；拆集覆盖保存后未锁定剧集按新策略重新拆分（pending_parse 重跑），容量覆盖在解读/重映射中优先于执行目标生效；留空 = 使用平台默认策略，只影响未锁定/未生成产物。

**拆集按剧本结构（不按字数）——已重构**：拆集策略改为「显式章节标记 → 场次原子单元 → 节拍分组」：1) `## 第X集` 等显式章节标记直接切；2) 场次（`场次：N-M / 场景N / 第N场`，支持 Markdown `#` 前缀）为最小不可分单元，切点只落在场次边界，按单集场次窗口（1–6）节拍分组追求集内弧线闭合；3) 无结构时按段落粗分组；4) 字数只作单集时长软参考，不作切分依据。`split-policy.ts` v2.0 提供 `explicitMarkers / sceneTitle / scenesPerEpisode 窗口 / maxEpisodes / paragraphBreak`，`buildSplitCandidates` 重写为结构解析。

**规则先定义、后生效（规则中心）**：规则体系从「项目内编辑」改为「规则中心先定义 → 项目选择生效」：
- 新增 `/comic/rules` 规则中心：平台默认规则只读展示（拆集格式识别 / 节拍分组窗口 / 容量映射表，带版本号 v2.0）；用户规则模板库 `mdp:rule-templates`（内置"场次制·标准""Markdown 章节制"2 个示例），支持新增/编辑/启用停用/删除，模板字段 = 自定义章节正则 / 自定义场次正则 / 目标集数 / 单集场次上限 / 容量秒数。
- 项目参数页改为「生效规则」选择器（平台默认 / 我的模板，+ 管理规则入口 + 容量项目微调），`Project.ruleOverrides` 改为 `{ ruleTemplateId?, capacity? }`；`resolveSplitOverrides / resolveCapacitySeconds`（`src/lib/ruleResolver.ts`）解析：项目级容量微调 > 模板 > 平台默认。保存后未锁定剧集按所选模板重新拆分（实测：默认按场次拆 2 集 → 选模板 targetEpisodes=1 → 重拆 1 集）。
- **格式识别测试（规则中心内置）**：规则中心新增「格式识别测试」区块——粘贴剧本 → 选测试规则（平台默认/模板）→ **实时自动**预览：章节标记数/场次标记数/拆出集数/每集候选（标题/跨度/包含场次 badge/摘要），无场次结构时标注"段落粗分组"。模板编辑保存后测试区自动重算，无需手动触发（实测：完整 3 集剧本默认规则拆 3 集且切点精确落在 `## 第X集`，每集场次完整；改模板章节正则失效 → 自动按场次重拆 2 集）。用户自定义正则在编译时统一加 `m` 多行标志（`safeRegex`），`^场次` 等写法按行首匹配，符合直觉。
- **新建项目弹窗拆集预览**：粘贴剧本时实时显示「章节标记 N 处 / 场次标记 N 处 / 按平台默认规则拆出 N 集」+ 每集候选行（标题/场次归属/跨度），切点只落章节与场次边界；提示"创建后可在项目参数选择「生效规则」重新拆分"（实测：3 章节 4 场次 → 实时拆 3 集，每集场次完整归属）。
- **创建时选择生效规则**：新建弹窗拆集预览区内置「生效规则」下拉（平台默认 / 我的模板），选模板 → 预览按所选规则实时重算；创建项目时 `ruleOverrides.ruleTemplateId` 直接落库（`CreateProjectInput` 扩展），创建即生效，之后可随时到项目参数更换（实测：新建弹窗选模板创建 → 新项目按所选规则拆集落库）。
- **analyze 剧本核对（无拆集影响）**：拆集为整剧级动作、在项目核对阶段完成；进入单集工坊后 ScriptReview 只做本集剧本查看/编辑 + 草稿变更的下游产物影响预览，不展示拆集/切点信息（用户口径：已进入拆好的单集，无需再展示拆集影响）。
- **环节提示词规则（对齐竞品环节级规则，规则中心双 Tab）**：规则中心拆分为「拆集规则 / 环节提示词规则」双 Tab。**环节规则 = 每生成环节一套"平台默认模板（只读）+ 用户可覆盖"**，平台固定输出字段与画布结构，用户只覆盖提示词内容（对齐竞品 9 环节映射为 6 环节：导演解读 / 角色与表演 / 场景 / 道具 / 分镜设计 / 视频提示词；"分镜图片"未映射——skill 默认不生成分镜位图，"表演设计"并入角色环节）：
  - 数据层：`PROMPT_STAGES`（6 环节 id+label）、`PromptRuleTemplate`（stage/name/desc/content/builtin/enabled）、`Project.promptRuleOverrides`（环节 → 模板 id）；`usePromptRuleStore`（`mdp:prompt-rules`）内置 6 条平台默认模板（EV/DLG/LOCK 事实提取、身份/外观/结构、动作轴线、连续性台账、六字段等按 skill 口径撰写），builtin 仅可启停、内容平台维护，用户模板 CRUD。
  - 解析序（`ruleResolver.resolvePromptRule`）：项目 `promptRuleOverrides[stage]` 引用模板（enabled）→ 该环节用户模板 enabled 第一条 → 平台默认 builtin。
  - 规则中心 Tab：环节切换 chips（启用用户模板的环节标「已覆盖」）+ 平台默认只读 Card（「当前生效」标记）+ 我的模板 Card（新建/编辑/启停/删除，编辑表单 content 0/12000 计数对齐竞品弹窗）+ 生效标「当前生效」。
  - 项目参数：「环节提示词规则」区（6 环节每行 平台默认/我的模板 选择器 + 保存写 `promptRuleOverrides`，**保存不触发拆集重拆**，与拆集规则保存分离）+「管理规则（规则中心）」入口。
  - 环节展示：`StageRuleBadge`（环节内显示当前生效规则名称 + 内容字数 +「已覆盖」标记，点击跳规则中心）接入 InterpretStage 模型设置行（导演解读规则）与 UnitsStage 标题行（视频提示词规则）。
  - 实测：规则中心新建自定义解读规则落库 → 项目参数选择该模板保存 → `promptRuleOverrides.interpretation` 落库 → analyze 页 badge 显示「导演解读规则 快节奏悬疑解读规则v2（已覆盖）53 字」；规则中心视频提示词环节平台默认（六字段）只读展示 + 当前生效。units 页 badge 因前置 Gate 阻塞未直验（Gate 先行属预期），解析逻辑与 interpretation 同一函数。
- **规则版本管理（所有规则统一进规则中心，编辑自动记版本）**：拆集规则模板与环节提示词规则模板统一支持版本——每条模板带 `version`（整数，编辑保存自动 +1）+ `versionHistory`（每次保存把**当前字段快照**推入历史，含 savedAt / 可选 note / 字段快照；内置平台默认模板 version=1 只读）。规则中心两类卡片均显示 `v{n}` 徽标 + 「版本历史（N）」展开区（倒序 vN…v1：保存时间 / 修改说明 / 字段摘要 + 「恢复」按钮）；**恢复 = 把该版本快照写回当前并生成新版本**（历史链不中断，恢复记录自动注「恢复至 vX」）。编辑弹窗新增「本次修改说明（可选，自动记录版本）」输入。store 新增 `restoreVersion(id, version)`；`upsertTemplate` 签名排除 `version`（由 store 维护）。实测：编辑自定义解读规则 → version 2 + v1 快照入历史；展开历史显示 v1（时间+摘要）→ 点恢复 → version 3 + 「恢复至 v1」记录；新建拆集模板 → version 1。
- **候选卡摘要与原文展示（专业口径）**：①剧集摘要 = **提取式剧情梗概**（按场次聚合"本场第一句剧情线索"，无场次结构按段落首句串接；过滤标题行/地点时间人物行，不截断原文正文；真实环境可在此槽位接入 LLM 生成式摘要）；②**完整原文默认展开**（不再折叠隐藏），顶部 badge 标"原文 start–end · N 字符"，按钮切"收起/展开完整原文"；③摘要框带标签「剧集摘要（自动生成，可编辑）」。实测：外卖骑士奇谭 3 话候选各显示 110+ 字梗概，正文区与 1243 字符等完整原文直接可见、可滚动。
- **候选核对「重新拆分」**：候选待核对标题行内置两态重拆按钮（重新拆分 → 「将丢弃候选编辑并按当前规则重拆」确认/取消），确认后按当前生效规则重跑拆集、重建候选（源版本与已锁定集不受影响）；实测外卖骑士奇谭点击重拆后重新生成 3 集候选。，创建后项目参数页可继续调整。
- 拆集候选原文预览（#19）：候选卡新增「查看原文片段」折叠区，展示该候选源剧本切片，起点/终点编辑实时跟随；空区间红字提示；标题/摘要/边界编辑与锁定校验（连续/覆盖/无缺口）保持不变。
- 可恢复 Job 语义（#20）：解读 / 图片生成 / 视频拍摄 / 智能创作统一改为 **store 驱动的 Job**——`useTaskStore.tickAll()` 每 tick 按 kind 推进进度（interpret 8 步 / image 8 步 / video 5 步），`useJobResumer` 挂载于 `AppShell` 全局唯一驱动（500ms），完成的 job 经 `lib/jobRegistry` 分发给对应业务回调（解读产物登记 / 图片候选版本 / Take 候选 / 通用完成提示）。各模块不再持有 setInterval，**刷新 / 卸载 / 离开后任务不丢失**：queued 自动提升 running、无 job 自动重建、刷新后继续推进至完成；重试（queued）也会被自动恢复推进。
- 解读产物字段空值保护（#21，健壮性）：`InterpretStage` 对 `rawFacts` / `breakdown` / `coverage.units` / `SectionCard.items`（facts / constraints / suggestions / openItems / decisions）全部加 `?? []` 与 `?.length ?? 0` 保护；旧版或缺字段的解读产物进入工坊不再触发 `undefined.map` 崩溃导致全局交互失效（曾表现为新建弹窗按钮点击无响应）。
- 新建弹窗滚动布局（#22）：`DialogContent` 改为 `max-h-[85vh] flex flex-col`，标题/步骤条/底部按钮（上一步·下一步·创建项目）固定吸底，步骤内容包 `min-h-0 flex-1 overflow-y-auto` 独立滚动；粘贴超长剧本（数千字）时内容区滚动、按钮始终在视口内可点，不再出现内容溢出视口导致无法点击。
- 拆集候选原文预览增强（#23）：摘要由单行 Input 改为多行可编辑 Textarea（rows=2，可继续拉高）；「查看原文片段」展开区由 `max-h-40` + 800 字符截断改为 `max-h-96`（384px）完整原文展示、无截断、超高滚动，整集原文一次可读。
- 源版本迭代（#24）：`useProjectStore.reviseSourceText` 追加新 sourceVersion（旧版本留档）+ 推进 currentSourceVersion + 清空项目剧集投影 + 重置为 pending_parse；`SourceVersionDialog`（项目页「修订原文」入口）展示版本历史、全文编辑（≥100 字且内容有修改才可保存），保存后由 `useSplitFlow` 按新版本自动重新拆集候选核对（seed 含版本号）。

### 11.3 当前为演示实现的边界

**2026-09-29 前端复验**：项目与剧集 URL 必须归属一致；阶段入口校验完整前置 Gate，生成中的资产不能视为批准。全局搜索覆盖项目、剧集、资产、镜头模板和模型，资产支持追溯深链；镜头模板新增可本地持久化并复制。渠道配置只做 URL 格式检查，API Key 禁止在演示版输入/持久化。新项目解读、资产和生产草稿不再套用预置剧本内容；已完成剧集仅显示完成摘要。移动端表格可横向滚动，工坊阶段可横向导航。此复验仅验证本地演示工作流，不代表真实服务能力验收。

- 项目、剧集、资产、任务、设置使用 Zustand `persist` 的浏览器本地状态和 mock 数据；刷新可恢复，但不是服务端权威数据。
- 拆集、导演解读、图片/视频任务用统一 Job 推进器（`tickAll` + `useJobResumer`）模拟服务端 Job 事件并支持刷新恢复；仍没有真实 SSE、并发控制、权限或费用结算（正式为服务端 Job + SSE 恢复）。
- 图片预览使用占位图；模型和渠道设置只验证 UI 状态，不会真正调用官方 API、中转 API 或 ComfyUI。
- ComfyUI 页面已区分本地 Agent 与云端 Runner 的配置意图，但 Agent 配对、Workflow 校验、`/prompt`、`/ws`、`/history` 和输出哈希仍需后端/BFF 实现。
- 场景的 `scene_map`、走位和机位目前是阶段状态展示，尚未接入真实空间数据模型；生产阶段使用从已确认执行单元派生的 mock Shot/Take。旧本地生产清单可能与当前 Unit 不一致，演示检查会阻止完成，但保留已有 Take 以免静默丢失。
- 导演阶段产物（视觉基调 / 场次清单 / 表演基调 / 状态变体 / 调度镜头 / 可执行单元 / 目标模型 Prompt）为演示 mock；执行目标选择、评审与总检为 UI 状态，不调用真实生成接口。
- 移动端将继续把工坊右侧来源栏收进抽屉；服务化前不得把 localStorage 状态直接迁移为生产事实。

### 11.4 后续接入优先级

1. 用服务端项目、源版本、剧集和资产 API 替换 mock Store，并保留当前 URL 与 Gate 语义。
2. 将分析/生成计时器替换为可恢复 Job + SSE，确保同一源版本和任务幂等。
3. 接入模型能力目录、官方/中转 API 适配器和 ComfyUI 本地 Agent/云端 Runner。
4. 完成场景 `scene_map`、Shot/Unit/Take 数据模型和真实媒体候选审核。
5. 增加源文件、Gate、审核哈希、跨集引用、任务恢复和关键路径 E2E 测试。

## 设置中心 · 文本/图片真实模型验收（2026-10-01）

**验收范围**：用户明确先验收文本+图片，视频暂缓；图片指定 gpt-image-2。

**验收结果（execution 装配引擎真实 HTTP 调用，全链路 BFF → execution → pearapi 上游）**

| 类型 | 模型 | 协议 | 结果 | 耗时 |
|---|---|---|---|---|
| 文本 | PearAPI GPT 测试（deepseek-v3.2） | OpenAI Chat（temp 覆盖 0.3） | HTTP 200 · 映射提取完整（choices.0.message.content / usage.*） | ~5s |
| 图片 | PearAPI GPT-Image 2 测试（gpt-image-2） | OpenAI 图片（Images API） | HTTP 200 · `data.0.url` 提取，1024×1024 PNG 真实出图并视觉复核 | ~31-44s |

前端「测试」按钮链路同样实测：文本/图片两类型弹窗发送真实请求 → 按钮「请求中…」→ 「调用成功 HTTP 200 · 映射提取」面板，闭环一致。

**验收中修复/发现的问题**

1. **超时链三处瓶颈（真实产品缺陷，图片/视频长任务必现）**
   - execution handler 全局 ctx 15s → 180s（同步测试端点 /tasks/run 需等上游长任务）
   - BFF `withTimeout` 20s → 180s（曾 20.05s 掐断导致 503 UPSTREAM_UNAVAILABLE）
   - BFF `httpClient` 15s → 180s
   - 文本快（~5s）不暴露；图片 30-120s 必暴露。结论：凡同步真实调用，超时下限应按图片/视频生成时长设计，不是 15-20s。
2. **图片协议模板缺 model 注入字段**：`pt_builtin_openai_img` params 原为空 → 装配 body 缺 model → 上游 400 "Missing required parameter: model"。013 迁移升级为 6 参数完整规格（model=model 注入 / prompt=runtime / n=1 / size=1024x1024 / quality=standard / response_format=url），与 010 升级 OpenAI Chat 同理。
3. **测试弹窗 runtime 默认模板未按模型类型区分**：文本/图片一律弹 messages → 图片模型须手改 prompt。已修：`defaultRuntimeOf(m)` 按 type 给占位（text=messages、image/video=prompt），实测图片 tab 打开默认 prompt。
4. **前端模型列表缓存**：新创建模型需刷新页面才出现（store 会话级缓存），非缺陷，记录待改进（可改为创建后主动刷新列表）。
5. **gpt-image-1.5 上游不稳定**（500 当前服务暂不可用），换 gpt-image-2 后稳定——供应商侧问题，已记录。

**验收后资产**
- 图片测试模型 `mod_aaaaaaaaaaaaaaaaaaab`（PearAPI GPT-Image 2 测试 / gpt-image-2 / pt_builtin_openai_img / type=image / pearapi 渠道）
- 迁移 `013_openai_img_params.sql`（生产库已执行 UPDATE 1）

## 内置模型协议关联核对（2026-10-01）

全量 18 个模型（17 内置 + 2 测试）协议关联齐全、模型 type 与协议 type 一致：

- 图片 → OpenAI 兼容图片 / 即梦图片 / ComfyUI（nano-banana 系列、gpt-image-2、seedream-5.0、sdxl/flux-comfy）
- 文本 → OpenAI 兼容 Chat / MiniMax 文本 / Grsai（gemini 系列、minimax-text-01、deepseek-v4-pro）
- 视频 → MiniMax 视频（异步）/ 即梦视频 / Grsai（minimax-h3 系列、seedance 系列、kling-1.6）

浏览器实测编辑态协议下拉：gpt-image-2（OpenAI）→「OpenAI 兼容图片」、gemini-3.1-flash-lite →「OpenAI 兼容 Chat」、minimax-h3 →「MiniMax 视频（异步任务）」、PearAPI GPT-Image 2 测试 →「OpenAI 兼容图片」——修复后的两态常显协议下拉在文本/图片/视频三类全部闭环，无「未关联模板」。

## 阶段级模型槽 + 默认文本模型（2026-10-01）

### 需求与设计

用户诉求：「每个阶段都要能随时换模型」+ 新建项目需设「默认文本模型」。核心不是做 7 个独立选择器，而是建立一条三级默认链 + 每阶段独立覆盖：

```
阶段覆盖(episode.stageModels.<stage>.<type>)
  → 项目默认(defaultTextModel / defaultImageModel / defaultVideoModel)
  → 目录该类型首项(enabled)
```

- `Episode.stageModels?: Partial<Record<EpisodeStage, StageModelSlot>>`，`StageModelSlot { text?; image?; video? }`，随剧集持久化（localStorage）。
- 组件 `StageModelPicker`：按类型过滤 enabled 模型；显示当前生效值与来源徽标（阶段覆盖 / 项目默认 / 目录默认）；变更即写入 stageModels。
- 7 阶段接入：解读（文本槽）、角色/道具/场景（图片槽）、可执行单元（文本槽）、视频生产（视频槽，仅选择器不真实调用——视频暂不验收，用户定）。
- 项目参数与新建弹窗均提供「默认文本模型」选择（新建弹窗三列网格第三项；创建 payload 带 default_text_model 入库）。

### 真实解读链路（不再伪造）

- 确认执行目标前，用阶段文本模型真实调用 `/api/v1/tasks/run`（messages 含导演解读 Prompt + 本集剧本原文）→ 提取 `choices.0.message.content` 为导演解读原文。
- 真实原文先暂存（`stashRealDirectorNote`），由解读任务完成回调注入完整结构化解读产物（创作层：基调/场次/节拍/覆盖 + 真实导演解读原文并存），status → `needs_review`（待用户确认，评审权归用户）。
- 调用失败不伪造：toast 提示并中止确认，用户可换文本模型或稍后重试。

### 真实图片资产生成链路（不再占位）

- 角色/道具/场景「生成」按钮 → `useFakeGeneration.generate(assetId, { modelId, modelName })` → 真实 `/tasks/run`（prompt=资产提示词）→ 提取 `data.0.url` → `addAssetVersion(imageUrl)` 产生候选版本（DRAFT，待用户评审）+ `updateAsset(model=gpt-image-2)`。
- 质量评审权在用户：系统只制片（产出候选 + 记录来源模型），是否批准由用户决定。

### 剧本无下限后端对齐

- 前端 `NewProjectDialog.MIN_SCRIPT_LENGTH` 100 → 0（无字数下限）。
- 后端 project Validate 删除 SourceText 100 字下限，前后端一致。

### 验收实测（proj_deb825d67e5748c68ffe0ef3e3d65f76「阶段模型实测2」）

1. 新建弹窗显示「默认文本模型 → PearAPI GPT 测试」→ 创建 → 项目详情页默认文本模型正常显示。
2. 锁定分集 → analyze 页「解读文本模型」Picker 显示 PearAPI GPT 测试（项目默认徽标）。
3. 剧本核对 → 确认执行目标 → 真实文本调用（~5s）→ 解读产物完整结构 + 真实 directorNote，status `needs_review`，页面正常（不再卡运行态）。
4. 确认解读 → 角色阶段「角色图模型 gpt-image-2（项目默认）」Picker 正常。
5. 点「生成」→ 真实图片调用（~24-45s）→ 候选版本 imageUrl=cdn.pearapi.ai 真实图片，资产 model 更新为「PearAPI GPT-Image 2 测试」，版本链 SUPERSEDED→DRAFT 正确。
6. 全量 `tsc --noEmit` + `vite build --mode development` 通过。

### 本轮修复的运行时缺陷（同类问题汇总）

1. **NewProjectDialog 重复 import useSettingsStore** → vite 500 → 删重复行。
2. **ProjectParams 逻辑表达式与空合并混用**（`|| ??` oxc PARSE_ERROR）→ 加括号。
3. **ProjectParams 从 settings store 取派生数组**（filter().sort() 每次新引用）→ React 无限重渲染白屏 → `useShallow` 包裹。
4. **InterpretStage import 丢失**（StageModelPicker / api）→ 补全；5 个 stage 文件 import 已全量核对。
5. **解读状态机**：真实调用后 status 误置 pending → 永远卡「正在运行解读任务」→ 改为 `needs_review`；running 判定只认 `analyzing`/job running。
6. **handleRetry 未清 executionTarget** → 重置后无法重新确认 → 补 `executionTarget: undefined`。
7. **解读结构丢弃**：真实调用只写 directorNote 破坏解读产物区渲染（tone undefined 崩溃）→ 改为 stash+注入完整结构。
8. **同步真实调用超时链（图片必现）**：execution httpClient 120s / handler ctx 180s / BFF client 180s / BFF withTimeout 180s → 全链统一 300s。实测修复前图片请求 2m 超时失败，修复后 ~24-45s 真实出图成功。

### 后续待办

- 视频生成模型接入真实异步任务（当前仅选择器 UI，用户明确暂不验收）。
- 阶段模型槽的「修改执行目标」重映射容量联动已在解读流程内（执行目标锁定后容量项重算）。

### analyze 三步精简 + 执行目标移至视频生产

**用户口径（本轮）**：首次解读页设置项太多，只保留三种内容；导演规则不跳规则中心；视频衔接属视频生产阶段；执行目标整体迁至 ProductionStage；评审权归用户，系统不判断质量。

**前端改动**

1. `InterpretStage` 引导区精简为 3 步：
   - ① 剧本核对（ScriptReview，源剧本不可变，草稿可编辑）
   - ② 导演解读规则（内联折叠卡：规则名 + 字数 + 「平台默认/已覆盖」徽标 + 展开全文；解析走 `resolvePromptRule(project,'interpretation',templates)`；附说明「规则中心可编辑/新增模板，项目参数选择生效规则」——不跳转）
   - ③ 解读文本模型（StageModelPicker text 槽，可随时更换）
   - 动作：「确认并生成解读」按钮（未核对剧本时 amber 提示 + 禁用；生成中 loading）
2. 删除：视频模型 radio 列表、视频衔接选择器、交付方式展示、「确认执行目标并解读」旧按钮。
3. 解读产物区：删除「执行目标」卡片（模型/单元上限/交付方式/修改执行目标）——执行目标整体后移。
4. `useInterpretFlow`：
   - 去掉 pending 启动对 `executionTarget.confirmed` 的依赖；
   - 新增 `startInterpretation(episodeId)`：点击按钮后真实文本调用成功 → stash 原文 → 直接登记 interpret job 并置 `analyzing`（幂等），不再依赖 effect 状态变化触发；
   - pending 分支的 effect 仅作刷新恢复兜底（已有活跃 job 或已有暂存原文才启动），避免页面加载自动解读。
5. `ProductionStage` 顶部新增「执行目标」锁定区：视频模型 Picker（决定单元时长上限）+ 衔接模式（TRANSITION_MODES 双按钮，默认继承项目设置）+ 「确认执行目标」→ 写入 `executionTarget {model, maxUnitSeconds, deliveryMethod:'model', transitionMode, confirmed}` 并按新容量重映射（`buildCoverageRemap` + `buildExecutableUnits` + 重建 production 清单 + directing 容量项退回 AWAITING_USER）；「重置」清除执行目标。拍摄 runShot 前置 gate：未确认执行目标不允许拍摄。

**实测（proj_deb825d67e5748c68ffe0ef3e3d65f76-ep-1）**

1. analyze 引导区 = 剧本核对 + 导演解读规则（内联）+ 解读文本模型，无视频模型/衔接/执行目标项。
2. 页面加载不自动解读（门控生效）；点击「确认并生成解读」→ 真实文本调用 → status `needs_review` + 完整解读产物。
3. 视频生产页：执行目标锁定区渲染正常，点「确认执行目标」→ executionTarget `{MiniMax H3, 15s, model, first_last_frame, confirmed}` 落盘 + 单元重映射 5 units；容量相关导演项退回待复核，Gate 引导用户复核后继续（重映射闭环）。

**本轮修复的运行时缺陷（续）**

1. **HMR 后重复 import 同名标识符**（`stashRealDirectorNote` 两行 import）→ oxc PARSE_ERROR、vite 500、页面白屏 → 合并 import 行。
2. **管道掩盖退出码**：`npx tsc | head` 的 `$?` 是 head 的退出码 → 改为输出重定向后再取 `$?`。
3. **启动信号缺失**：`updateEpisode({status:'pending'})` 值不变 → effect 依赖不变化 → 解读任务永不启动 → 改为点击后直接 `startInterpretation()`。
4. **上游输出截断**：pearapi(deepseek-v3.2) 对长导演解读 prompt 偶发返回 1 字符内容 → confirmTarget 增加 `<20 字符` 视为失败（不伪造，提示换模型/重试）。

### 导演解读规则注入文本模型（三层提示词）

**问题**：导演解读规则（`directorRule.content`）此前只在前端 UI 展示，真实文本调用 prompt 为硬编码要点 + 剧本——文本模型看不到生效规则，也无角色职责/边界/输出契约，存在越权（改因果/编事实/判质量）与输出不可控风险。

**改动**（`InterpretStage.confirmTarget`）：真实调用改为三层提示词
1. **System 角色与边界**：只做导演解读与创作规划，不生成图片/视频/资产；不得改变剧情因果/人物动机/关键动作/台词原文，剧本未提供的事实须显式标注「假设：」；不评判剧本或成片质量（质量由用户评审）；输出须结构化六部分。
2. **生效规则注入**：`【本集生效的导演解读规则（必须严格执行）】+ directorRule.content`（平台默认或用户已覆盖规则全文）。
3. **输出契约 + 剧本**：固定「一、剧情任务与情绪目标 … 六、假设清单」结构 + 单集剧本。

**实测结论**：pearapi 渠道 deepseek-v3.2 当前异常——`completion_tokens=1`、content 只返回 `{`（连「你好」亦然，BFF 与浏览器一致；此前曾偶发完整输出）。判定为上游渠道问题，非应用代码问题；前端 <20 字符防御已拦截并不伪造。完整输出验证需另配可用文本渠道后重跑。

### 模型配置页：预览请求=模型实际配置 + 测试调用 \uXXXX 解码

**问题 A（附图 ec2e94a2）**：「预览请求」原样展示协议基线——模型 `mod_aaaaaaaaaaaaaaaaaaaa` 库内 `request_path=NULL`（未跟随协议 `/v1/chat/completions`）且无参数覆盖，预览 URL 只有渠道 BaseURL、body 全为模板静态值，用户感知「没有变化」。

**改动**
1. `model-catalog.ts`：`ModelParam` 增 `overridden?: boolean`（模型级覆盖标记）。
2. `SettingsModels.tsx` `mergedParams`：覆盖协议模板已有参数 → 保留来源/类型/说明并标 `overridden:true`；模型新增参数同样标记。编辑回填 `requestPath/method` 时回退协议模板值（`(m.requestPath || tpl.requestPath) ?? ''`）；请求路径输入框占位改「留空=跟随协议模板路径」。
3. `ProtocolPreview.tsx`：静态参数行按 `overridden` 渲染 `// 模型覆盖默认值` vs `// 静态默认`；预览底部注明「请求路径未单独填写时跟随协议」。

**问题 B（附图 48a421b5）**：测试调用失败时上游错误与「原始响应体」展示 `\u4e0d\u652f\u6301\u7684\u6a21\u578b` 等 JSON 转义序列，不可读。

**改动**：`SettingsModels.tsx` 新增 `decodeEscapedUnicode()`（正则 `\\u([0-9a-fA-F]{4})` → 字符），接入 `testResult.error` 与「原始响应体」`<pre>` 展示。

**附带修复**：测试调用遇非 run 结构响应（如 422 凭据缺失 `{code,message}`，无 `run` 字段）时结果区不渲染、仅有 toast → catch 分支改为构造 `{status, duration:'-', error: msg}` 渲染进结果区，任何失败均有可见反馈。

**实测（浏览器）**：编辑 PearAPI GPT 测试 → 预览请求 = `POST https://api.pearapi.ai/v1/chat/completions`，body `model:"gemini-3.8-flash"（模型注入 providerModel）`、`temperature:0.3 // 模型覆盖默认值`、其余 `// 静态默认`；测试调用发送真实请求 → 显示 `upstream 400: {"error":"不支持的模型"}`（已解码）。

**本轮运行时缺陷清单（续）**
1. `|| ??` 混用导致 oxc PARSE_ERROR（`m.requestPath || ...?.requestPath ?? ''` 等 3 处）→ 统一 `(a || b) ?? c` 括号包裹。
2. 后端服务进程意外退出（bff 8080 / execution 8085 / production 18081 / asset 18084 全挂，仅 workspace 存活）→ 502「服务端不可达·本地缓存」→ 按本地 env 组合重启（DSN/token/上游 URL/minio 端点均需覆盖 docker 主机名）后恢复，任务验收须先探健康再实测。
3. 卡片操作按钮为纯图标（无文字）→ bu.find('编辑能力') 定位失败，需按 `title/aria-label` 定位。

### 开发质量红线（Awwwards 级自检清单 · 每轮交付前必查）

> **单一权威**：开发质量门禁与反例黑名单以 `docs/development/frontend-quality-gate.md` 为准——「交付门禁」三层六步强制流程（L1 组件基类根治 → L2 `npm run gate` 静态扫描 → L3 浏览器兜底）+ 反例库 R1-R10 + 规则库 R-UI/R-DATA/R-CRUD/R-HOOK。本节为速查索引，交付前必须按 `docs/development/frontend-quality-gate.md` 执行，不得以本节代替（迭代教训流水记入 `docs/development/iteration-qa.md`）。

> **静态门禁优先**：任何前端交付必须先 `cd apps/web && npm run gate` 达 GATE=0（严格 typecheck `tsconfig.app.json` + eslint + `quality-gate.mjs` 静态扫描反模式）。代码层面可静态判定的问题（类型错误、未用 import、`||/&&` 与 `??` 混用、grid 列缺 `min-w-0`、Select 基类 `w-fit`、页面级 `max-w-xl/2xl`、纯图标按钮缺可访问性标注）一律在开发期拦截；浏览器（L3）只验静态测不到的事实（最终渲染、真实请求链路、服务探活、交互反馈）。禁止把静态可判问题拖到浏览器验收（反例 R10）。

用户定义：以 Awwwards / Webby Awards / FWA 获奖级网站为品质标准。此规则不是口号——静态门禁通过后，浏览器截图 + getBoundingClientRect 检测确认无溢出、无重叠、无空白占位后才算完成。

**八维自检（每项 = 可执行动作）**
1. **排版**：所有 grid/flex 容器内长文本列加 `min-w-0`，按钮/输入用 `w-full` 覆盖基类 `w-fit`；`SelectTrigger`/卡片等可点击元素禁用 `whitespace-nowrap` 撑宽；文字超长用 `truncate` / `line-clamp-1` / `break-words`。每处布局截图或 rect 检测确认无交叉（`ox>0 && oy>0`）。
2. **留白**：同组间距统一（表单 12-16、卡片 16-24、区域 24-32），不挤不空；弹窗 `max-h + overflow-y-auto`，底部操作固定不随内容漂移。
3. **视觉层级**：标题 14/正文 12/说明 10 三档；主操作（primary）与次操作（outline）可辨识；不可交互内容禁用按钮样式。
4. **色彩**：深色主题下边框/背景/前景与既有 token 一致；状态色仅用于状态（success=成功区、destructive=失败区）。
5. **动效**：任何等待态必须有 spinner + 文案（"读取并校验中…/解读生成中…"）；动效仅 hover/focus/展开过渡，不持续空转。
6. **微交互**：可点击元素有 hover 反馈与 disabled 态；图标按钮必须有 `title`/`aria-label`（自动化与可访问性都可定位）。
7. **响应式**：弹窗与网格在窄视口不溢出（`min-w-0`、`w-full`、`max-h` + 滚动）；三列以上在窄屏允许换行而非挤压。
8. **原创性**：按业务场景定制交互（导演工坊/设置中心），不复制演示骨架；新页面首次交付前必须浏览器实测。

**已知反例清单（已修复，禁止回退）**
1. grid 内 `SelectTrigger` 默认 `w-fit` 溢出挤压相邻列（新建弹窗默认模型三列按钮重叠）→ `w-full min-w-0` + 列容器 `min-w-0`。
2. 视觉风格空白占位（"选择风格"+loading）→ 弹窗打开即默认选中首个 enabled 风格，图文（cover+name+version）直接展示。
3. CRUD 四态缺失（曾只做添加入口无删除/编辑/查询）→ 每页四态齐备 + 多选/全选批量删除 + 克隆。
4. 卡片/内容超出容器（渠道卡、协议参数）→ `max-h-*` + `overflow-auto` + `truncate`。
5. 测试调用失败无反馈（422 无 run 字段时结果区空白）→ catch 分支渲染错误到结果区。
6. 上游 `\uXXXX` 转义未解码（`\u4e0d\u652f\u6301\u6a21\u578b`）→ `decodeEscapedUnicode()` 统一展示解码文本。
7. `|| ??` 混用触发 oxc PARSE_ERROR / vite 500 → 一律 `(a || b) ?? c` 括号包裹。
8. 后端进程退出致 502「服务端不可达·本地缓存」→ 验收前先探 `/healthz`，重启后确认 4 端口再实测。
