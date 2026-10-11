# TASK-CREATE-002：智能创作 Composer 布局与结果主舞台

> ADR-006 分片计划第 2 片（决策 D1/D5/D2 的界面落地）。
> 前置：TASK-CREATE-001（能力驱动控件 schema）已完成。

## 基本信息

- **任务 ID**：TASK-CREATE-002
- **任务名称**：Composer 布局与结果主舞台（`GenWorkbench` → `CreateWorkbench`）
- **创建日期**：2026-10-10
- **人类 Owner**：已确认 D1 方向（2026-10-10）
- **AI 执行者**：AI Agent（分支 `feat/create-workbench-2026-10-10`）
- **优先级**：P1
- **预计工时**：90 分钟

---

## 1. 目标

**目标**：把「智能创作」的界面从「左参数长表单 + 右窄结果网格」改为 ADR-006 D1 确认的形态 ——
**保留左输入 / 右结果两栏骨架，把参数收敛为输入区内的胶囊，结果区成为主舞台**。

**背景**：改造前三个页面各写一份 `params` 字面量、共用 `GenWorkbench`，
参数与模型目录完全脱钩（ADR-006 §2 有逐条实测证据）。

---

## 2. 范围

### 范围内（In Scope）

- 新增 `apps/web/src/features/genworkbench/CreateWorkbench.tsx`：
  - 左栏 composer：模型档位选择器（旁标渠道）→ 能力胶囊（`capability.modes`）→ 参考图（仅当
    `maxRefImages > 0`）→ 提示词 → 常显参数胶囊 → 高级参数折叠 → 费用 → 生成
  - 右栏结果主舞台：**主预览**（占满宽度，含进行中/成功/失败三态与失败原因）+ 缩略图网格（点击切换主预览）
  - 空闲时停止轮询；`document.hidden` 时暂停，回前台补拉一次；提供手动刷新
  - 无可用模型时给出真实空态并指向设置中心（音频因目录无 audio 类型，如实说明未接入执行链路）
- 三个页面（`CreateImage` / `CreateVideo` / `CreateAudio`）改为只声明 `kind`
- `useCreateControls` 暴露 `channels`（供模型档位列表标注渠道名）
- **删除** `apps/web/src/components/common/GenWorkbench.tsx`（已无消费者）
- 提交 payload 增加 `model_id` / `protocol_template_id`（把「锁定计划」所需身份信息带进任务）

### 范围外（Out of Scope）

- ❌ 结果元数据抽屉 / 复用参数 / 取消·重试·删除 → TASK-CREATE-003
- ❌ 草稿持久化 / 空加载失败态打磨 → TASK-CREATE-004
- ❌ 风格库 / 镜头语言库接入 → TASK-CREATE-005
- ❌ 队列抽屉与取消状态区分（D10）→ TASK-CREATE-008
- ❌ 真实产物接入（仍为演示占位图，且**在 UI 上如实标注**）

---

## 3. 相关文件

- `apps/web/src/features/genworkbench/CreateWorkbench.tsx` — 新增（本片主体）
- `apps/web/src/pages/CreateImage.tsx` / `CreateVideo.tsx` / `CreateAudio.tsx` — 改为薄封装
- `apps/web/src/hooks/useCreateControls.ts` — 暴露 `channels`
- `apps/web/src/config/create/control-schema.ts` — 能力驱动的控件事实源（片 1）
- `apps/web/src/components/common/GenWorkbench.tsx` — 删除
- `docs/adr/smart-creation-workbench.md` — D1/D2/D5 依据

---

## 4. 验收标准

- [ ] 参数控件全部由目录能力推导，三页各自不再有 `params` / `unitCost` 字面量
- [ ] 模型档位与参数分离：模型选择是独立控件（旁标渠道），不混在参数列表里
- [ ] 模型不支持的能力不渲染（无 `i2v` 的模型不出现参考图入口）
- [ ] 费用随张数/秒数变化，并声明「排队等待不消耗积分」
- [ ] 提交前校验给出字段级原因（时长越界、数量越界、参考图超出上限、提示词为空）
- [ ] 结果区为主舞台：有主预览 + 缩略图切换，失败时展示 `error` 原文
- [ ] 空闲时不轮询（无 queued/running 任务时停止）
- [ ] 参考图超限时被裁到上限并提示，不会静默丢弃
- [ ] Enter 提交 / Shift+Enter 换行可用，且不破坏 `@` 引用下拉
- [ ] `npm run gate` GATE=0（0 error）；`npm test` 全绿；`npm run build` 通过
- [ ] 无控制台错误

---

## 5. 测试命令

```bash
cd apps/web
npm test
npm run gate
npm run build
```

### 手动测试步骤（L3 · 浏览器）

1. 打开 `/create/image`：模型档位应列出目录里的图片模型（nano-banana-2-lite / gpt-image-2 …），
   而不是改造前的 `SDXL / Flux / MJ-V6`
2. 切到 `gpt-image-2`（`aspectRatioCount: 6`）→ 比例胶囊应出现 6 项且标注「取值待目录声明」
3. 打开 `/create/video`，切 `Kling 1.6` → 时长范围 5–15；填 99 → 提交按钮禁用并提示「该模型最长 15 秒」
4. 切 `Seedance 2.5` → 时长上限变 30
5. 参考图挂到上限后再加 → 被裁到上限并 toast 提示
6. 输入提示词按 Enter → 提交；Shift+Enter → 换行；输入 `@` → 下拉出现且可点选
7. 生成后右栏出现缩略图与主预览；全部任务结束后**网络面板不再有 2s 轮询**
8. 打开 `/create/audio` → 应显示「模型目录当前不含音频类型」的空态（诚实标注）
9. 控制台无报错

---

## 6. 约束与禁止事项

- [ ] **禁止在前端硬编码协议字段映射**（红线同 TASK-CREATE-001）
- [ ] 禁止把演示占位图伪装成真实产物（已在图上标注「演示占位图（真实产物未接入）」）
- [ ] 禁止新引入 UI 依赖库
- [ ] 禁止直接 push master；禁止跳过测试

---

## 7. 风险与依赖

| 风险 | 影响 | 缓解 |
|---|---|---|
| 布局改动触及 3 个路由页 | 回归风险 | 本片独立提交；旧组件删除前已确认无消费者 |
| 目录为 demo/离线态时能力可能不符 | 控件与实际能力不一致 | 沿用三态徽标（服务端/离线缓存/演示目录）如实标注 |
| 提示词 Enter 提交可能干扰 `@` 下拉 | 无法选择引用 | 只在事件源为 `textarea` 时拦截，且 Shift+Enter 保留换行 |
| 参考图上限裁剪可能让用户困惑 | 误以为上传失败 | 裁剪时 toast 明确说明上限 |

### 回滚方案

单提交回滚：恢复 `GenWorkbench.tsx` 与三个页面的旧实现即可（`git revert` 本片提交）。

---

## 8. 迁移号段

**本片不新增迁移**，不占用号段。

---

## 9. 交付记录（2026-10-10）

- 静态门禁：`npm run gate` → exit 0（0 error / 37 warning，与基线一致，本片新增文件 0 warning）
- 单元测试：`npm test` → 35/35 通过（20 存量 + 15 片 1 新增）
- 构建：`npm run build` → 成功
- **未完成**：L3 浏览器实测（本环境无浏览器工具），上述手动步骤待人工或具备浏览器能力时执行
