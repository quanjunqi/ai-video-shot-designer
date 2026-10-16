# TASK-PROC-003 验收清单

> 逐项可验证判据（判据/对象/时点/例外 四要素）。开发完成后逐项自检勾对，PR 附汇总（AC-005）。
> 规则：`.agents/skills/acceptance-checklist/SKILL.md`（AC-001~011）。

---

## 任务信息

- 任务名称：台账一致性校验门禁（AC-008/010/011 结构化合规）
- 关联需求/任务卡：[task.md](task.md)
- 开发者（AI）：AI Agent（会话 DSH）
- 开工日期：2026-10-15
- 目标一句话：让台账（README ↔ ledger.json ↔ 任务卡 front-matter）漂移在 PR 阶段被机器拦住。

---

## 一、需求点 → 可验证判据

| # | 需求点（来源） | 验收判据（可客观验证） | 判据四要素备注 | 自检结果 |
|---|---|---|---|---|
| 1 | 有可执行的校验器（task.md 范围①） | `bash .github/scripts/check-task-ledger.sh` 在当前分支执行 → 输出全绿、`rc=0` | 判据：退出码 0 且逐项 ✅；对象：脚本；时点：开发后 | ✅ 过（V-*） |
| 2 | 非法 JSON 必须被拦（task.md 范围②.1） | 注入坏 JSON 的临时副本 → `rc=1`，输出含「JSON」且指出文件 | 判据：非零退出 + 可定位；对象：ledger.json 副本；时点：反例运行 | ✅ 过（V-*） |
| 3 | 状态越界必须被拦（task.md 范围②.2） | 把某卡 status 改为 `已合并（PR #203）` 的副本 → `rc=1`，输出含该越界值 | 判据：非零退出 + 打印越界值；对象：副本；时点：反例运行；例外：`unknown` 合法 | ✅ 过（V-*） |
| 4 | 数量漂移必须被拦（task.md 范围②.3） | README 抬头数字与实际表行数不一致的副本 → `rc=1`。（★ 抬头数字本身不参与判定：判据是 ledger 条数 ↔ 表行数） | 判据：非零退出 + 两侧计数；对象：副本；时点：反例运行 | ✅ 过（V-*） |
| 5 | ID 集合必须双向相等（task.md 范围②.4） | 删掉 ledger 一条 / 删掉 README 一行的副本 → 均 `rc=1`，输出含缺失 ID | 判据：非零退出 + 缺失 ID 可见；对象：副本；时点：反例运行 | ✅ 过（V-*） |
| 6 | 标题截断必须被拦（task.md 范围②.5） | 复现 40 字符截断（`TASK-AUTH-001` 标题截短）的副本 → `rc=1`，并打印两侧标题差异 | 判据：非零退出 + 差异可读；对象：副本；时点：反例运行 | ✅ 过（V-*） |
| 7 | `file` 链接悬空必须被拦（task.md 范围②.7） | 把某条 `file` 指向不存在路径的副本 → `rc=1`，输出含该路径 | 判据：非零退出 + 路径可见；对象：副本；时点：反例运行 | ✅ 过（V-*） |
| 8 | 任务目录结构必须完整（task.md 范围②.8；AC-008/010/011） | 移除某任务目录下 `devlog.events.json` 的副本 → `rc=1`，输出含缺失文件名 | 判据：非零退出 + 缺失文件名；对象：副本；时点：反例运行；例外：平铺卡（无目录）不适用 | ✅ 过（V-*） |
| 9 | front-matter 词表同源（task.md 范围②.9 + 归一词表） | 把某卡 front-matter 写回 `status: accepted` 的副本 → `rc=1`；且当前分支 5 张卡全部为中文五值 | 判据：非零退出 + 当前数据 0 违规；对象：任务卡；时点：反例运行 + 正例 | ✅ 过（V-*） |
| 10 | 「未验证 ≠ 通过」（task.md 约束 3；`ci-triage` 禁止事项） | 令 `python3` 不可用 → `rc=2`（**不是** 0），输出含「未验证」 | 判据：退出码恰为 2；对象：脚本；时点：反例运行（`PATH=/nonexistent`） | ✅ 过（V-*） |
| 11 | CI 接线不破坏必需检查上报（task.md 约束 1） | `bash .github/scripts/check-workflow-structure.sh .github/workflows/ci.yml` → `rc=0`；且 `docs` job 仍无 job 级 `if:` | 判据：结构门通过 + `docs` job 无 `if`；对象：ci.yml；时点：接线后 | ✅ 过（V-*） |
| 12 | 本地与 CI 同口径（task.md 范围⑤） | `scripts/preflight.sh --changed` 输出含本门且为 ✅ | 判据：preflight 输出可见该门并通过；对象：preflight.sh；时点：接线后 | ✅ 过（V-*） |
| 13 | 机制回写规则入口（AGENTS.md「机制落地 = 同步本文件」） | `grep -n 'check-task-ledger' AGENTS.md` 有命中，且位于「关键 gotchas」 | 判据：命中且位置正确；对象：AGENTS.md；时点：收尾 | ✅ 过（V-*） |
| 14 | 真实全量数据通过（task.md 约束 4：不得放宽判据） | 判据 1 的同一次运行覆盖 43 张卡（含本卡）→ `rc=0`；若不过则**修数据**而非改判据 | 判据：rc=0 且卡数 = 43；对象：真实台账；时点：开发后 | ✅ 过（V-*） |

> 判据四要素：**判据**（看什么算过）、**对象**（哪个文件/接口/页面）、**时点**（什么时候看）、**例外**（什么情况不算失败）。

---

## 二、设计稿逐点映射（UI 任务必填）

**N/A —— 非 UI 任务**（无页面/布局/视觉系统变更，交付物是 shell 脚本 + CI 步骤 + 文档）。
AC-003 对非 UI 任务保持「如有」，本卡无设计稿。

---

## 三、三态与边界

> 本卡无数据请求 UI，故模板中的 loading/error/empty 三态不适用；按**同构**方式替换为脚本的输入边界（缺文件 / 缺工具 / 空数据），并保留「不崩溃、有兜底、不静默成功」的实质要求。

| # | 场景 | 预期 | 自检结果 |
|---|---|---|---|
| 1 | 正常态（数据齐、工具在） | 全绿 `rc=0`，打印逐项 ✅ 与计数 | ✅ 过（V-*） |
| 2 | 错误态（数据违规） | 指出**具体**违规项（ID/标题/路径），不笼统说"校验失败" | ✅ 过（V-*） |
| 3 | 空态/缺文件（ledger.json 或 README 不存在） | `rc=2`（无法检查），不静默成功 | ✅ 过（V-*） |
| 4 | 缺工具（无 python3） | `rc=2`，输出含「未验证」 | ✅ 过（V-*） |
| 5 | 边界：`unknown` 状态 / 平铺卡无目录 / 无 `priority` | 均不误报（`unknown` 合法；平铺卡跳过目录检查；priority 为 null 合法） | ✅ 过（V-*） |

---

## 四、反模式自查（命中即改，引用规则编号）

| # | 反模式检查 | 命中？ | 处理 |
|---|---|---|---|
| 1 | 前端 `any` / `as any`（FE-TS-001） | ✅ 否 | 无前端改动 |
| 2 | store 整对象解构（FE-STATE-001） | ✅ 否 | 无前端改动 |
| 3 | 组件内裸 fetch（FE-API-001） | ✅ 否 | 无前端改动 |
| 4 | 页面级 max-w-xl / 溢出（R3/R2） | ✅ 否 | 无前端改动 |
| 5 | 无确认弹窗直接删除（R-CRUD-002） | ✅ 否 | 无前端改动 |
| 6 | 后端吞错 `_ = f()`（BE-ERR-001） | ✅ 否 | 无 Go 改动 |
| 7 | SQL 拼接（BE-PGX-001 / SEC-001） | ✅ 否 | 无 SQL |
| 8 | 日志打 Key（SEC-005 / BE-LOG-002） | ✅ 否 | 脚本不打印任何凭据 |
| 9 | 状态布尔堆叠（BE-DATA-003） | ✅ 否 | 无状态机 |
| 10 | 契约未先行（CT-001） | ✅ 否 | 无 API 契约变更 |
| 11 | **门禁变绿手段**：`continue-on-error` / `\|\| true` / `set +e` 让本该阻断的步骤放行（`ci-triage` 禁止事项） | ✅ 否 | 本门 fail-closed：违规 rc=1、无法检查 rc=2，均视为失败 |
| 12 | **假防线**：检查到不了 / 静默 exit 0（`ci-triage` 禁止事项） | ✅ 否 | 挂 `docs` job（始终运行、始终上报）；缺工具 rc=2 而非 0；`--self-test` 证明门真的会红 |
| 13 | **双实现分叉**：同一规则写两处（`check-shell-vars.sh` 头注教训） | ✅ 否 | CI 与 preflight 调用**同一个**脚本文件，无第二份实现 |

---

## 五、门禁与测试

| # | 检查 | 命令 | 结果 |
|---|---|---|---|
| 1 | 台账门（正例） | `bash .github/scripts/check-task-ledger.sh` | ✅ 过（V-*） |
| 2 | 台账门（反例自检） | `bash .github/scripts/check-task-ledger.sh --self-test` | ✅ 过（V-*） |
| 3 | 缺工具语义 | `PATH=/nonexistent bash .github/scripts/check-task-ledger.sh` → rc=2 | ✅ 过（V-*） |
| 4 | CI 结构不变量 | `bash .github/scripts/check-workflow-structure.sh .github/workflows/ci.yml` | ✅ 过（V-*） |
| 5 | shell 规则自检 | `bash scripts/check-shell-vars.sh` | ✅ 过（V-*） |
| 6 | 本地同口径预检 | `scripts/preflight.sh --changed` | ✅ 过（V-*） |
| 7 | YAML 可解析 | `python3 -c "import yaml;yaml.safe_load(open('.github/workflows/ci.yml'))"` | ✅ 过（V-*） |

> 无前端 / 无 Go 代码改动，故 `npm run gate` 与 `go build/test/vet` 不适用（如实声明，不冒称通过）。

---

## 六、PR 附勾对结果（提交 PR 时随 body 附上）

```markdown
## ✅ 验收勾对（acceptance-checklist）
- 需求点：14/14 通过（未过项：无）
- 设计稿映射：N/A（非 UI 任务）
- 三态与边界：5/5 通过（三态按脚本输入边界同构替换）
- 反模式自查：13/13 未命中（命中并修复：无）
- 门禁：台账门正例(rc=0) + 反例自检(10/10) + 缺 python3 语义(rc=2) + 结构不变量(rc=0) + shell 自检(17 文件 rc=0) + YAML 可解析 + preflight --changed 全绿；无前端/Go 改动
- 未过项及原因：（如实填写，不得隐瞒）
```

> 勾对必须**如实**。未过项在 PR 中说明原因与影响，由 Owner 决定是否放行；隐瞒勾对 = 违反 AC-005，评审直接打回。
