---
name: database-migrations
description: 当需要新增或修改数据库迁移、涉及 schema 变更、或遇到迁移校验和拒绝时加载。包含只增不改、号段认领、执行与验证。
---

# 数据库迁移规范

> 完整文档见 `docs/how-to/database-migrations.md`。
> 本文件是 AI 执行时的快速参考。

## 什么时候加载这个 skill

- 要新增 `services/*/migrations/` 下的迁移文件
- 涉及 `CREATE TABLE` / `CREATE INDEX` / `ALTER` / `COMMENT` 等 schema 变更
- 迁移执行报"校验和不匹配"或"已应用文件被修改"
- 要手工在测试库/本地库建表或改结构（先想：是不是该走迁移？）

## 铁律

**迁移文件只增不改。** 已应用的文件被修改，执行器校验和会拒绝执行。
需要回退 → 新增反向迁移文件，不修改原文件。

## 号段认领（开工前先认领，登记进任务卡）

| 服务 | 号段 |
|---|---|
| workspace | 001-009 |
| execution | 010-019 |
| production 模型中心 | 024-039 |
| production 项目知识库 | 040-049 |
| production 无限画布 | 050-059 |

撞号时：**后到者立即让号**，同时改文件名与内部标题。

## 执行

```bash
docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml \
  --profile app up production-migrate
```

## 禁止事项

- ❌ 修改已应用的迁移文件
- ❌ `DROP TABLE` / 全表 `DELETE` / `ALTER` 删列（需 Owner 决策）
- ❌ 绕过迁移直接改库结构
- ❌ 使用未认领号段

## 验证

- 迁移后 `\d <table>` 检查结构，跑一次依赖该表的最小查询
- 既有数据变更（加列默认值 / 类型变更）先在测试库验证数据无损
- 改动后跑 `go test ./...`（集成测试走 `production_test`）

## 完整文档

→ `docs/how-to/database-migrations.md`
→ 服务边界：`docs/architecture/technical-architecture.md`
