# TASK-UI-003：收敛字号离散步长（建立小字号尺度 token + 加门禁）

> **开工前**须按 `.agents/skills/acceptance-checklist/SKILL.md` 产出验收清单文件
> （`TASK-UI-003-acceptance.md`，与本卡同目录）；本卡 §4 是清单判据的来源。
> 本卡当前状态为**待开工**，清单尚未产出（AC-008：清单在开工前落盘）。

## 基本信息

- **任务 ID**：TASK-UI-003
- **任务名称**：收敛字号离散步长（`text-[9px]/[10px]/[11px]`…）到尺度 token，并加门禁防新增
- **创建日期**：2026-10-14
- **人类 Owner**：全君琦
- **AI 执行者**：待认领
- **优先级**：P2（不与功能开发抢道；但「加门禁」这一刀建议尽早，先止血）
- **预计工时**：建 token + 门禁 ≈ 0.5 人日；批量替换 ≈ 2–4 人日（按页面分批）
- **状态**：待开工

---

## 1. 目标

**目标**：让"小字号"从**一次性像素值**回到**尺度 token**，并让新写的小字号无法再绕过尺度（机器拦）。

**背景（TASK-UI-001 调查中实测）**：从 197 个源文件统计实际用法——

| 类别 | 常用档位（次数） | 离散步长（次数） |
|---|---|---|
| 字号 | `text-xs` 370 · `text-sm` 207 · `text-lg` 20 · `text-base` 11 · `text-xl` 2 | **`text-[10px]` 438 · `text-[11px]` 298 · `text-[9px]` 201** · `text-[12px]` 33 · `text-[8px]` 13 · `text-[13px]` 5 · `text-[0.8rem]` 2 · `text-[10.5px]` 1 |
| 间距 | `2` 716 · `1` 521 · `3` 437 · `1.5` 398 · `4` 249 · `0.5` 131 | 5 处 |
| 圆角 | `rounded-lg` 198 · `xl` 163 · 默认 128 · `md` 108 · `full` 66 | 8 处 |
| 阴影 | 默认 65 · `md` 34 · `lg` 29 · `sm` 13 | 2 处 |

**离散步长合计 1006 处**，其中字号 **991** 处（占 98.5%）。也就是说：字号上存在**两套事实标准**——尺度 token 覆盖了 `xs/sm`，而 9–13px 全靠一次性值。这正是 `frontend-quality` 的 `V-003`（标题禁 `text-[Npx]`）想防的事，只是存量把小字挤到了规范之外。

**为什么值得做**：视觉不一致的**根因不是设计师没规范，而是规范覆盖不到高频小字**。收敛后：改一处 token ⇒ 全站同步；也让后续"设计规范页"上的数字诚实。

---

## 2. 范围

### 范围内（In Scope）

1. **建立小字号尺度 token**（在 `src/tailwind-theme.css` 的 `@theme inline` 中新增，命名与 Tailwind 尺度一致）：
   - 依据实际用量定义有限档位，例如 `--text-2xs`（10px）/`--text-3xs`（9px）/`--text-md`（13px）之类，**档位数量必须收敛（≤4 个新增）**（含 `0.8rem`/`10.5px` 这类一次性值，一律并入相邻档位），命名与 `font-size/line-height` 成对给出；
   - `text-[8px]`(13) 与 `text-[13px]`(5) 等低频值，优先**合并到相邻档位**而非新增 token。
2. **批量替换**：按"出现次数 × 页面重要性"分批（建议顺序：`features/settings` → `features/comic` → `features/genworkbench` → 其余），每批跑门禁与视觉基线。
3. **加门禁（关键）**：`scripts/quality-gate.mjs` 新增规则（编号沿用现有体系，如 `V-003b`）——**新增/修改的前端代码不得出现 `text-[Npx]`**；存量用 allowlist 基线（形如 `apps/web/ui-text-debt-baseline.json`）逐步销账，**只减不增**。
4. 重新生成 UI 清单（`npm run ui:generate`），让规范页与 `docs/reference/ui-components.md` 上的"待收敛"数字下降。

### 范围外（Out of Scope）

- 间距/圆角/阴影的离散步长（合计仅 18 处，本卡不处理；如后续要做另开卡）；
- 字号**视觉设计**变更（本卡只做"等值替换 + 尺度化"，不改变现有观感；若某处像素值需要微调，单独提出来由 Owner 定）；
- `src/components/ui/**`（上游 shadcn 风格组件；它们不参与 eslint/gate 的既有约定，如需一并处理另行评估）。

---

## 3. 相关文件

- `apps/web/src/tailwind-theme.css` — 新增小字号 token（`@theme inline`）
- `scripts/quality-gate.mjs` — 新增 `V-003b` 规则 + 基线读取
- `apps/web/ui-text-debt-baseline.json` — 新增（存量清单，只减不增）
- `apps/web/scripts/ui-inventory.mjs` — 复用既有 `scales` 统计作为度量口径（无需改动）
- `docs/reference/ui-components.md` §3.2 / `.agents/skills/frontend-coding/ui-components.md` — 生成物，替换后自动更新
- 涉及替换的前端文件（分批清单在开工时按 `scales` 输出生成）

---

## 4. 验收标准

> 每条都要能回答「怎么证明它过了」。**判据绑定机器数字**，不写"看起来统一了"。

- [ ] 验收清单文件已产出：`.github/tasks/TASK-UI-003-acceptance.md`
- [ ] **token 落地**：`tailwind-theme.css` 新增的小字号 token ≤4 个，且每个都有配套 `line-height`；`npm run ui:generate` 后 `UI_CATALOG.tokens` 含这些 token
- [ ] **存量下降**：`UI_CATALOG.scales.textArbitrary` 的**合计次数**从 **991** 降到 **≤200**（8/13/33 次那几档优先并入，不新增 token）（判据：`node -e` 读 catalog 打印合计；基线数字写进验收清单）
- [ ] **无视觉回归**：`npm run visual:check` 7 页差异 ≤2%（判据：既有基线 diff；如某页因等值替换产生微量抗锯齿差异，需在验收清单里逐页说明并重生成基线）
- [ ] **门禁能拦新用例**：`quality-gate.mjs` 的 `V-003b` 在「新增/修改文件里写 `text-[Npx]`」时**退出码 1**（判据：**反例验证**——临时造一个文件写 `text-[10px]`，`npm run gate` 必须红；删掉后恢复绿）
- [ ] **基线只减不增**：`ui-text-debt-baseline.json` 的条目数在后续 PR 中不得增加（判据：基线文件 + 门禁逻辑）
- [ ] **门禁 0/0**：`npm run gate`；`npm test` 全过
- [ ] **文档同步**：两份清单文档的"待收敛"数字已随生成物下降

---

## 5. 测试命令

```bash
cd apps/web
npm run ui:generate                                   # 重新统计
node -e "const c=require('fs').readFileSync('src/generated/ui-catalog.ts','utf8');const k='export const UI_CATALOG: UiCatalog = ';const d=JSON.parse(c.slice(c.indexOf(k)+k.length,c.lastIndexOf(';')));console.log('离散字号合计', d.scales.textArbitrary.reduce((n,x)=>n+x.count,0))"
npm run gate
npm test
npm run visual:check
```

### 手动测试步骤

1. 随机抽 5 个被替换的页面，人工比对替换前后截图（应等值，无观感变化）。
2. 故意在新文件里写 `text-[10px]` → `npm run gate` 必须红；改为 `text-2xs` 后恢复绿。

---

## 6. 约束与禁止事项

### 必须遵守

- [ ] **等值替换优先**：替换只改"写法"，不改像素值；任何观感变化必须单独说明并由 Owner 确认
- [ ] 分批提交，每批都能独立通过门禁与视觉检查（禁止一次性 988 处大爆破）
- [ ] 新 token 命名沿用现有 Tailwind 尺度语义（`2xs` 小于 `xs`），不要在 `@theme` 里造第二套命名

### 禁止操作

- [ ] 禁止为了让数字下降而"改小/改大"字号（那是设计变更，不是收敛）
- [ ] 禁止把 `ui-text-debt-baseline.json` 当作"永久豁免"（必须分批销账，门禁只减不增）
- [ ] 禁止在 `src/components/ui/**` 里顺手改（超出本卡范围）

---

## 7. 风险与依赖

### 依赖项

- `TASK-UI-001` 已交付的 `scales` 统计口径（已合入 develop）
- 视觉基线机制（`visual:check`），用于证明"等值替换无回归"

### 潜在风险

- **基线漂移**：像素值等值替换在抗锯齿层面可能产生极小差异，需要逐页确认而不是无脑刷新基线。
- **allowlist 沦为永久豁免**：必须把"存量只减不增"写进门禁逻辑，否则等于给债务上了锁。
- **token 档位定错**：档位由实际用量决定（10/11/9px 为主），若 Owner 认为应统一到 `xs`(12px) 而非新增 token，需先做设计决策——**开工前请 Owner 确认档位方案**。

### 回滚方案

- 分批提交，任一批可单独 `git revert`；token 保留不影响未替换处（新增 token 是纯增量）。

---

## 8. 输出物

- [ ] 分支：待认领
- [ ] PR 链接：待开
- [ ] 验收清单（勾对完毕）：`.github/tasks/TASK-UI-003-acceptance.md`
- [ ] PR body 含「🎯 验收勾对」小节
- [ ] 测试结果：见验收清单
- [ ] 文档更新：生成物自动更新（`npm run ui:generate`）

---

## 9. 完成确认

### AI 自检清单

- [ ] 验收标准全部满足（逐项勾对见验收清单文件；未过项已如实说明）
- [ ] 测试全部通过
- [ ] 无编译错误
- [ ] 无密钥泄露
- [ ] 只修改了必要文件
- [ ] 文档已同步
- [ ] 迭代自检已执行

### 人类审查

- [ ] **档位方案**符合设计意图（新增 token vs 统一到 xs 的取舍）
- [ ] 被替换处观感无变化（抽查）
- [ ] 门禁不会被"绕过"（allowlist 只减不增）

**审查结论**：✅ 批准合并 / ❌ 需要修改

**审查人**：__________ **日期**：__________
