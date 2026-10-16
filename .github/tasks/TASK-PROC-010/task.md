---
taskId: TASK-PROC-010
status: 待验收
priority: P1（协议层治理收口——把一致性检查固化为 CI 门禁）
pr: null
criteria: 6
criteriaPassed: 6
depends_on: TASK-PROTOCOL-004/005（审计器与快照已在 develop）
---

# TASK-PROC-010：协议一致性快照门禁接入 CI（快照新鲜度 + 结构校验）

> **来源**：TASK-PROTOCOL-004 遗留项。审计器（纯函数 + go test 快照自证）已随
> CI test 关生效；但**快照新鲜度无门禁**——快照是 2026-10-17 真库实拍，
> 若将来 DB 再增删模板（协议迁移 068+）而快照不更新，`TestAuditSnapshotRealDB`
> 仍会通过（它只断言快照内无漂移，不校验快照是否过期）→ 一致性检查静默失效。
> 本卡把「快照必须跟得上协议迁移」固化为门禁。

## 目标

一句话：**新增 check-protocol-consistency.sh（CI Documentation Check 步骤级 +
preflight 门 0d 同一实现），快照过期/结构损坏即红；--self-test 证明门禁真的会红。**

## 检查项

| # | 检查 | 判据 |
|---|---|---|
| 1 | 快照存在 + JSON 有效 + 结构完整（source/fetched_at/note/templates 非空、id 唯一） | 违规 = 红 |
| 2 | 快照迁移号（顶层 migration 字段）== production migrations 最新号段 | 不一致 = 红（提示更新快照） |
| 3 | --self-test 反例自检 | 6 例（3 反例 + 3 正例） |

## 设计决策

- 快照顶层新增 `migration: "067"` 结构化字段（向后兼容：audit.go/测试只读 templates，不受影响）
- 脚本纯静态（python3，无 Go/DB 依赖）——审计逻辑不在此复刻（单一实现原则，
  审计在 Go 测试里），脚本只做快照生命周期门禁
- 退出码 0 通过 / 1 违规 / 2 无法检查（缺 python3 / 文件缺失），fail-closed
