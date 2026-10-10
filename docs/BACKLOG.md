# 待办清单（Backlog）

> **用途**：记录**已识别但暂缓**的工作，以及"什么条件满足后才启动"。
> 与 `.github/tasks/` 的区别：任务卡是**正在做**的事，本文件是**决定先不做**的事。
>
> 规则：任何项被暂缓时都必须写清**启动条件**；条件满足后移入 `.github/tasks/` 成为任务卡。

---

## 决策记录

### 2026-10-10：先做模型中心底座，暂缓上层功能

**Owner 判断**：本项目所有能力都建立在 AI 模型之上，但**模型中心（AI 模型聚合网关）底座尚未搭好**；
先集中做底座，其余暂缓。

**赞同的依据（实测）**：

- 模型网关是**唯一**的通路 —— 漫剧工坊（分镜→图→视频）、无限画布（节点=生成）、
  智能创造（生成）、规则中心（提示词要发给模型）、知识库（角色/场景提取也是模型调用）
  **全部**依赖它
- 底座当前的真实短板：`ExecutorTypeAPI` 是唯一打通的执行器；真实协议模板只有 4 个
  （openai/minimax/jimeng/grsai）；ComfyUI 两类未实现；媒体处理 0 命中；
  **路由层几乎空白**（一个模型只绑一个渠道，无降级）
- 上层功能（画布/知识库/UI 重构）在底座不稳时开工，等于在沙地上盖楼

**因此**：以下项暂缓，直到底座就绪。

---

## P0 暂缓项

| # | 项 | 为什么暂缓 | 启动条件 | 已有产物 |
|---|---|---|---|---|
| 1 | **无限画布**（React Flow） | 画布的每个节点都是模型调用；节点引用的是"必然失效的上游 URL"（见 #4） | 模型网关可用 + 调研第 2–4 轮完成 + ADR 定稿 | 第 1 轮调研（LibTV 能力对齐矩阵，见下）+ 技术选型已定（React Flow） |
| 2 | ~~**智能创造三工作台 UI 重构**~~ → **已启动（2026-10-10）** | 启动条件已核对通过：`model_catalog.capability` 已在目录响应中返回、能力端点 `GET /internal/v1/catalog/models/{id}/capabilities` 已存在且经 BFF `catalogProxy` 泛化转发可达；execution 装配引擎已打通真实 HTTP | ✅ 已满足（**但协议模板 `capabilities` 仅 2/9 有声明**，故采用"能力优先 + 三级降级"而非单一数据源） | **ADR-006**（信息架构与参数面板重设计）+ 竞品调研（`docs/research/chinese-ai-gen-ux-teardown-2026-10.md`）+ 任务卡 `TASK-CREATE-001`（片 1 已实现：能力驱动控件 schema + 15 个单测）；分支 `feat/create-workbench-2026-10-10` |
| 3 | **项目知识库**（道具/场景建表 + 镜头语言库/风格库接后端） | 优先级低于底座；且镜头/风格库的价值依赖"生成质量" | 底座就绪后可立即开工（**技术上不依赖底座**） | 现状证据：`useLensStore`/`useStyleStore`/`useProjectPropStore`/`useProjectSceneStore` 均 **0 个 API 调用**；`project_props`/`project_scenes` **无表**。**新增**：ADR-006 D7 先在智能创作接本地 store，接后端仍按本条启动条件 |
| 4 | **生成产物落盘到 MinIO** | 上游（如 AutoDL）结果 URL **有效期短**，过期即无法下载；而生产对象存储已确认为 **MinIO** | **建议提前做**（见下方说明） | 方案二选一：(a) execution 成功后写入 asset 服务；(b) 前端下载后经 asset 上传。**新增证据（ADR-006 §3.4）**：可灵官方明示结果 **30 天后清理**、Vidu **24 小时过期** → "生成成功但图打不开"是上游产品的通病，本条优先级应上调 |
| 5 | **AutoDL 云端 ComfyUI 接入** | 前置已就绪，但依赖底座 | 底座可用 + 提供 `workflow_id` 与工作流入参示例 | ✅ `auth_type=token`（PR #37）已支持裸 Token；异步三要素已核实可表达（`statusField=data.status`、`doneValue=SUCCESS`、`failValue=FAILED`、`pollPath=…/result/{task_id}`） |
| 6 | **媒体处理**（缩略图/转码/时长/封面/EXIF） | 必须有产物落盘（#4）才有输入 | #4 完成 | 实测：thumbnail/resize/transcode/ffmpeg/exif **0 命中** |
| 7 | **Agent 双入口**（LibTV 式 Skill 接口） | 战略项，需底座提供稳定能力面 | 底座稳定 + 单独调研 | 已有雏形：`ai-video-shot-design-designer-skill` 仓库 + 本仓库 Agent 规范 |
| 8 | **可观测性 / 测试分层 / 前端首屏** | 阶段 3 | 底座与主要功能稳定 | `docs/OBSERVABILITY.md` 已定义指标；`lazy()` 计数实测为 **0** |

---

## 2026-10-10 新增：改造「智能创作」时发现的三处底座缺口

来源：ADR-006 §1/§6/§3.8 的实测核对。**三条都不是 AI 可自主决定的范围**（涉及 DB 约束、执行器与跨服务契约），故登记在此而非直接开工。

| # | 缺口 | 实测证据 | 启动条件 |
|---|---|---|---|
| 9 | **音频没有模型类型** | `model_catalog.type` 的 CHECK 仅允许 `('text','image','video')`（`004_catalog.sql:23`）→ 音频模型**无法入库**；execution provider resolver 硬拒绝非三类（`provider.go:85`，且有测试断言 `Type:"audio"` 报 `ErrUnsupportedModelType`）→ 音频**无法执行**。而 `DESIGN.md` §3.4 要求"音频首期支持语音合成…其他音频能力由模型目录声明" | Owner 决定是否把 `audio` 纳入 `type` 枚举（需 production 迁移 + execution 适配器）。在此之前，音频工作台**只做 composer 重构并如实标注"未接入执行链路"** |
| 10 | **协议模板 `capabilities` 仅 2/9 有声明** | `021_protocol_capabilities.sql` 只为 `pt_builtin_openai_img`、`pt_builtin_openai` 写入；其余 7 个内置模板为 `{}` | 补齐 7 个模板的能力声明（模板级 `param_mapping` + `required_params`），使"提交前必填校验"与"协议字段映射"能在前端生效 |
| 11 | **`capability` 表达力不足：无"条件支持"，且比例/清晰度只有数量没有清单** | 可灵官方能力地图含"**条件支持**"（如「仅 1080P 且仅无声视频」），我们只能表达支持/不支持；`capability.aspectRatioCount`/`qualityTiers` 是**数字**，目录里**没有任何地方**声明具体是哪些比例/档位取值 | 随 ADR-006 D3-B / 待确认问题 8 一起做：`capability` **追加** `aspectRatios: string[]`、`qualityOptions: string[]` 与条件能力表达（保留原字段向后兼容） |
| 12 | **积分账本（credits ledger）缺失** | 全仓 `grep -rln "credits\|ledger\|wallet\|balance" services/*/internal services/*/migrations` **命中为 0**；`cost_estimate` 只是展示用字符串。而竞品范式是「生成前可见 + **失败退回** + 明细可查」（可灵：生成即扣、失败退回、登录值当日清零、结构化 `billing[]`；Vidu：`credits` 回执、错峰更低、失败返还） | 需要积分/额度账本（扣费、退回、明细、并发额度与余额分离）。**在此之前，智能创作只能"预估展示"而不能"退回"**，UI 必须如实声明口径（ADR-006 D10） |
| 13 | **取消语义未区分状态** | `services/execution/internal/job/store.go:143` 的 `Cancel` 对 `queued` 与 `running` 用同一条 SQL（`status IN ('queued','running')`）处理；前端 `Tasks.tsx` 同一按钮同一接口。这正是 ComfyUI PR #7788 记录的缺陷模式（pending 取消静默失败），也与 fal（`IN_QUEUE` 立即移除 vs `IN_PROGRESS` 只发信号）和 Replicate（`aborted` 不计费 vs `canceled` 按已运行计费）的区分相悖 | 与 #12 一起做（取消必须与计费口径绑定）；**UI 侧的状态区分已由 ADR-006 D10 落地**（智能创作页对 `queued`/`running` 给不同确认文案与计费说明），后端状态机仍待补 |
| 14 | **生成结果写回链路缺失** | 全仓 grep 写回 `intent_payload` 的 `result` 命中为 **0**：同步端点 `POST /internal/v1/tasks/run` 只把 `Extracted` 返回给调用方（`services/execution/internal/httpapi/handler.go:635`），**不落库**；`jobs.intent_payload` 只在创建时写入（`:174`）。后果：任务 `succeeded` 也没有产物地址，智能创作页只能显示占位图并如实标注「该任务未返回真实产物地址」。**注意**：`comic/CharacterStage.tsx:646` 与 `ProjectCharacterLibrary.tsx:235` 已在轮询 `payload.result` —— 即它们依赖的写回路径目前并不存在 | 需要 worker 执行 job 并把结果（经响应映射提取）写回 `intent_payload.result`，最好同时落 asset/MinIO（见 #4）。完成后智能创作的真实产物预览**无需改前端**即可生效（`apps/web/src/features/genworkbench/result-utils.ts` 已做前向兼容的地址探测与媒体类型判定） |
| 15 | **任务无删除接口** | execution 只有 `{id}/cancel` 与 `{id}/retry`（`services/execution/internal/httpapi/handler.go:54-62`），**没有 DELETE**。因此智能创作结果区不提供「删除」，避免用「仅本地隐藏」冒充删除 | 需要 job 的软删除/归档语义（含审计留痕），与 #12/#13 同批评估 |


### 关于 #4 的建议（请 Owner 决断）

即使画布暂缓，**#4 也建议尽早做**：#5（ComfyUI）、#1（画布）、#6（媒体处理）都以它为前置。
若不落盘，产物实际上被"托管"在上游的临时链接上 —— 用户过几分钟再点"采纳"就会失败，
表现为"生成成功但图打不开"。

---

## 明确**不做**的项（避免假承诺）

| 项 | 决策 | 说明 |
|---|---|---|
| **本地 ComfyUI 执行器**（`comfyui-local`） | **不做** | Owner 明确：本地未做适配，**只支持接入云端 GPU 算力**。建议清理代码中该执行器类型，或让它返回明确错误（"本地 ComfyUI 不支持，请使用云端工作流 API"），避免用户看到选项却永远失败 |

---

## 已识别的其他待办

| 项 | 说明 |
|---|---|
| **Dependabot 10 个 PR** | 含 `actions/checkout` 4→7、`actions/setup-go` 5→7、`setup-node` 4→7 等**大版本升级**，需逐个评估兼容性（大版本可能改变行为，如 Node 版本要求） |
| 任务超时态（`timeout`）的前端展示 | 状态机已支持，UI 未体现 |
| 审计写入失败当前被忽略 | `_ = h.AuditStore.Insert(...)` —— 已知问题，见 `CHANGELOG.md` Known Issues |

---

## 第 1 轮画布调研结论（暂存）

**对标对象**：LibTV（LiblibAI，2026-03-18 发布），定位"首个同时面向人与 Agent 的专业视频创作平台"，
以**「无限画布 + 节点式工作流」**为基础组织剧本/分镜/镜头/剪辑。
来源：[极客公园](https://w.geekpark.net/news/361466)｜[C114](https://www.c114.net.cn/ainews/69475.html)

**已对齐**：主体库（角色一致性）← 我们已有项目级角色库（ADR-002）；多模态模型统一 ← 我们已有模型目录
**主要差距**：无限画布本身、节点级版本/复用、画面推演、多机位宫格、灯光控制、镜头聚焦、剪辑节点、Agent 入口

> ⚠️ 以上为媒体报道（含厂商口径），**未经实际使用验证**，仅作调研参考。

**待完成**：第 2 轮（主流产品画布交互拆解）→ 第 3 轮（参考实现与许可证）→ 第 4 轮（我们的落地映射 + ADR）
**Owner 已定**：第一版**不做全量对齐**，先把画布基础打好。
