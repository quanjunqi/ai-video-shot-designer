---
taskId: TASK-PROC-004
status: 待验收
priority: P1（治理；排期 v2 §1.4 补正的执行）
pr: "#<待开>"
criteria: 8
criteriaPassed: 8
depends_on: TASK-PROC-003（台账校验门禁）
---

# TASK-PROC-004：存量台账真实化（13 张 unknown 卡逐卡核实与状态回填）

> 触发：排期 v2 §1.4 补正——v2 §3 曾把 13 张 `unknown`（未填写状态）卡当作待办排进开发队列，
> 逐卡核实后结论相反：**它们几乎都已实现并合入 develop**。本卡把核实结果落成正式台账状态。

## 目标

一句话：**让台账反映"代码实际到哪了"，而不是"最后一次有人写它是什么状态"。**

## 背景

`ledger.json` 中 13 张卡状态为 `unknown`（未填写），在排期中被读作"未开工"。
实测这些卡**绝大多数已实现**——缺的不是代码，是**验收闭环**。仓库已有先例：
`TASK-INFRA-003` 的 devlog 决策 D-001 即选择「验收闭环（实现已在 develop）」而非重新实现。

## 核实方法

对每张卡：读其**验收标准**（原文）→ 在代码中逐条找证据（`file:line` / 迁移号 / CHANGELOG 行号）
→ 判定 `已实现 / 部分实现 / 未实现 / 无法判定`。**只记有证据的结论**，找不到证据即记「未找到证据」。

核实由本卡执行；**CREATE 系列 6 张的逐条判据核实由子 agent 完成**（只读），
其结果经父 agent 复核后写入 [devlog.md](devlog.md)。

## 核实结论（汇总；明细见 devlog）

| 卡 | 判定 | 台账处置 | 依据摘要 |
|---|---|---|---|
| FIX-002 | ✅ 已实现（逐条对上其验收标准） | **已验收** | `execution/007`（jobs 6 值含 timeout）、`production/022`（projects 6 值）、`023`（episodes status 6 + stage 8）；`state-machines.md`；CHANGELOG:280-282 |
| FIX-003 | ✅ 已实现（4/4 验收标准） | **已验收** | `SettingsProtocols.tsx:96-100`（必填 + `{task_id}` 校验）、`:371`（可编辑）、`ProtocolPreview.tsx:75`、迁移 `029`、CHANGELOG:237 |
| SEC-003 | ✅ 已实现 | 待验收 | 迁移 `024_auth_type_token.sql`：`auth_type` CHECK 含 `token` |
| SEC-004 | ✅ 实现到位（缺真库集成实测） | 待验收 | 迁移 `027`（可空不回填）；`engine.go:61-69,499` 数据驱动；`credentials.go:132` `keepOr` |
| P2-001 | ✅ 已实现 | 待验收 | `executor.go:123` 正是卡片要求新建的 `Executor` 接口（Submit/Poll/Cancel/GetResult）+ `api_connector.go` |
| INFRA-002 | ✅ 实现到位（1 处文档偏差） | 待验收 | `detect-changes.sh` + CI job；**判据 3/4/5/6 实测通过**；偏差：卡片写的「8 条路径单测」实为 `docs/how-to/ci.md:71` 的手工命令 |
| CREATE-001~005 | ✅ 代码侧全部实现 | 待验收 | 提交 f1959c3/f6243d6/3220e50/cd8c0cf/8b0ad54 + 整片恢复 41c9988（PR #54）；**ADR 分片表 1–5 亦标「✅ 已交付」** |
| CREATE-006（平铺卡） | ⚠️ 代码已实现但**编号冲突，暂停闭合** | 维持 `unknown` | 见下「编号裁定」 |
| PLAN-a-and-adr008 | ✅ 已完成 | 维持（文档类，非任务） | `docs/adr/protocol-docs-alignment.md`（ADR-008，状态「已接受」） |

## ❗ 编号裁定（ADR 分片表 vs 平铺卡/提交）

**证据**：`docs/adr/smart-creation-workbench.md:158-168` 的分片表**逐片标注了状态**，
其中**分片 6 = `capability.aspectRatios` 追加（D3-B）= ⏳ 待 Owner 确认**；
而平铺卡 `TASK-CREATE-006-param-tiers-and-json-view.md` 描述的是**另一件事**
（参数三级披露 + 表单/JSON 双视图），提交 `ebff8ef` 亦如此自标。
`grep -rn 'aspectRatios' services/ openapi/` **无输出** ⇒ 分片 6 **未交付**。

**裁定（本卡作出，留 PR 评审复核）**：

1. **以 ADR 分片表为权威**——它有日期、逐片状态、且是设计决策记录；平铺卡与提交的编号是松散用法。
2. **`TASK-CREATE-006-param-tiers-and-json-view.md` 系"借用"了 006 号**，其内容是分片表**未登记**的一项工作。
   建议**重编号为 `TASK-CREATE-010`**（内容不变），并同步 `ebff8ef` 之后的新增引用。
3. **ADR 分片 6（`aspectRatios`）应登记为「未交付」**，不得因同名卡已实现而误记为已验收。
4. 同族问题一并登记：ADR 分片 7 = 个人素材、分片 10 = 队列抽屉，
   而提交 `0248cca` 自标「TASK-CREATE-007 = 运行区队列分组与成本阈值」——**同族编号漂移**。

> 未经 Owner 确认前，**不重编号、不闭合 CREATE-006**；本卡只登记裁定与证据。

## 范围

- ✅ 逐卡核实并留存证据（`file:line` / 迁移号 / CHANGELOG）
- ✅ 回填台账：`ledger.json` 状态 + `README.md` 索引与现状段
- ✅ 登记 CREATE 编号裁定与「ADR 分片 6 未交付」
- ✅ 把「开工前先核实交付物是否已存在」写成排期 v2 §5 第 8 条（已随 v2 补正提交）

### 非范围

- ❌ 不为已实现的卡补写 acceptance.md（那是"按新卡流程补文档"，属形式主义；
  本卡的核实记录即为它们的验收证据，引用自本卡 devlog）
- ❌ 不重编号 CREATE-006（等 Owner 确认）
- ❌ 不执行各卡的真库集成测试 / L3 走查（属各卡自身的验收动作，本卡只做**代码级核实**）

## 验收标准

1. 13 张卡逐卡给出判定 + 证据，无「未找到证据」被记为通过
2. `ledger.json` 与 `README.md` 状态与判定一致，且过 `check-task-ledger.sh`
3. FIX-002 / FIX-003 记为「已验收」（逐条对上各自验收标准）
4. SEC-003 / SEC-004 / P2-001 / INFRA-002 / CREATE-001~005 记为「待验收」，并注明残留验证项
5. CREATE-006 维持 `unknown` 并登记编号裁定（不擅自闭合）
6. 「ADR 分片 6 未交付」被显式登记
7. 各卡未验证/未执行项如实列出，不冒称通过
8. 台账门禁 + shell 自检全绿

## 测试命令

```bash
bash .github/scripts/check-task-ledger.sh          # 台账一致性（须 rc=0）
bash .github/scripts/check-task-ledger.sh --self-test
bash scripts/check-shell-vars.sh
```
