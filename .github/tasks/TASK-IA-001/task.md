---
taskId: TASK-IA-001
status: 进行中
priority: P1（排期 v2 §3.3 第 2 波首位；解锁 CREATE 系列）
pr: #221
criteria: 15
criteriaPassed: 0
depends_on: TASK-AUTH-001（已合并 #203；⚠️ 热点文件冲突，见 §2）
---

# TASK-IA-001：模型中心/设置中心信息架构收敛重建（v14 P1）

> 本卡由平铺文件 `.github/tasks/TASK-IA-001-ia-budget-relocation.md` 迁入文件夹结构
> （AC-008/010/011：开工即建 devlog + acceptance；旧文件随本 PR 移除）。
> 排期依据：`docs/product/task-queue-plan-v2-2026-10-17.md` §3.3 第 2 波第 1–3 项。
> **范围扩展**：原卡只做「预算归位+渠道裁定」；2026-10-17 Owner 确认 v14 IA 稿后，
> 本卡扩展为 **v14 P1 收敛整体**（模型中心 6 项导航实装 + 设置 6 区重建 + 用量唯一入口 + 10 条重定向
> + StageModelPicker 个人默认层 + 权限走查 + ADR-005 终态同步）。

## 基本信息

- **任务 ID**：TASK-IA-001
- **创建日期**：2026-10-15（范围扩展：2026-10-17）
- **人类 Owner**：项目 Owner
- **AI 执行者**：AI Agent
- **优先级**：P1（v2 §3.3 第 2 波首位——它是 CREATE 系列的前置）
- **状态**：进行中（**设计稿 v14 评审已通过**，2026-10-17 进入开发）
- **验收清单**：[acceptance.md](acceptance.md)
- **设计稿**：[design-prototype.html](design-prototype.html)（= IA v14，评审通过；源文件 `prototypes/settings-redesign/设置中心与模型中心IA v14.html`）

## 背景（T13 走查暴露的设计缺陷）

Owner 走查 T13 全链路时发现：看成本在**模型中心**（`/models/costs`），配预算却在**设置中心**
（`/settings/preferences`），五站链路跨一级导航跳转，心智割裂。

## ⚠️ 范围修正（开工前核查，相对原卡有 2 处更正）

### 更正 1：缺口 ② 「设置『用量』导航未实现」**已由方案 A 解决**，本卡不再处理

原卡认为 ADR-005 定义的 4 项设置导航（模型/渠道/用量/偏好）中「用量」缺失、需裁定。
实测代码：`apps/web/src/features/settings/settings-navigation.ts:6-8,106-110` 已按**方案 A**
把「用量」**移出设置中心**，深链 `/settings/usage` → `/tasks?tab=ledger`（不 404），
且顶层导航已收敛为 3 项（模型/渠道/偏好）。

⇒ 该缺口已闭合，本卡**不重复裁定**；设计稿只需**确认现状**并纳入回归验证
（`tests/settings-navigation.test.ts` 已锁定"导航被改回 6 项"会失败）。

### 更正 2：缺口 ③「渠道归属重叠」的对象需重新界定

原卡写"模型中心「渠道与凭据」（占位）与设置「渠道」功能重叠"。实测更精确：

| 入口 | 现状 | task 文案 |
|---|---|---|
| `/settings/channels` | **已实装**（`SettingsChannels.tsx`） | 「模型从哪来、连不连得通」 |
| `/models/channels` | **建设中占位**（`ModelCenterLayout.tsx:34`：当前已开放 成本与用量/审计日志/健康） | 「模型从哪来：渠道、探活与凭据」 |
| `/models/health` | **已实装**（T11） | 「供给单元健不健康：成功率、错误码与熔断」 |

⇒ 真正的问题不是"模型中心渠道 vs 设置渠道"两方重叠，而是**三方**：
`/models/channels` 的文案与 `/settings/channels` **几乎同义**（用户无法区分），
而其"观测"职责已由 `/models/health` 承载。**裁定见设计稿 §4。**

### 缺口 ①（本卡主体）仍然成立

预算规则 UI 在 `/settings/preferences:237-287`（`TASK-MODEL-005` 交付），
与成本/健康/审计分属两个一级导航。**Owner 2026-10-15 拍板：方案 A —— 预算迁入
「成本与用量」页内区块（`/models/costs`），不新增导航项。**

## 范围

### 范围内（v14 P1 收敛，2026-10-17 扩展）

- ✅ **预算规则 UI 迁移**：`SettingsPreferences.tsx` 预算区块迁入 `ModelCosts.tsx` 页内「预算规则」区块；**复用现有组件与 API，数据层不动**（页面移动，非重写）
- ✅ **角色可见性对齐 AUTH-001**：区块可见=Viewer+；新增/删除=Admin+（页内操作按钮级）
- ✅ **模型中心 6 项导航实装**：`MODEL_CENTER_NAV` = 模型广场 / 模型目录 / 渠道 / 成本与用量 / 审计日志 / 健康（删 protocols 占位；「模型目录」仅改 label，路由固定 `/models/catalog|market|channels|costs|audit|health`）
- ✅ **模型广场实装**（`/models/market`）：真实调用模型+详情（capability 字段+渠道来源+note），默认仅启用，点卡片→详情抽屉；「设为默认」=**个人创作默认**（defaultPrefs，Owner 已确认）
- ✅ **模型目录实装**（`/models/catalog`）：已接入模型行+能力归属编辑（logicalModelId/优先级）+「待归属」标记；接入方式/参数映射/精细路由=专家模式
- ✅ **渠道页实装**（`/models/channels`）：3 步向导（①连通检测 ②同步上游=预览不入库+手动选接入方式 ③勾选添加=真实模型入库、归属后补）；删除渠道=确认弹窗+模型禁用/移除
- ✅ **设置 6 区重建**：设置导航=账号与安全 / 工作区与成员 / 外观 / 通知与默认行为 / 数据与存储 / 关于；外观含专家模式开关（新建，Admin+ 显示）+主题/语言迁入；通知与默认行为含默认模型/路由迁入；关于实装；账号/工作区/数据=显式占位
- ✅ **用量唯一入口=模型中心**（Owner 已确认）：任务中心「账目」页签移除（先核对与成本/审计重叠防丢视图）；`/settings/usage`、`/settings/audit`、`/tasks?tab=ledger` → 模型中心
- ✅ **10 条旧路径重定向**：全部可达不 404（`settings-navigation.ts` legacy 机制）
- ✅ **StageModelPicker 生效顺序追加个人默认层**（阶段覆盖→项目默认→个人默认→目录首项，P1 小改）
- ✅ **页面迁移伴随组件拆分**：SettingsChannels(679)/SettingsModels(820)/SettingsLogicalModels(591) → 拆分为 ≤300 行页面、≤500 行文件
- ✅ **权限矩阵落地**：新页面三角色走查断言（沿用 T13 链路）
- ✅ **清单同步**：`model-center-navigation.ts` / `settings-navigation.ts` 变更后跑 `npm run ui:generate` 同步三清单
- ✅ **ADR-005 修订终态**：实施完成后同步更新决策记录

### 非范围（保持）

- ❌ 权限矩阵体系本身（TASK-AUTH-001 已交付；本卡只做**页内按钮级**角色控制 + 新页走查）
- ❌ 预算功能增强（报表/预测/多币种）
- ❌ 自动匹配接入方式 / 成员邀请移除 / 团队共享预设 / 导出 / 真实账号体系（= v14 §五 P3 增量）
- ❌ CREATE 系列工作台布局（本卡只为其提供稳定导航基座）

## §2 前置依赖与冲突面（排期 v2 §2）

| 项 | 内容 |
|---|---|
| 前置 | `TASK-AUTH-001`（已合并 #203）——预算区块的角色控制需其角色体系（`useAuthStore` / `RequireRole`） |
| ⚠️ **热点文件冲突** | 本卡与 AUTH-001 改**同一对文件**：`apps/web/src/features/model-center/model-center-navigation.ts`、`apps/web/src/features/settings/settings-navigation.ts`。AUTH-001 已合并，**本卡开工前必须先 rebase 到含 AUTH-001 的 develop**；两者**不得并行开工**（`parallel-worktree` 热点文件规则） |
| 后续 | CREATE-001~006（依赖本卡 + 组件基座 stable） |

## 验收标准（设计稿 v14 评审通过，acceptance.md 细化为四要素判据）

1. `/models/costs` 页内可见「预算规则」区块，Admin+ 可新增/删除，Viewer 只读（操作入口不渲染）
2. `/settings/preferences` 预算入口 legacy redirect 正确，不 404；偏好页职责单一
3. 模型中心 6 项导航实装（广场/目录/渠道/成本/审计/健康），label 无内部词，路由固定
4. 模型广场展示真实模型+详情（capability），默认仅启用；设默认=个人创作默认（defaultPrefs）
5. 模型目录支持能力归属编辑（logicalModelId/优先级）+ 待归属标记
6. 渠道 3 步向导：同步=预览、添加=入库（归属后补）；删除渠道确认弹窗
7. 设置 6 区导航重建；外观含专家模式开关（Admin+）+主题/语言迁入；账号/工作区/数据显式占位
8. 任务中心「账目」页签移除（先核对重叠）；`/settings/usage`、`/settings/audit`、`/tasks?tab=ledger` → 模型中心
9. 10 条旧路径重定向全部可达，不 404（ADR-005 §6 不变量）
10. StageModelPicker 生效顺序追加个人默认层（阶段→项目→个人→目录首项）
11. 迁移页面 ≤300 行 / 文件 ≤500 行（组件拆分）
12. 权限矩阵落地：新页面 Owner/Admin/Viewer 三角色走查断言通过（沿用 T13 链路）
13. 导航清单三处同步（`ui:generate` 后 `ui:check` 绿）
14. 前端门禁 `npm run gate` = 0/0；`npm test` 全绿（含 `settings-navigation` / `auth-navigation`）
15. ADR-005 修订至终态（与实施结果一致）

## 流程（AC-009 强制）

```
设计稿（IA v14 评审通过）→ 开发 → 勾对 → PR
```

**设计稿评审已通过（2026-10-17，10 轮评审收敛）。** 开发按 acceptance.md 勾对。

## 测试命令（开发阶段用；本 PR 不适用）

```bash
cd apps/web
npm run gate          # typecheck + eslint + quality-gate
npm test              # node:test + vitest
npm run ui:check      # 三清单同步
npm run visual:check  # 7 页视觉回归（本地）
```
