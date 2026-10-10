# 镜序 Studio · 前端原型（漫剧导演工坊）

按「镜序 Studio 前端与漫剧导演工坊设计方案」重构后的纯前端原型。产品边界：**无限画布独立成页**（React Flow，不参与漫剧 Gate）；**漫剧导演工作台只用工坊式界面**（项目 → 剧集 → 阶段任务 → 审核 → 生产，页面不出现节点画布/连线）；图片 / 视频 / 音频工作台负责直接生成；镜头语言库提供可引用的专业表达；资产库统一检索与追溯。

## 启动

```bash
npm install
npm run dev
```

打开终端输出的本地地址即可使用。业务数据存于浏览器 localStorage，key 统一前缀 `mdp:`（projects / episodes / assets / tasks / settings / ui / canvas）。

也可以通过 [本地 Compose](../../deploy/local/README.md) 构建并启动容器版演示前端。镜像用多阶段构建，将 Vite 的 `dist/output` 与 `dist/output_resource` 组合为同源静态站点；容器版仍然是演示数据，不会自动接通后端。

## 数据边界（演示模式）

- **全部为前端模拟**：不接后端 / BFF / SSE / ComfyUI 真实接口，无任何真实请求。
- 所有模拟处均标注「演示模式」或显式说明：任务进度、生成结果、连接测试、费用预估均为占位。
- 关键契约按设计文档模拟：**三类状态分离**（执行任务 / 内容产物 / 项目经营状态）、**Gate 审核绑定版本 + 哈希 + 用户声明**（追加式审核日志）、**生成成功不自动采纳**（Take / 候选需人工选择）、**幂等可恢复任务**（刷新不重复提交）、**版本化资产与 STALE 波及**、**进度用可解释指标**（done/总数 + 待审核 + 阻塞，不用虚假单一百分比）。
- localStorage 的示例数据仅用于演示，不代表生产权威状态。

## 技术栈

React 19 + Vite + TypeScript · Tailwind CSS v4 + shadcn/ui · react-router-dom v7 · zustand（persist）· framer-motion · lucide-react · @xyflow/react（独立无限画布，懒加载）

## 路由

| 路由 | 页面 |
|---|---|
| `/` | 首页：最近项目 / 创作启动区 / 创作广场 |
| `/canvas` | 独立无限画布（React Flow：缩放 / 平移 / 连线 / 节点参数侧栏 / 版本化保存 / 提交为候选资产） |
| `/create/image` `/create/video` `/create/audio` | 智能创作（线路选择 / 费用预估 / 独立任务进度 / 结果历史；参考图槽位：本地上传或从资产库选，按身份/风格/构图/姿态/线稿绑定权重，视频额外首帧/尾帧；提示词 @ 唤起资产库与镜头库引用并显示绑定版本；音频首期语音合成试听 / 下载占位） |
| `/comic/projects` | 漫剧导演工坊 · 项目列表 |
| `/comic/projects/:projectId` | 项目总览：参数 / 进度投影 / 拆集任务（幂等）/ 候选确认锁定 / 剧集卡 / 项目资产库 |
| `/comic/projects/:projectId/episodes/:episodeId/:stage` | 单集工坊：`analyze` 解读 → `characters` 角色 → `props` 道具 → `scenes` 场景 → `production` 生产（Shot/Unit/Take）→ `done` |
| `/tasks` | 任务中心（筛选 / 重试 / 上下文跳转，按 Job ID 恢复） |
| `/shot-language` | 镜头语言库（分类 / 搜索 / 新建模板 / 引用到 Shot 草案） |
| `/assets` | 资产库（类型 / 项目筛选 + 追溯：版本历史 / 审核日志 / 哈希） |
| `/settings/channels` `/settings/models` `/settings/preferences` | 设置台（渠道 Secret 只写不回显 + 连接测试诊断；模型配置；主题 / 语言 / 默认路由） |

旧路由 `/drama*`、`/lens` 已迁移跳转到新目录。

## 单集工坊阶段与 Gate

- **analyze 首次解读**：逐步展示任务事件（解析原文 / EV·DLG·LOCK 提取 / director_analysis / media_implementation_plan）；解读产物保留「原文事实 / 连续性约束 / 导演建议 / 未决项 / 用户决定」边界；自动定位到资产页不代表 approve。
- **characters 角色资产**：清单 → 提示词编辑（保存新版本 / 按导演规则重解读）→ 生成候选 → 用户批准（绑定版本 + 哈希 + 声明）；批量生成独立任务进度 + 费用预估；可标记全局。
- **props 道具资产**：独立于角色组件，记录来源事件 / 持有者 / 出现集；生成 → 采纳 / 退回；全局标记。
- **scenes 场景资产**：功能稿 → 母版 → 派生视图 → scene_map（空间骨架）→ 走位 → 机位；母版确认后进入生产。
- **production 后续生产**：Shot（导演事实）→ Unit（执行单元）→ Take（实际结果）；生成成功不自动采纳，人工采纳 / 退回；全部采纳后可完成本集并更新项目进度。
- 未通过前置 Gate 时，后续阶段显示阻塞原因并可跳回前置阶段。

## 目录约定

```
src/
├── index.tsx / app.tsx      # 入口与路由（模板自带，勿改结构）
├── layouts/                 # AppShell / SideNav / TopBar（镜序 Studio 导航）
├── pages/                   # 路由页面
├── features/                # 业务组件（comic 工坊 / canvas / home / settings）
├── components/common/       # EmptyState / FilterBar / ResourceList / GenWorkbench / DemoBadge
├── components/ui/           # shadcn 组件（勿改）
├── stores/                  # zustand store（persist：项目/剧集/资产/任务/设置/UI/画布）
├── mocks/                   # 模拟数据（styles/projects/episodes/assets/lens/square/shots）
├── hooks/                   # useSplitFlow / useInterpretFlow / useFakeGeneration
├── lib/                     # placeholderUrl / mockHash / projectMeta / utils
└── types/index.ts           # 业务类型（三类状态 + 审核日志 + 版本化资产）
public/placeholders/         # 本地占位图（不依赖外部图片服务）
```
