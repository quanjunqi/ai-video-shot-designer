# 需求验收清单：TASK-UI-003 收敛字号离散步长

> 规则见 `.agents/skills/acceptance-checklist/SKILL.md`（AC-001~AC-008）；本文件是勾对留痕，PR body 附汇总。
> 判据全部**绑定机器数字或反例验证**，不写「看起来统一了」。

---

## 任务信息

- 任务名称：收敛字号离散步长（建立小字号尺度 token + 加门禁）
- 关联需求/任务卡：`.github/tasks/TASK-UI-003-text-scale-convergence.md`
- 开发者（AI）：AI Agent（branch `chore/ui-text-scale-2026-10-14`）
- 开工日期：2026-10-14
- 目标一句话：小字号从「一次性像素值」回到「尺度 token」，并让新写的小字号被机器拦住。

---

## 一、需求点 → 可验证判据（实测结果）

| # | 需求点 | 验收判据 | 实测结果 | 自检 |
|---|---|---|---|---|
| 1 | 建立小字号尺度 token | 新增 ≤4 个，值与被替换的离散步长**逐一等值**；`npm run ui:generate` 后可在 catalog 查到 | 新增 **4 个**：`--text-4xs` 0.5625rem(9px)、`--text-3xs` 0.625rem(10px)、`--text-2xs` 0.6875rem(11px)、`--text-md` 0.8125rem(13px)；catalog `themeUtilities` 54 → **58** 条 | ☑ 过 |
| 2 | 存量下降 | 范围内 `text-[Npx]` 合计 **991 → ≤200** | **991 → 0**（61 个文件、989 处替换） | ☑ 过（超额） |
| 3 | 无视觉回归 | `npm run visual:check` 7 页差异 ≤2% | 7 页全 **0.00%**，其中 6 个业务页 **0px**；ui-kit 38px（因清单文档新增 4 行表格） | ☑ 过 |
| 4 | 门禁能拦新用例 | 新增/修改文件写 `text-[Npx]` → `npm run gate` **exit 1** | 反例验证：`src/__gate_probe.tsx` 写 `text-[10px]` → **exit 1** 且报「小字号必须用尺度 token（V-003b）…改用 text-4xs(9px)/text-3xs(10px)…」；改为 `text-3xs` → **exit 0** | ☑ 过 |
| 5 | 基线只减不增 | 存量 allowlist 不得增加 | `ui-text-debt-baseline.json` 初始为**空对象**（范围内已清零）；门禁逐文件比对，超出即阻断；减少时提示收紧基线（`--update-text-debt`） | ☑ 过 |
| 6 | 门禁与测试全绿 | `npm run gate` / `npm test` | gate **0 error / 0 warning**；`npm test` node 断言式 **146** + vitest **63** 全过 | ☑ 过 |
| 7 | 文档同步 | 生成物随代码更新 | `npm run ui:generate` 后 `ui:check` 绿；人类清单 §3 工具类映射表已列出 4 个字号 token 与对应工具类；`.agents/skills/frontend-quality/SKILL.md` 已增 V-003b 行 | ☑ 过 |

**附带修复（实现中发现）**：生成器把 `--text-*` 归到「其他」且「对应工具类」列输出 `—`（本卡主角却查不到工具类名）⇒ 已修正为分组「字号」+ 映射 `text-3xs` 等。

---

## 二、设计稿逐点映射

| # | 设计稿模块 | 对应需求点 | 实现位置 | 偏差说明 | 自检 |
|---|---|---|---|---|---|
| 1 | （本卡为工程收敛，无设计稿） | — | — | 等值替换，**不改变任何既有观感**；视觉基线 0px 即证据 | ☑ 过 |

---

## 三、三态与边界

| # | 场景 | 预期 | 实测 | 自检 |
|---|---|---|---|---|
| 1 | `components/ui/**`（上游组件，范围外） | 豁免，不阻断 | `src/components/ui/calendar.tsx` 2 处 `text-[0.8rem]` 保留；门禁命中数 0 | ☑ 过 |
| 2 | 低频值 `8px`(13) / `0.8rem`(2) / `10.5px`(1) | 按卡「并入相邻档位，不新增 token」 | 已并入 `text-4xs`(9px) / `text-md`(13px) / `text-3xs`(10px)：共 **16 处 ≤1px 变化**（8px→9px、12.8px→13px、10.5px→10px）——**如实记录**，属卡内既定策略 | ☑ 过（已声明） |
| 3 | 动态拼接的任意值字号（正则抓不到） | 需人工确认无此类用法 | `grep 'text-\[\${'` 无命中 ⇒ 无动态拼接 | ☑ 过 |
| 4 | 页面里作为**展示文本**出现的 `text-[Npx]`（dev 页说明文字） | 不应误报 | 门禁正则要求 `[0-9.]+`，`Npx` 不匹配；该文件绿灯 | ☑ 过 |
| 5 | 新 token 是否真的生成工具类（否则字号静默失效） | 构建产物含 `.text-3xs{font-size:…}` 等 | 构建后 CSS：`.text-4xs{font-size:.5625rem}` / `.text-3xs{font-size:.625rem}` / `.text-2xs{font-size:.6875rem}` / `.text-md{font-size:.8125rem}`；旧任意值类**已清零** | ☑ 过 |

---

## 四、反模式自查

| # | 检查 | 命中？ | 处理 |
|---|---|---|---|
| 1 | 等值替换却被顺手改了字号（设计变更偷渡） | ☐ 否 / ☐ 是 | 16 处 ≤1px 已单列声明，其余严格等值（视觉 0px 为证） |
| 2 | allowlist 沦为永久豁免 | ☐ 否 / ☐ 是 | 基线为空；门禁只减不增 + `--update-text-debt` 收紧 |
| 3 | 顺手改 `components/ui/**` | ☐ 否 / ☐ 是 | 未改（2 处保留） |
| 4 | 门禁写成 warning（拦不住） | ☐ 否 / ☐ 是 | V-003b 走 `errors`，`exit 1`（反例验证过） |
| 5 | 正则误报（注释/展示文本） | ☐ 否 / ☐ 是 | 剥注释后匹配 + 数字限定；边界 4 已验证 |
| 6 | `any` / 内联样式 / grid 缺 `min-w-0` | ☐ 否 / ☐ 是 | 本次仅改类名与门禁，未引入 |

---

## 五、门禁与测试（实测输出）

| # | 检查 | 命令 | 结果 |
|---|---|---|---|
| 1 | 类型检查 | `npx tsc -p tsconfig.app.json --noEmit` | ✅ 0 error |
| 2 | 质量门禁（含 V-003b） | `node scripts/quality-gate.mjs` | ✅ 0 error / 0 warning |
| 3 | 清单门禁 | `node scripts/ui-inventory.mjs --check` | ✅ 55 组件 / 69 token / 死组件 35 / 注记 55 / demo 55 |
| 4 | 全量测试 | `npm test` | ✅ node 146 + vitest 63 |
| 5 | 生产构建 | `npm run build` | ✅ 成功；新工具类均在产物 CSS 内 |
| 6 | 视觉基线 | `npm run visual:check` | ✅ 7 页 0.00% |
| 7 | 反例验证（门禁有效性） | 临时文件写 `text-[10px]` → `node scripts/quality-gate.mjs` | ✅ exit 1（报 V-003b）；改 `text-3xs` → exit 0 |
| 8 | 存量度量 | `grep -ro 'text-\[[0-9.]*\(px\|rem\)\]' src \| wc -l` | ✅ 范围外 2 处（均为 `ui/calendar.tsx`） |

---

## 六、PR 附勾对结果（提交 PR 时随 body 附上）

```markdown
## ✅ 验收勾对（acceptance-checklist）
- 需求点：7/7 通过（未过项：无）
- 设计稿映射：1/1（本卡为等值工程收敛，无设计稿）
- 三态与边界：5/5（含 16 处 ≤1px 变化的如实声明）
- 反模式自查：6/6 未命中
- 门禁：gate 0/0；npm test node 146 + vitest 63；visual 7 页 0.00%（6 页 0px）；构建产物含 4 个新工具类
- 存量：范围内 text-[Npx] 991 → 0（共 989 处替换 / 61 文件）
- 未过项及原因：无
```

> 勾对必须**如实**。未过项在 PR 中说明原因与影响，由 Owner 决定是否放行；隐瞒勾对 = 违反 AC-005，评审直接打回。
