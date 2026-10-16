---
taskId: TASK-PROC-009
status: 待验收
priority: **P1（门禁自身可信度）**
pr: "#<待开>"
criteria: 7
criteriaPassed: 7
depends_on: TASK-PROC-005 / 008（同类缺陷：fail-closed 口径写错 ⇒ 未验证被当通过）
---

# TASK-PROC-009：覆盖率门禁的三处可信度缺陷

## 来源：TASK-PROC-008 达标后自查「其它棘轮是否同款缺陷」查出的

`TASK-PROC-008` 在我自己的文件行数门禁上踩到「**成功态被误判为无法检查**」。据此自查其余棘轮，
在 `.github/scripts/check-coverage.sh` 上查出**三个真缺陷**（均属「未验证当通过 / 本地复现不了 CI」）。

### 缺陷 1：不在基线的服务被**静默跳过**（未验证当通过）

```bash
# 第 67-70 行
if [ -z "$floor" ]; then
  echo "   ⚠️  ${svc}：baseline 中无下限配置，跳过"
  return 0                      # ← 静默判为通过
fi
# 第 89 行
done < "$BASELINE"               # ← 只遍历基线文件 ⇒ 不在基线的服务【根本不会被看到】
```

**实证**：造一个 `services/zzz-blindspot-proof/`（有 Go 代码、无基线条目）后跑 `--all`，
输出里**完全没有它的任何一行** ⇒ **新增服务可以带着 0% 覆盖率上线，门禁不报**。
这违反 `ci-triage` 明令禁止的「把未验证当通过（静默 exit 0 —— 未验证 ≠ 通过，应当红）」。

### 缺陷 2：错误提示里的反引号被**当作命令执行**

```bash
# 第 100 行（原样）
echo "   → 覆盖率门禁未通过（见 `.agents/skills/backend-standards/SKILL.md` 覆盖率棘轮口径）"
```
双引号内的 `` `...` `` 是**命令替换** ⇒ 实际去**执行**了那个 Markdown 路径：
```
.github/scripts/check-coverage.sh: line 100: .agents/skills/backend-standards/SKILL.md: Permission denied
```
（同仓 `check-shell-vars.sh` 与本文件第 440 行注释都记录了这类坑的**另一种形态**：
`$var` 紧跟非 ASCII；本缺陷是**反引号在双引号内**，那道门不覆盖。）

### 缺陷 3：**本地无法复现 CI 的覆盖率判定** ⇒ 恒假红

- CI 的 `*_TEST_DATABASE_URL` 指向 `postgres://shotdesigner:shotdesigner@127.0.0.1:5432/postgres`
  且 job 起了 `postgres:16` 容器（ci.yml:151-184）
- 本机 5432 是 **dev-local 的 `shotdesigner-postgres-1`**，凭据**不同**
  ⇒ 集成测试 **FAIL**（`password authentication failed for user "shotdesigner"`，实测）而不是 skip
  ⇒ 覆盖率被人为压低 ⇒ 实测 7 个服务里 **5 个假红**：
  workspace 49.2/52、production 23.5/50、execution 42.8/55、asset 25.4/80、outbox-relay 28.8/60
- **★ 而本机本来就有一个为复现 CI 起好的库**：容器 `ci-repro-pg`
  （`postgres:16-alpine`，`shotdesigner/shotdesigner/postgres`，监听 **15432**，CI 凭据实测可连）
  —— **但没有任何脚本用它**。
- 这与本项目自己声明的价值冲突（ci.yml:446：「用 Python 而非 grep -P：后者在 macOS 上不可用，
  **本地就复现不了 CI 的判定**」）。

## ⚠️ 一处必须撤回的结论（记录在案）

自查过程中我一度报出「**5 个服务覆盖率回退**」。**该结论已被我自己证伪并撤回**：
它是本地库凭据不匹配导致的测量假象，**不是真回归**。
撤回依据：①与 CI 等价的环境变量重跑结果相同；②直接跑单个集成测试得
`password authentication failed`；③本机 5432 的容器与 CI 的容器并非同一个。
**教训：报「回归」之前必须先排除自己的测量装置。**

## 验收标准

1. **缺陷 1 修复**：`check-coverage.sh` **扫实际服务目录**而非基线文件；
   **某服务目录存在但基线无下限 ⇒ 判失败**（不得静默跳过）
2. **反例自证**：加一个无基线条目的服务 ⇒ 门禁**必须红**且**指名它**（本次已实测出旧行为是"沉默"）
3. **缺陷 2 修复**：第 100 行的反引号改为普通引号/转义；跑一次"未通过"路径**不得**再出现
   `Permission denied`；且 `check-shell-vars.sh` 覆盖此类（若它本该覆盖却漏了 ⇒ 同步扩展那道门）
4. **缺陷 3 修复**：本地跑覆盖率时使用 **CI 等价的数据库**（优先 `ci-repro-pg:15432`），
   并**在脚本里显式声明**用的是什么；若该库不可用 ⇒ **判 2（无法检查）**，不得静默用错误的库
5. **复现性验证**：用修复后的方式跑 `--all`，结果与 CI 的判定**同口径**
   （期望：不低于下限，或若确有回退则**如实报出**；两种结果都可接受，**不可接受的是假红**）
6. `--self-test`（若本来有）或等价反例自检覆盖缺陷 1 与 3 的判定分支
7. 台账 + 规则同步（`.agents/skills/backend-standards/SKILL.md` 覆盖率棘轮口径 + AGENTS.md 若有机制变更）

## 非范围

- ❌ 不改任何覆盖率下限（除非复现后发现确需调整，那要单独立项并说明理由）
- ❌ 不改集成测试的 skip 条件
- ❌ 不追求把覆盖率补齐（那是业务侧的另一条线）
