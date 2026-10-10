# TASK-INFRA-001：迁移执行器引入版本跟踪与校验和

> 按 `AGENTS.md` §5.3 填写。承接 `TASK-FIX-001` 附表中记录的遗留问题。

## 目标

把「每个迁移必须自己幂等」这一隐含要求从根上消除，并让
`AGENTS.md` §7「已执行迁移只增不改」从**约定**变成**机制**。

## 背景

`deploy/local/compose.yaml` 原先的 migrate job 是：

```sh
for migration in /migrations/*.sql; do psql -v ON_ERROR_STOP=1 -f "$migration"; done
```

问题（均已实证）：

| # | 问题 | 证据 |
|---|---|---|
| 1 | **每次 up 都重跑全部迁移**，而迁移并非全部幂等 → 第二次执行必然失败 | 实测在 `006_catalog_response_params.sql` 报 `column "response_params" of relation "model_catalog" already exists`。非幂等语句另有 `workspace/004` 的 `ADD COLUMN`、`production/011` 的 `DROP CONSTRAINT` |
| 2 | 无已应用记录 → 无法知道库处于哪一版 | — |
| 3 | 无法发现「已应用迁移被改动」 | — |

## 范围

- ✅ 新增 `deploy/local/migrate.sh`（版本跟踪 + 校验和 + 逐文件事务 + advisory lock）
- ✅ 4 个 migrate 服务（production/workspace/asset/execution）切换到新执行器
- ✅ 既有无跟踪记录的库：**显式采纳**（`MIGRATE_ADOPT`）而非静默 baseline
- ✅ 同步 `deploy/local/README.md`、`AGENTS.md`、`CHANGELOG.md`

## 非范围

- ❌ 不修改任何迁移文件（本任务不碰 migrations/）
- ❌ 不引入第三方迁移工具（保持零新增依赖）
- ❌ 不改变迁移的**应用顺序**（仍为字典序）

## 验收标准

1. 全新库首次执行：全部应用，`schema_migrations` 记录齐全
2. **重复执行 exit 0**（原执行器在此必失败）
3. 既有表但无跟踪记录：**拒绝**并给出可操作指引（不静默 baseline）
4. `MIGRATE_ADOPT=1`：登记为已应用但**不执行** SQL
5. `MIGRATE_ADOPT=1 MIGRATE_ADOPT_UNTIL=<version>`：部分采纳后继续应用其后的文件
6. **已应用文件被修改 → 校验和不匹配 → 拒绝**，错误信息引用 AGENTS.md §7
7. 单文件失败时该文件整体回滚、先前文件保持已应用
8. 多库（production / execution / workspace / asset）均可工作

## 测试命令

```bash
docker run --rm -d --name mdpmig -e POSTGRES_PASSWORD=test -e POSTGRES_DB=production postgres:16-alpine
docker cp deploy/local/migrate.sh mdpmig:/migrate.sh
docker cp services/production/migrations mdpmig:/migrations
export PGX="-e PGHOST=127.0.0.1 -e PGUSER=postgres -e PGPASSWORD=test -e PGDATABASE=production"
docker exec $PGX mdpmig sh /migrate.sh     # 全新库
docker exec $PGX mdpmig sh /migrate.sh     # 重复执行（关键）
docker rm -f mdpmig
```

## 约束与禁止事项

- 采纳（adopt）**绝不执行** SQL，只登记版本与校验和
- 不得为「让升级通过」而放宽校验和检查

## 输出

- 分支 `feat/migration-runner-versioning-2026-10-10` + PR
- 测试结果：见 PR 描述（7 类场景）
- 风险说明：既有本地库首次使用需执行一次显式采纳；未采纳则拒绝启动，属**有意的 fail-closed**

## 附：仍未处理

| # | 问题 | 说明 |
|---|---|---|
| 1 | 迁移无「向下」脚本 | 回滚仍依赖备份；见 `docs/development/release.md` §4 |
| 2 | 部分迁移注释与实际不符 | 例如某些 NOTICE 显示 `DROP TRIGGER IF EXISTS` 针对不存在的触发器，属历史遗留 |
