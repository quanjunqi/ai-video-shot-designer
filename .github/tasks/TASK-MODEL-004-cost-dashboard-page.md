# 任务卡：T2-2 成本看板页面 + 审计归因展示

> 按 `.github/TASK_TEMPLATE.md` 填写。本卡随 PR 附上。

## 基本信息

- **任务 ID**：TASK-MODEL-004
- **任务名称**：T2-2 成本与用量页面（web）+ 审计日志归因列展示
- **创建日期**：2026-10-13
- **人类 Owner**：quanjunqi
- **AI 执行者**：Doubao MainAgent
- **优先级**：P0（A 轨 T2 第二刀）
- **预计工时**：2-3 人日
- **依赖**：T2-1（聚合 API）、GATE-2 高保真稿（v2.2-final 锁版，成本页视觉基准）

---

## 1. 目标

按 GATE-2 高保真稿（`prototypes/model-center/模型中心高保真稿.html`「成本与用量」页）实现成本看板前端页面，并让审计日志页展示 T1 归因列（shot/feature）。页面 ≤8 交互容器、≤300 行（ADR-005 §5）。

## 2. 背景与相关文件

- **高保真稿成本页结构（GATE-2 锁版，renderCosts）**：
  - 4 个 KPI 卡：今日成本（+环比）、调用量（+成功率）、P95 延迟、预算使用（月预算 %）
  - 近 7 日成本趋势图（日/周/月 chips 切换）
  - 维度筛选面板：渠道 × 逻辑模型 × 项目 × 成员（四维 chips）
  - 预算配置区（T3 才做编辑；本刀只读展示预算使用率，无 budget_rules 数据时显示「未配置」占位）
  - note-line：双口径说明
- **审计日志页**：现有表格补 `归因` 列展示（project/episode/shot/feature）+ 归因筛选；普通成员仅见本工作区（沿用现有权限）。
- **数据来源**：T2-1 API（`/internal/v1/audit/stats`、`/stats/trend`）经 BFF 透传（沿用 `src/lib/api/client.ts` 方法段追加）。
- **相关文件**：
  - `apps/web/src/features/modelcenter/`（新，模型中心一级导航 + 成本页；六页面入口先落壳，本刀只实装成本与用量 + 审计日志归因）
  - `apps/web/src/lib/api/client.ts`（+stats 方法段，只追加）
  - `apps/web/src/config/navigation.ts`（+模型中心一级导航 /models）
  - 路由：`/models/costs`（成本与用量）、`/models/audit`（审计日志，补归因列）
  - `.github/tasks/TASK-MODEL-004-cost-dashboard-page.md`（本卡）

## 3. 范围 / 非范围

**范围**：
1. 模型中心一级导航壳（/models + 侧边六入口：模型目录/模型广场/渠道与凭据/成本与用量/审计日志/协议模板；未实装页面显示「建设中」占位——严格照高保真稿 IA）
2. 成本与用量页：
   - 4 KPI 卡（今日成本/调用量/成功率/P95/预算使用）
   - ECharts 成本趋势图（日/周/月切换，双口径图例）
   - 四维筛选 chips（渠道/逻辑模型/项目/成员），切换后刷新 KPI + 趋势 + 排行
   - 排行列表（按选中维度 topN：调用量/成功率/p95/成本）
   - 预算使用只读条（T3 前「未配置」占位）
   - loading / error / empty 三态（R-CRUD-001）
3. 审计日志页：表格 + 归因列（project/episode/shot/feature 合并展示）+ 归因筛选输入；导出沿用
4. 与 T2-1 API 联调：真实数据驱动（非 mock）

**非范围**：
- 预算配置编辑（T3）
- 模型目录/广场/渠道页（T6/T8）
- 渠道健康面板（T11）
- 权限深度控制（T10，GATE-4 矩阵：本刀按管理员视角可看全部，普通成员工作区隔离沿用后端）
- 视频真实调用测试（用户已明确禁止）

## 4. 验收标准（判据四要素）

| # | 判据 | 对象 | 例外 |
|---|---|---|---|
| 1 | `/models/costs` 页面渲染，4 KPI + 趋势图 + 四维筛选 + 排行 + 预算占位齐全 | 浏览器 L3 验证（起前端 + BFF + 真实 API） | 后端数据为空时展示 empty 态 |
| 2 | 四维筛选切换 → KPI/趋势/排行按 T2-1 API 刷新（真实请求，非前端假数据） | 浏览器走查 + network 面板核对请求参数 | 单维度无数据时 empty 态 |
| 3 | 日/周/月切换 → 趋势图粒度变化正确 | 浏览器验证 | — |
| 4 | 审计日志页显示归因列（shot/feature）+ 归因筛选生效 | 浏览器验证 + API 参数核对 | 历史行无归因显示「—」 |
| 5 | 页面 ≤8 交互容器、≤300 行（ADR-005 §5） | 代码审查 + 行数统计 | 拆子组件不计入单页行数（按文件计） |
| 6 | `npm run gate` GATE=0（typecheck + eslint + quality-gate） | 前端门禁 | CI 为准 |
| 7 | 八维自检（排版/留白/视觉层级/色彩/动效/微交互/响应式/原创性）无明显可提升项 | 对照 GATE-2 视觉语言 + frontend-quality rules | — |

## 5. 测试命令

```bash
cd apps/web && npm run gate
# 浏览器 L3：起前端(5173) + bff(8080) + execution(8085)，打开 http://localhost:5173/models/costs
```

## 6. 约束与禁止事项

- 严格照 GATE-2 高保真稿视觉语言（teal 主色体系），禁止另起样式
- 禁 `git add -A`；按路径 add + `git diff --cached --name-only` 核对
- 禁 mock 假数据混入真实 API 路径（演示数据只允许开发占位，交付前清除）
- 组件命名 PascalCase 文件同名；zustand store 避免 prop drilling（frontend-quality）
- 不引入新 UI 组件库（沿用 components/ui/*）；图表用 ECharts（现有依赖）
- 普通成员/管理员/超管权限差异本刀不做（T10），但页面结构预留
- 禁僵尸按钮：未实装入口必须「建设中」占位反馈，禁止可点无响应

## 7. 输出

- 分支 `feature/t2-cost-dashboard-<日期>` → PR → develop（merge commit）→ 删分支/worktree
- 任务卡 `.github/tasks/TASK-MODEL-004-cost-dashboard-page.md`
