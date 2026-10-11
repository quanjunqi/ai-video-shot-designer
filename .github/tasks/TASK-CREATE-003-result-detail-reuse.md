# TASK-CREATE-003：结果元数据、参数复用与取消/重试

> ADR-006 分片计划第 3 片（决策 D6 + D10 的界面落地）。
> 前置：TASK-CREATE-002（composer 布局与结果主舞台）已完成。

## 基本信息

- **任务 ID**：TASK-CREATE-003
- **任务名称**：结果详情（元数据/参数快照）+ 参数复用 + 取消/重试（含状态区分）
- **创建日期**：2026-10-10
- **AI 执行者**：AI Agent（分支 `feat/create-workbench-2026-10-10`）
- **优先级**：P1
- **预计工时**：90 分钟

---

## 1. 目标

**目标**：让结果区从「只能看一张占位图」变成可复盘、可复用、可控制 ——
补齐 ADR-006 D6（结果元数据与复用）与 D10（取消分状态 + 计费口径）的界面部分。

**背景**：改造前结果卡只有两个按钮（下载、试听）且都是 `toast` 演示；`ServerTask.error` 未渲染；
没有任何复用入口；取消/重试只在任务中心有，且不区分状态。

---

## 2. 范围

### 范围内（In Scope）

- 新增 `apps/web/src/features/genworkbench/result-utils.ts`（纯函数，带单测）：
  - `parseTaskPayload` — `intent_payload` 对象/JSON 字符串两种形态都能解析，坏数据回退空对象
  - `extractResultUrl` — **前向兼容**的产物地址探测（覆盖已核实的 `output.image_urls.0` /
    `output.data.0.url` / `data.0.url` / `url` / `video_url` / `audio_url` 等形状）
  - `mediaKind` — 由扩展名/MIME 判定 image / video / audio / unknown
  - `reusableDraft` — 从落库负载还原提示词与参数；**当前模型不认识的键记入 `skippedKeys`，不静默丢弃**
  - `cancelPlan` — 排队中 / 执行中两种取消语义与**计费口径文案**（D10）
  - `canCancel` / `canRetry` / `formatTaskTime` / `attemptsNote`
- `useCreateControls.applyDraft()`：批量套用草稿，只接受 schema 认识的键，模型不可用时不切换并告知
- 结果区：
  - 详情抽屉（Sheet）：状态/类型/费用/尝试/创建/更新/模型/参考图 + 提交时参数快照表 + 产物地址
  - 主预览与详情均可「沿用全部参数」与「仅用提示词」——**两种意图两个按钮，不合并**
  - 取消（`queued`/`running` 不同确认文案与计费说明）/ 重试（沿用原参数）
  - 真实产物按 `mediaKind` 用 `img`/`video`/`audio` 渲染；无地址时回退占位图并如实标注
- 缩略图：视频/音频只显示类型标记，避免小格子内出现裂图或播放器

### 范围外（Out of Scope）

- ❌ 删除任务：**后端没有 DELETE 接口**（已登记 BACKLOG #15），不做"仅本地隐藏"的假删除
- ❌ 真实产物写回：**当前无写回链路**（已登记 BACKLOG #14），前端只做前向兼容
- ❌ 草稿持久化 / 快捷键打磨 → TASK-CREATE-004
- ❌ 队列抽屉（暂停/恢复/清空/位置）→ TASK-CREATE-008

---

## 3. 相关文件

- `apps/web/src/features/genworkbench/result-utils.ts` — 新增（纯逻辑）
- `apps/web/tests/create-result-utils.test.ts` — 新增（10 个单测）
- `apps/web/src/features/genworkbench/CreateWorkbench.tsx` — 接入详情/复用/取消/重试
- `apps/web/src/hooks/useCreateControls.ts` — 新增 `applyDraft`
- `docs/how-to/backlog.md` — 新增 #14（结果写回缺失）、#15（无删除接口）

---

## 4. 验收标准

- [ ] 结果详情可看到**提交时的参数快照**（读的是落库的 `intent_payload`，不是前端臆造）
- [ ] 「沿用全部参数」与「仅用提示词」是两个独立按钮；被忽略的参数会 toast 说明，不静默丢弃
- [ ] 原模型不可用时给出警告并保留当前模型
- [ ] `queued` 与 `running` 的取消确认文案/计费口径不同；执行中明确告知「上游可能仍会完成」
- [ ] 失败任务展示 `error` 原文
- [ ] 有真实产物地址时按媒体类型正确渲染；无地址时占位图标注「该任务未返回真实产物地址」
- [ ] 不提供删除（无接口）
- [ ] `npm run gate` GATE=0；`npm test` 全绿（45）；`npm run build` 通过

---

## 5. 测试命令

```bash
cd apps/web
npm test
npm run gate
npm run build
```

### 手动测试步骤（L3 · 浏览器）

1. 提交一个生成 → 结果卡出现「沿用参数 / 仅用提示词 / 详情 / 取消」
2. 点「详情」→ 抽屉展示状态、参数快照表；模型与参考图数量正确
3. 点「沿用全部参数」→ 左侧提示词与参数被回填，且 toast 说明套用了几项
4. 点「仅用提示词」→ 参数保持当前值不变
5. 对 `queued` 任务点取消 → 文案为「未开始执行：不扣费」；对 `running` 任务 → 文案含「可能仍会完成」与「按已运行时长计费」
6. 取消后点重试 → 重新排队，参数不变
7. 失败任务 → 主预览展示 `error` 原文，详情抽屉一致

---

## 6. 约束与禁止事项

- [ ] 不得用「本地隐藏」冒充删除（后端无接口）
- [ ] 不得把演示占位图说成真实产物；真实产物缺失必须如实标注
- [ ] 不得在前端硬编码协议字段映射（红线同前）
- [ ] 禁止直接 push master；禁止跳过测试

---

## 7. 风险与依赖

| 风险 | 影响 | 缓解 |
|---|---|---|
| 结果写回链路缺失（BACKLOG #14） | 用户看不到真实产物 | 前向兼容探测 + 占位图如实标注；一旦后端写回，前端无需改动即可显示 |
| 复用参数时模型已停用 | 参数套用后与模型不匹配 | `applyDraft` 只在模型仍可运行时切换，否则保留当前模型并警告 |
| 取消文案与真实计费不一致 | 误导用户 | 文案声明口径而非承诺已退款（无账本，见 BACKLOG #12），并在 ADR D10 记录 |

### 回滚方案

`git revert` 本片提交：`result-utils.ts` 与测试为新增文件，CreateWorkbench 的接入点集中在结果区。

---

## 8. 迁移号段

**本片不新增迁移**，不占用号段。

---

## 9. 交付记录（2026-10-10）

- 静态门禁：`npm run gate` → exit 0（0 error / 37 warning，与基线一致）
- 单元测试：`npm test` → **45/45**（新增 10 个：负载解析、地址探测、媒体类型、复用过滤、取消语义、时间格式）
- 构建：`npm run build` → 成功
- 过程中由测试发现并修复：非字符串参数值曾被静默丢弃（现记入 `skippedKeys` 并提示用户）
- **未完成**：L3 浏览器实测（本环境无浏览器工具），上述 7 步待人工执行

---

## 10. 本片发现的两个底座缺口（已登记 BACKLOG）

1. **#14 生成结果写回链路缺失**：`intent_payload.result` 全仓无写入；同步端点只返回给调用方不落库。
   附带发现：`comic/CharacterStage.tsx` 与 `ProjectCharacterLibrary.tsx` 已在轮询该字段 —— 依赖的路径并不存在。
2. **#15 任务无删除接口**：只有 cancel/retry，没有 DELETE。
