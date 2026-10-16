---
taskId: TASK-PROC-005
status: 进行中
priority: **P0（规范已漂移，且根因是"无门禁"）**
pr: "#<待开>"
criteria: 9
criteriaPassed: 0
depends_on: —（独立；与 TASK-OBS-003 无耦合）
---

# TASK-PROC-005：后端文件行数自动门禁 + 债务棘轮（BE-SIZE-001 / BE-LAYER-002）

## 来源：不是推测，是实测漂移

用规范自带阈值直接测量 `services/`（101 个 Go 文件）：

**BE-SIZE-001（单文件 ≤ 500 行）—— 5 个超标：**

| 行数 | 文件 | 超出 |
|---|---|---|
| **783** | `execution/internal/httpapi/handlers_generate.go` | +57% |
| **757** | `web-bff/internal/httpserver/handlers.go` | +51% |
| 525 | `execution/internal/httpapi/handlers.go` | +5% |
| 517 | `production/internal/httpapi/handlers.go` | +3% |
| 512 | `execution/internal/engine/engine.go` | +2% |

**文件组织（`cmd/server/main.go` ≤ 50 行）—— 3 个超标：**
`execution` **184 行（×3.7）** · `production` 94 行（×1.9） · `asset` 73 行（×1.5）

**BE-LAYER-003（有无 `internal/`）：6/6 合规** ✅

## 根因：**规则没有检测方式**

| 规则 | 规范自述的检测方式 |
|---|---|
| **BE-SIZE-001** | **人工 + PR 审查** |
| `cmd/server/main.go ≤ 50 行` | （**无自动检测**） |

⇒ **无自动门禁 ⇒ 必然漂移。** 这不是"某次没遵守"，而是**机制缺失**。

**对照证据**：前端有 `quality-gate.mjs` 的 V-00x **自动检测** + `ui-text-debt-baseline.json` **棘轮**
⇒ 前端未漂。**⇒ 本卡把同一模式补到后端。**

## 范围

1. 新增**单一实现**的检查脚本（CI 与 preflight 共用，避免两套口径）
2. 新增**债务基线**文件（存量豁免，**只减不增**）
3. 接入 CI（**步骤级**，挂在始终运行的 job 上）与 `scripts/preflight.sh`
4. **不在本卡修那些超标文件**——本卡只**止住新增**（同前端 V-003b 的处置）

## 复用的既有模式（不重新发明）

| 来源 | 照抄的要点 |
|---|---|
| `apps/web/scripts/quality-gate.mjs` V-003b | 逐文件计数 vs 基线；**超过即阻断**；`--update-*` 刷新；注释写明"只减不增，清零后基线应为空"；减少时提示收紧 |
| `.github/coverage-baseline.txt` | 文本格式 `<key> <value>` + `#` 注释解释棘轮语义与实测日期 |
| `.github/scripts/check-task-ledger.sh` | 退出码 **0 通过 / 1 违规 / 2 无法检查**（**2 ≠ 通过**）；`--self-test` 跑反例自证会红 |
| `.agents/skills/ci-triage` | **fail-closed**；禁 job 级 `if:`；存量豁免必须写明「修复后改回阻断」 |

## 验收标准

1. 存在**单一**检查脚本（CI 与 preflight 调用同一个），无第二份实现
2. **退出码三态**：`0` 通过 / `1` 违规 / **`2` 无法检查（缺工具等）—— 2 不得被当作通过**
3. **棘轮语义正确**：某文件行数 **> 基线** ⇒ 失败；**< 基线** ⇒ 通过并**提示收紧基线**；基线外的新超限文件 ⇒ 失败
4. `cmd/server/main.go` 的 50 行上限**同样纳入**（BE-LAYER-002 的机器化）
5. `--self-test` 跑**反例**证明门禁真的会红（≥4 个反例：超基线、新超限文件、main.go 超限、基线文件缺失）
6. `--update-baseline` 可刷新基线，且**刷新后基线条目 = 实测超标集合**（不吞不虚增）
7. 接入 CI：**步骤级**（不新增 job、不加 job 级 `if:` ⇒ 不破坏"必需检查必上报"不变量）
8. 接入 `scripts/preflight.sh`，与 CI **同口径**（同一脚本 + 同一基线文件）
9. 台账 + 规范同步：`.agents/skills/backend-standards/SKILL.md` 的检测方式列由「人工」改为脚本名（**机制落地 = 同步规则文件**）

## 非范围

- ❌ **不修** 那 5 个超标文件与 3 个 main.go（另立卡；本卡只止新增）
- ❌ 不改 BE-SIZE-001 的阈值（500 行）
- ❌ 不引入新依赖（用 python3/shell，与既有检查脚本一致）
- ❌ 不做"薄服务例外"（BE-LAYER-003 明确禁止）

## 附：立卡依据（可复现）

```bash
# 当前超标集合（本卡基线应与此一致）
find services -name '*.go' -not -name '*_test.go' | while read -r f; do
  n=$(wc -l < "$f"); [ "$n" -gt 500 ] && echo "$n $f"; done | sort -rn
for s in workspace production execution asset web-bff outbox-relay; do
  n=$(wc -l < "services/$s/cmd/server/main.go" 2>/dev/null); [ "${n:-0}" -gt 50 ] && echo "$n $s"; done
```
