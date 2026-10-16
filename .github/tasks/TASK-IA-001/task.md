---
taskId: TASK-IA-001
status: 进行中
priority: P1（排期 v2 §3.3 第 2 波首位；解锁 CREATE 系列）
pr: "#<待开>"
criteria: 8
criteriaPassed: 0
depends_on: TASK-AUTH-001（已合并 #203；⚠️ 热点文件冲突，见 §2）
---

# TASK-IA-001：模型中心/设置中心信息架构整改（预算归位 + 导航职责裁定）

> 本卡由平铺文件 `.github/tasks/TASK-IA-001-ia-budget-relocation.md` 迁入文件夹结构
> （AC-008/010/011：开工即建 devlog + acceptance；旧文件随本 PR 移除）。
> 排期依据：`docs/product/task-queue-plan-v2-2026-10-15.md` §3.3 第 2 波第 1–3 项。

## 基本信息

- **任务 ID**：TASK-IA-001
- **创建日期**：2026-10-15
- **人类 Owner**：项目 Owner
- **AI 执行者**：AI Agent
- **优先级**：P1（v2 §3.3 第 2 波首位——它是 CREATE 系列的前置）
- **状态**：待开工（**卡在 AC-009 设计稿评审**：设计稿未通过不得写码）
- **验收清单**：[acceptance.md](acceptance.md)
- **设计稿**：[design-prototype.html](design-prototype.html)（待 Owner 评审）

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

### 范围内

- ✅ **预算规则 UI 迁移**：`SettingsPreferences.tsx` 的预算区块（含新增/删除表单与弹窗）
  迁入 `ModelCosts.tsx` 页内「预算规则」区块；**复用现有组件与 API，不重写逻辑**
- ✅ **角色可见性对齐 AUTH-001**（本卡吸收 AUTH-001 验收里"页内操作按钮级隐藏留 IA-001"的遗留）：
  区块**可见** = Viewer+；**新增/删除操作** = Admin+
- ✅ **旧入口兼容**：`/settings/preferences` 的预算入口按 ADR-005 §3 legacy redirect 模式跳转（不 404）
- ✅ **设置>偏好回归纯偏好**：移除预算区块后页面职责单一（余「默认模型」等偏好项）
- ✅ **渠道归属裁定落地**：按设计稿 §4 评审结论执行（含 `/models/channels` 的去留与 legacy 落点）
- ✅ **清单同步**：`model-center-navigation.ts` / `settings-navigation.ts` 变更后跑 `npm run ui:generate` 同步三清单

### 非范围

- ❌ 设置「用量」导航（更正 1：已由方案 A 解决）
- ❌ 权限矩阵本身（TASK-AUTH-001 已交付；本卡只做**页内按钮级**角色控制）
- ❌ 预算功能增强（报表/预测/多币种）
- ❌ CREATE 系列工作台布局（本卡只为其提供稳定导航基座）

## §2 前置依赖与冲突面（排期 v2 §2）

| 项 | 内容 |
|---|---|
| 前置 | `TASK-AUTH-001`（已合并 #203）——预算区块的角色控制需其角色体系（`useAuthStore` / `RequireRole`） |
| ⚠️ **热点文件冲突** | 本卡与 AUTH-001 改**同一对文件**：`apps/web/src/features/model-center/model-center-navigation.ts`、`apps/web/src/features/settings/settings-navigation.ts`。AUTH-001 已合并，**本卡开工前必须先 rebase 到含 AUTH-001 的 develop**；两者**不得并行开工**（`parallel-worktree` 热点文件规则） |
| 后续 | CREATE-001~006（依赖本卡 + 组件基座 stable） |

## 验收标准（设计稿评审后由 acceptance.md 细化为四要素判据）

1. `/models/costs` 页内可见「预算规则」区块，Admin+ 可新增/删除，Viewer 只读（操作入口不渲染）
2. `/settings/preferences` 预算入口 legacy redirect 正确，不 404；偏好页职责单一
3. 渠道归属按设计稿 §4 结论落地；被移除入口有 legacy 落点，**不 404**（ADR-005 §6 不变量）
4. T13 五站链路（看成本→配预算→看健康→选模型→拿产物）**不再跨一级导航**
5. 导航清单三处同步（`ui:generate` 后 `ui:check` 绿）
6. 预算区块三态齐备（loading/error/empty），删除有确认弹窗
7. `tests/settings-navigation.test.ts` / `auth-navigation.test.ts` 全绿（角色可见性未被破坏）
8. 前端门禁 `npm run gate` = 0/0；`npm test` 全绿

## 流程（AC-009 强制）

```
设计稿（本 PR 交付 design-prototype.html）→ Owner 评审 → 评审通过 → 开发 → 勾对 → PR
```

**未过评审不得写码。** 本 PR **只交付设计稿与任务文档，不含任何前端代码改动。**

## 测试命令（开发阶段用；本 PR 不适用）

```bash
cd apps/web
npm run gate          # typecheck + eslint + quality-gate
npm test              # node:test + vitest
npm run ui:check      # 三清单同步
npm run visual:check  # 7 页视觉回归（本地）
```
