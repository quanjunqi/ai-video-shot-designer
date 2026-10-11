# 数据库迁移规范

> 迁移是 schema 变更的**唯一途径**。本仓库迁移执行器带版本跟踪与校验和：
> **已应用的迁移文件禁止修改**，改动会被拒绝执行。这条由机制强制，不是口头约定。

## 1. 基本规则

- 所有 schema 变更必须通过迁移文件，禁止手工 `ALTER TABLE` / `CREATE TABLE`。
- 迁移文件命名：`NNN_description.sql`（三位数字递增，如 `010_add_audit_logs.sql`）。
- 迁移包含：`CREATE TABLE`、`CREATE INDEX`、`COMMENT`、初始数据。
- 迁移文件**只增不改**：已执行的文件修改会被校验和执行器拒绝。
- 需要回退时，**新增反向迁移文件**，不修改原文件。

## 2. 号段认领（开工前必做）

多开发线并行时，两条线同时新增 `010_*.sql` 会撞号。**开工前先认领号段并登记在任务卡里**：

| 线 | 服务 | 号段 |
|---|---|---|
| 租户与凭据 | workspace | 001–009 |
| 基础设施/可靠性 | execution | 010–019 |
| 模型中心/网关 | production | 024–039 |
| 项目知识库 | production | 040–049 |
| 无限画布 | production | 050–059 |

> 号段用尽或跨线借用时：在 PR 中说明并更新号段表；**后合并的一方负责改号并重跑迁移验证**
> （迁移执行器带校验和，改号＝新增文件，不会破坏已应用的记录）。

## 3. 执行迁移

```bash
# 推荐方式：走带版本跟踪与校验和的执行器
docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml \
  --profile app up production-migrate

# 手工执行单个迁移（仅排障时；不会写入 schema_migrations，
# 可能导致跟踪记录与实际不一致——排障完立即用执行器对齐）
docker exec -i shotdesigner-postgres-1 psql -U shotdesigner -d <dbname> < migration.sql
```

常用数据库（由 deploy/local Compose 初始化）：

| 数据库 | 归属服务 |
|---|---|
| `workspace` / `production` / `execution` / `asset` | 各服务独享，服务间不共享表 |
| `production_test` | 集成测试专用（compose `test` profile） |
| `temporal` / `temporal_visibility` / `keycloak` | 平台中间件 |

## 4. 禁区

- ❌ 修改已应用的迁移文件（执行器校验和会拒绝）
- ❌ `DROP TABLE` / `DELETE` 全表 / `ALTER` 删除列（破坏性操作，需 Owner 决策）
- ❌ 绕过迁移直接改库结构
- ❌ 使用未认领的号段

## 5. 验证

- 迁移执行后必须验证：`\d <table>` 检查表结构、跑一次依赖该表的最小查询。
- 涉及既有数据的变更（加列默认值、类型变更），先在生产副本/测试库验证数据无损。
- 集成测试依赖测试库（`production_test`），迁移改动后 CI 的 backend job 会全量重跑。

## 6. 相关文档

- 服务边界与数据归属：[docs/architecture/technical-architecture.md](../architecture/technical-architecture.md)
- 并行开发号段规则：[docs/how-to/parallel-work.md](parallel-work.md)
