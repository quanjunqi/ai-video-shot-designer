# TASK-FIX-001：修复 project_characters 缺失建表迁移与 020 重复主键缺陷

> 按 `.github/TASK_TEMPLATE.md` 填写。本任务修的是**缺陷**（P0 阻塞级），不是新功能。

## 目标

使 `services/production` 的迁移序列能在**全新数据库**与**带数据的既有数据库**上完整执行，
并让项目级角色库（ADR-002）真正可用。

## 背景与相关文件

审计发现两个**已用真实 PostgreSQL 对照实验确证**的缺陷：

### 缺陷 1：`project_characters` 无建表迁移（P0 阻塞）

- `internal/projectcharacter/postgres.go` 读写该表；`020_character_data_migration.sql` 向它 INSERT
- 但**全仓库无 `CREATE TABLE`**
- 迁移执行器为 `psql -v ON_ERROR_STOP=1` + `sh -e`（首个错误即整体中止）
- **实测**：全新库执行到 020 报 `ERROR: relation "project_characters" does not exist`
  → `deploy/local` 的 `app` profile 无法启动，且 021 永不执行

### 缺陷 2：020 的重复主键（带数据升级必失败）

- 020 的 `id = 'pc-' || md5(ea.project_id || '-' || ea.name)`
- 去重条件 `NOT EXISTS (SELECT 1 FROM project_characters …)` **只检查语句执行前的表状态**
- 因此同项目下**多个剧集出现同名角色**（主角出现在每一集 = 常态）时，
  同一条 `INSERT … SELECT` 插入两行相同 id
- **实测对照**：不同名 → 成功；同名 → `duplicate key value violates unique constraint "project_characters_pkey"`

相关文件：`services/production/migrations/`、`internal/projectcharacter/`、
`docs/architecture/data-model.md`、`docs/adr/project-character-library.md`

## 范围

- ✅ 新增 `019a_project_characters.sql`（建表）
- ✅ 新增 `019b_project_characters_backfill.sql`（去重回填，前置修正 020 步骤 1）
- ✅ 同步 `docs/architecture/data-model.md`、`CHANGELOG.md`
- ✅ 用 Docker 真实 PostgreSQL 16 做全新库 / 带数据 / 解析正确性三类验证

## 非范围

- ❌ **不修改任何已执行的迁移文件**（`.agents/skills/database-migrations/SKILL.md` 铁律）
- ❌ 不新增 `project_props` / `project_scenes` 表（无任何代码引用，不做无据推测）
- ❌ 不改造迁移执行器（重复执行不幂等是**独立缺陷**，另立任务）
- ❌ 不改 Go 代码

## 验收标准

1. 全新库按字典序执行全部迁移**零错误**
2. 带数据（含跨剧集同名角色）库执行 019a→021 **零错误**
3. 跨集同名角色最终为**一条** `project_characters` 记录，所有同名资产 `project_character_id` 指向它
4. 同名多行的代表值选取：优先有立绘的行
5. 新文件可重复执行（幂等）
6. `docs/architecture/data-model.md` 不再声称该表缺失

## 测试命令

```bash
# 真实 PostgreSQL 16 全新库验证（本地实测通过）
docker run --rm -d --name mdp-migtest -e POSTGRES_PASSWORD=test -e POSTGRES_DB=production postgres:16-alpine
for f in services/production/migrations/*.sql; do
  docker exec -i mdp-migtest psql -U postgres -d production -v ON_ERROR_STOP=1 -q < "$f" || echo "失败: $f"
done
docker rm -f mdp-migtest
```

## 约束与禁止事项

- 迁移文件**只增不改**
- 不修改已执行迁移（本任务通过「前置排序修复」实现，未触碰任何既有文件）
- 不删除数据；`ON CONFLICT DO NOTHING` 保证已存在记录不被覆盖

## 输出

- 分支 `fix/project-characters-migration-2026-10-10` + PR
- 测试结果：见 PR 描述的 Docker 实证输出
- 风险说明：019b 会读取 `episode_assets` 的历史字段；对已升级库为空操作

## 附：本任务中发现但**不在范围内**的问题

| # | 问题 | 证据 | 建议 |
|---|---|---|---|
| 1 | 迁移**不是全部幂等** → 重复执行失败 | `006_catalog_response_params.sql` 的 `ADD COLUMN response_params`（无 `IF NOT EXISTS`）；`workspace/004` 同类；`production/011` 的 `DROP CONSTRAINT`。实测第二次执行在 006 失败 | 迁移执行器改为**版本跟踪**（`schema_migrations` 表），从根上消除「必须幂等」的要求。另立任务 |
| 2 | compose 的 migrate job 每次 up 都重跑全部迁移 | `deploy/local/compose.yaml` 的 `for migration in /migrations/*.sql` | 同上 |
