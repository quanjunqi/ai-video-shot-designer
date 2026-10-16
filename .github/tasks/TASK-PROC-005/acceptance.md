# TASK-PROC-005 验收清单

> 规则：AC-001~011。开工前产出（AC-008）。

## 任务信息

- 任务名称：后端文件行数自动门禁 + 债务棘轮
- 关联需求：BE-SIZE-001 / BE-LAYER-002 的检测方式机器化
- 开工日期：2026-10-16
- 目标一句话：让"文件超 500 行""main.go 超 50 行"**从人工审查变成自动阻断**，存量走只减不增的基线。

---

## 一、需求点 → 可验证判据

| # | 需求点 | 验收判据 | 自检结果 |
|---|---|---|---|
| 1 | 单一实现 | CI 与 preflight 调用的脚本路径**字符串相等**（无第二份） | ☐ |
| 2 | 退出码三态 | 通过=0；构造违规=1；**模拟缺 python3（PATH 剔除）=2** | ☐ |
| 3 | 棘轮：超基线即红 | 基线写小一个数 ⇒ 脚本 rc=1 且指名该文件 | ☐ |
| 4 | 棘轮：减少即提示 | 基线写大一个数 ⇒ rc=0 且输出"可收紧" | ☐ |
| 5 | 新超限文件阻断 | 造一个 501 行的临时 .go ⇒ rc=1 | ☐ |
| 6 | main.go 50 行纳入 | 基线给某 main.go 写 51 ⇒ rc=1 | ☐ |
| 7 | self-test | `--self-test` 跑 ≥4 个反例并全部按预期判红 | ☐ |
| 8 | CI 接入不破坏不变量 | `.github/workflows/ci.yml` 无**新增 job**、无**job 级 `if:`**；新步骤挂在始终运行的 job 内且为步骤级 | ☐ |
| 9 | preflight 同口径 | `scripts/preflight.sh` 调用同一脚本 + 同一基线文件 | ☐ |
| 10 | 基线准确 | `--update-baseline` 后条目集合 == 实测超标集合（逐条比对） | ☐ |
| 11 | 规则同步 | `backend-standards/SKILL.md` 检测方式列已改为脚本名（机制落地=同步规则文件） | ☐ |

## 二、设计稿逐点映射

**N/A —— 非 UI 任务**（CI/脚本）。

## 三、边界与三态

| # | 场景 | 预期 | 自检结果 |
|---|---|---|---|
| 1 | 正常（基线 == 实测） | rc=0 | ☐ |
| 2 | 缺 python3 | **rc=2（不得 0）** | ☐ |
| 3 | 基线文件缺失 | **rc=2（fail-closed，不当成"零超标"）** | ☐ |
| 4 | 基线行格式错误 | rc=2 并指名行号 | ☐ |
| 5 | `services/` 下无 Go 文件（异常） | **rc=2**（区间为空 ⇒ 未验证 ≠ 通过） | ☐ |
| 6 | 测试文件（`*_test.go`） | 是否纳入需明确并写进注释（超长测试文件也应受约束 or 明确豁免） | ☐ |

## 四、反模式自查

| # | 反模式 | 命中？ | 处理 |
|---|---|---|---|
| 1 | 用 `continue-on-error` / `\|\| true` 让门禁变绿 | ☐ | ci-triage 明令禁止 |
| 2 | 缺工具时静默 exit 0 | ☐ | 必须 rc=2（未验证≠通过） |
| 3 | 存量豁免不写"修复后改回阻断" | ☐ | 基线文件头注释必须写明 |
| 4 | 给必需检查 job 加 job 级 `if:` | ☐ | 判据 8 |
| 5 | 基线一设了之、永不收紧 | ☐ | 减少时输出"可收紧"提示（同 V-003b） |
| 6 | 新建第二份实现（CI 与本地各一份） | ☐ | 判据 1/9 |

## 五、门禁与测试

| # | 检查 | 命令 | 结果 |
|---|---|---|---|
| 1 | 脚本自检 | `bash scripts/check-file-size.sh --self-test` | ☐ |
| 2 | 脚本实跑 | `bash scripts/check-file-size.sh` | ☐ |
| 3 | 工作流结构不变量 | `bash .github/scripts/check-workflow-structure.sh .github/workflows/ci.yml` | ☐ |
| 4 | shell 变量门 | `bash scripts/check-shell-vars.sh` | ☐ |
| 5 | preflight | `scripts/preflight.sh --changed` | ☐ |
| 6 | 台账 | `bash .github/scripts/check-task-ledger.sh` | ☐ |

## 六、PR 附勾对结果

```markdown
## ✅ 验收勾对（acceptance-checklist）
- 需求点：__/11 通过（未过项：）
- 设计稿映射：N/A（非 UI）
- 边界与三态：6/6
- 反模式自查：6/6 未命中
- 门禁：self-test / 实跑 / workflow-structure / shell-vars / preflight / 台账
- 未过项及原因：（如实填写）
```
