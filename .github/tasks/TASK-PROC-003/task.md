---
taskId: TASK-PROC-003
status: 待验收
priority: P1（治理；排期 §5.5「验收闭环」的机制化，防台账漂移复发）
pr: "#<待开>"
criteria: 14
criteriaPassed: 14
depends_on: TASK-PROC-002（AC-011 台账双视图 + 结构化字段）
---

# TASK-PROC-003：台账一致性校验门禁（AC-008/010/011 结构化合规）

> 承接 TASK-PROC-001（规则→关卡）与 TASK-PROC-002（AC-011 台账双视图）的下一刀：
> 把「README 人读表 + ledger.json 机读视图」的双维护一致性，从**靠人记得**变成**机器判定**。

## 目标

一句话：**让台账漂移在 PR 阶段被拦住，而不是靠事后回填。**

## 背景（实测：同类漂移已重复 6 次）

### 证据 1：历史回填 PR 表明这是重复踩坑

```
9e4c157 chore(tasks): 台账回填 INFRA-003 PR #201（合并 sha e5c710ab）
66ceb04 chore(tasks): 台账回填 SEC-002  PR #199（合并 sha a5fe704f）
b212a03 chore(tasks): 台账回填 AUDIT-001 PR #197（合并 sha 2d32e05）
012a242 chore: 台账回填 AUTH-001（PR #203 已合并）
```

### 证据 2：2026-10-15 全量核对发现 4 类偏差（本次任务直接动因）

| 类别 | 实例 | 后果 |
|---|---|---|
| 标题截断 | ledger.json 4 条标题被截在 40 字符（AUTH-001/FIX-004/IA-001/ROUTE-003） | 审计 agent 读到残缺标题 |
| 状态值越界 | AUTH-001 状态写成 `已合并（PR #203，fbffb64）`——不在约定五值内 | 按枚举消费的 agent 漏计该卡 |
| 数量/口径漂移 | README 抬头写「索引（40 张）」、现状写「42 张」；实际 43 张。现状段「共 24 张已验收」与本文件索引表互不一致 | Owner 与 agent 都无法据此判断进度 |
| 状态滞后 | UI-003/UI-004 代码 10-14 已合并，状态停在「待验收」>1 天 | 「已合并未验收」静默堆积 |

### 证据 3：front-matter 词表分叉

```
TASK-AUDIT-001/task.md   status: accepted     ← 英文
TASK-INFRA-003/task.md   status: accepted     ← 英文
TASK-SEC-001/task.md     status: accepted     ← 英文
TASK-SEC-002/task.md     status: accepted     ← 英文
TASK-AUTH-001/task.md    status: 待验收        ← 中文（与台账同源）
```

同一语义字段存在两套词表 ⇒ 任何按 front-matter 统计的工具都会漏计。

**根因**：双视图（人读表 + 机读 JSON）**无校验**，一致性靠人记得；而 AC-011 只规定了「要有两个视图」，没有规定「两视图必须一致且可机器判定」。

## 范围

### 范围内（IN）

- ✅ 新增 `.github/scripts/check-task-ledger.sh`：单文件校验器（CI 与本地共用同一实现）
- ✅ 校验项（fail-closed）：
  1. `ledger.json` 合法 JSON
  2. `status` ∈ 约定五值 `{待开工, 进行中, 待验收, 已验收, 已关闭}` ∪ `{unknown}`（unknown = 未填写，README 记 `—`）
  3. ledger 条数 == README 索引（`TASK-*` / `PLAN-*` 表格行）条数
  4. ID 集合双向相等（防漏登记 / 多登记）
  5. 逐条标题一致（ledger ↔ README）
  6. 逐条状态一致（README 状态列以 ledger 的 status 开头，允许其后括号补充说明）
  7. `file` 字段的 markdown 链接目标文件存在
  8. 任务目录结构：`.github/tasks/<ID>/` 存在时必含 `task.md` / `acceptance.md` / `devlog.md` / `devlog.events.json`（AC-008/010/011）
  9. 任务卡 front-matter 的 `status` 词表与台账同源（同一枚举；`accepted` 等英文别名视为违规）
- ✅ 归一词表：`TASK-AUDIT-001` / `TASK-INFRA-003` / `TASK-SEC-001` / `TASK-SEC-002` 的 `status: accepted` → `已验收`
- ✅ CI 接线：挂到 `Documentation Check` job **内部新增步骤**（该 job 无 `needs`、无 job 级 `if`，**始终上报**——不得新增 job，见 `.agents/skills/ci-triage/SKILL.md` 核心不变量）
- ✅ 本地同口径：`scripts/preflight.sh` 纳入该门（「本地与 CI 同命令」原则）
- ✅ `AGENTS.md` 同步（机制落地强制：新门禁必须回写规则入口）
- ✅ 台账登记：本卡进 `README.md` 索引 + `ledger.json`
- ✅ 退出码语义：`0` 通过 / `1` 违规 / `2` **无法检查**（缺 python3、缺文件）——2 不等于通过

### 非范围（OUT）

- ❌ 不把 `ledger.json` 改成「从 front-matter 生成」的单一事实源重构（方案 B，改动面大，另立卡评估）
- ❌ 不强制存量 43 张卡补齐优先级/状态（存量基线问题，由排期 v2 处理）
- ❌ 不校验验收清单的**内容**质量（AC-001/002 属人工审查）
- ❌ 不改任何业务代码、服务、迁移

## 关键约束

1. **不得新增 CI job**：必需检查必须每次都上报；新增 job 若不满足该不变量会卡死所有 PR
2. **不得用 `continue-on-error` / `|| true` 让该门变绿**（`.agents/skills/ci-triage/SKILL.md` 禁止事项）
3. **fail-closed**：无法检查（缺 python3 等）必须退出 2，由调用方按失败处理——「未验证 ≠ 通过」
4. **不得为让门通过而放宽判据**；当前台账应真实通过，若不过则修数据而非改判据
5. shell 脚本必须遵守 `${VAR}` 与非 ASCII 相邻规则（`scripts/check-shell-vars.sh` 会扫未跟踪脚本）

## 验收标准

1. 脚本存在且可直接执行：`bash .github/scripts/check-task-ledger.sh` 在当前分支退出 0
2. JSON 非法 → 退出 1 且输出可定位（反例验证：注入坏 JSON 临时副本）
3. 状态越界 → 退出 1（反例验证：注入 `已合并（PR #203）` 类自由文本）
4. 数量不一致 → 退出 1（反例验证：改 README 抬头数字不改表）
5. ID 集合不一致 → 退出 1（反例验证：删一条 ledger 条目 / 删一行 README）
6. 标题截断 → 退出 1（反例验证：复现 40 字符截断）
7. `file` 链接悬空 → 退出 1（反例验证：把某条 file 指向不存在路径）
8. 任务目录缺 `devlog.events.json` → 退出 1（反例验证）
9. front-matter 状态词表违规 → 退出 1（反例验证：写回 `status: accepted`）
10. 缺 python3 → 退出 2（未验证 ≠ 通过）
11. CI：`Documentation Check` job 内含该步骤；job 本身仍无 `if:`；`check-workflow-structure.sh` 通过
12. `scripts/preflight.sh` 纳入该门，本地可复现 CI 判定
13. `AGENTS.md` 已回写该机制（换会话/换模型不遗忘）
14. 真实数据通过：全量 43 张卡（含本卡）校验 exit 0

## 测试命令

```bash
# 正例：当前分支应通过
bash .github/scripts/check-task-ledger.sh; echo "rc=$?"        # 期望 rc=0

# 反例（不污染仓库：在临时副本上注入缺陷）
bash .github/scripts/check-task-ledger.sh --self-test; echo "rc=$?"   # 期望 rc=0（内置反例全过）

# CI 结构不变量
bash .github/scripts/check-workflow-structure.sh .github/workflows/ci.yml

# shell 规则自检
bash scripts/check-shell-vars.sh

# 本地同口径
scripts/preflight.sh --changed
```

## 输出

- 分支 `chore/task-ledger-check-2026-10-15`（**stack 在 `chore/ledger-backfill-2026-10-15f` 之上**——见下）
- PR 附验收勾对 + 开发日志链接

## 附：为什么本分支 stack 在回填分支之上

本校验器一旦接入 CI，**会对每个 PR 都跑**。而 `develop` 当前（回填前）的台账本身不满足判据：

- 4 条标题被截断 → 判据 6 失败
- README 抬头 40 张 vs ledger 43 条 → 判据 4 失败

即「门先于数据修好」会让 `develop` 直接变红。故本分支基于 `chore/ledger-backfill-2026-10-15f`，
**合并顺序必须是：回填 PR → 本 PR**。
