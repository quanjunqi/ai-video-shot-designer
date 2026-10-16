# TASK-PROC-010 需求验收清单

## 任务信息
- 任务名称：协议一致性快照门禁接入 CI（快照新鲜度 + 结构校验）
- 关联任务卡：TASK-PROC-010（来源：#214 遗留）
- 开发者（AI）：AI Agent（会话 m_0cwRd4Q1hew）
- 开工日期：2026-10-17
- 目标一句话：快照过期/损坏即 CI 红 + preflight 门 0d 同步，门禁真的会红（self-test 自证）

## 一、需求点 → 可验证判据
| # | 需求点 | 验收判据 | 四要素备注 | 自检 |
|---|---|---|---|---|
| 1 | 快照结构化迁移号 | 快照顶层含 `migration` 字段 = 当前最新号段 067；note 保留人读注记 | 文件内容 | ✅ 过 |
| 2 | 门禁脚本 | `.github/scripts/check-protocol-consistency.sh` 存在且可执行；快照结构损坏→退出 1 | 命令执行 | ✅ 过 |
| 3 | 新鲜度比对 | 脚本比对快照 migration vs migrations 目录最新号；不一致→退出 1 且输出提示 | 命令执行 | ✅ 过 |
| 4 | self-test | `--self-test` 跑 3 反例 + 3 正例全按预期（退出码断言） | 命令执行 | ✅ 过 |
| 5 | CI 挂载 | ci.yml Documentation Check 步骤级加 Check protocol snapshot consistency（退出码 2 视为红） | 文件内容 + 审查 | ✅ 过 |
| 6 | preflight 同步 | scripts/preflight.sh 门 0d 调同一脚本（单一实现） | 命令执行 | ✅ 过 |

## 二、设计稿逐点映射
非 UI 任务，无设计稿（AC-009 不适用）。

## 三、三态与边界
| # | 场景 | 预期 | 自检 |
|---|---|---|---|
| 1 | 快照缺 migration 字段 | 退出 1（结构损坏） | ✅ 过（self-test 反例 1） |
| 2 | 快照 JSON 非法 | 退出 1，不 panic | ✅ 过（self-test 反例 2） |
| 3 | migrations 目录空/缺 python3 | 退出 2（无法检查 ≠ 通过） | ✅ 过（代码路径 + 反例） |
| 4 | 快照与最新迁移一致 | 退出 0 | ✅ 过（正例 RC=0） |

## 四、反模式自查
| # | 检查 | 命中？ | 处理 |
|---|---|---|---|
| 1 | 造 mock/推测数据 | ☐ 否 | 快照 = 真库实拍 + 迁移目录实读 |
| 2 | 连库依赖 | ☐ 否 | 纯静态比对 |
| 3 | 复刻 audit 逻辑（双实现） | ☐ 否 | 脚本只管快照生命周期，审计在 Go 测试 |
| 4 | 门禁悄悄降级（2 当 0） | ☐ 否 | 退出码 2 显式报红（对齐 check-task-ledger 口径） |

## 五、门禁与测试
| # | 检查 | 命令 | 结果 |
|---|---|---|---|
| 1 | 脚本正例/反例 | `bash .github/scripts/check-protocol-consistency.sh --self-test` | ☐ |
| 2 | 台账门禁 | `bash .github/scripts/check-task-ledger.sh` | ☐ |
| 3 | preflight | `bash scripts/preflight.sh`（门 0d 含入） | ☐ |

## 六、PR 附勾对结果
```markdown
## ✅ 验收勾对（acceptance-checklist）
- 需求点：6/6 通过（未过项：无）
- 三态与边界：4/4 通过
- 反模式自查：4/4 未命中
- 门禁：self-test 全绿 / 台账门禁通过 / preflight 门 0d 通过
- 未过项及原因：（如实填写）
```
