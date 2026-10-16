# TASK-PROC-010 开发日志

## 动作 A（2026-10-17）
- 立卡：协议一致性快照门禁接入 CI。来源 #214 遗留——审计器已在 go test 生效，但快照新鲜度无门禁。
- 证据：develop 上 protocolaudit/audit.go（纯函数）+ TestAuditSnapshotRealDB 存在；快照 9 行真库实拍；production migrations 最新 = 067。
- 决策 D-001：脚本只做快照生命周期门禁（结构 + 新鲜度），不复刻 audit 逻辑（单一实现原则，审计在 Go 测试）。
- 决策 D-002：快照顶层加结构化 `migration` 字段（向后兼容，audit.go 只读 templates）。

## 动作 B（开发）
- 快照加 migration="067"（顶层结构化字段，audit_test 向后兼容通过）。
- 写 .github/scripts/check-protocol-consistency.sh：python3 静态比对（结构 5 字段 + id 唯一 + 迁移号==最新号段），
  退出码 0/1/2，--self-test 3 反例 + 3 正例。修复 B-001：迁移号前导零（067 vs 67）→ f"{max(nums):03d}"。
- CI ci.yml Documentation Check 步骤级挂载（退出码 2 显式红）；preflight 门 0d 挂载（同一脚本）。
- 验证：正例 RC=0（migration=067, templates=9）；self-test RC=0；go test ./internal/protocolaudit/ 通过。
- 台账三方一致（README/ledger/front-matter）已更新，criteria 6/6。

## 纪律自检
- 开工即建日志 ✓；清单先行 ✓；未越界（只改快照/脚本/CI/preflight/台账）✓。
