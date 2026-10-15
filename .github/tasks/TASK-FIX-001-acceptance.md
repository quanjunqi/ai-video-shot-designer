# TASK-FIX-001 验收清单

> 任务卡：`.github/tasks/TASK-FIX-001-project-characters-migration.md`
> 说明：实现已于 2026-10-10 提交合并（e38b033，已在 develop）；**本清单补做验收闭环**（此前未验收、台账状态为空）。
> 验收方式：真实 PostgreSQL 16（Docker）三类对照验证。

## 任务信息

- 任务名称：修复 project_characters 缺失建表迁移与 020 重复主键缺陷
- 关联任务卡：TASK-FIX-001
- 开发者（AI）：AI Agent
- 验收日期：2026-10-15
- 目标一句话：全新库与带数据库都能完整执行生产迁移序列，项目级角色库（ADR-002）真正可用

## 一、需求点 → 可验证判据

| # | 需求点（任务卡验收标准） | 验收判据（可客观验证） | 判据四要素备注 | 自检结果 |
|---|---|---|---|---|
| 1 | 全新库按字典序执行全部迁移零错误 | Docker postgres:16-alpine 全新库，`LC_ALL=C` 字典序逐个执行 `services/production/migrations/*.sql`，全部成功、无一报错 | 判据：psql `ON_ERROR_STOP=1` 退出码 0；对象：完整迁移序列；时点：全新库首次执行；例外：无 | ☑ 过 |
| 2 | 带数据（含跨剧集同名角色）库执行 019a→021 零错误 | 先执行 001-019 建表并插入「同一项目两个剧集各一条同名角色」数据，再执行 019a→019b→020→021，零错误 | 判据：同上；对象：019a/019b/020/021；时点：带数据升级；例外：无 | ☑ 过 |
| 3 | 跨集同名角色最终为一条记录，所有同名资产指向它 | 验证 2 后查询：`project_characters` 中同名角色 count=1；两条 `episode_assets` 的 `project_character_id` 均指向该角色 id | 判据：SQL count + join 断言；对象：project_characters / episode_assets；时点：迁移完成后；例外：无 | ☑ 过 |
| 4 | 同名多行的代表值选取：优先有立绘的行 | 同名两条资产一条有 `image_url`、一条为空：迁移后 `project_characters.image_url` = 有立绘那条的值，`image_status='generated'` | 判据：SQL 断言 image_url 非空；对象：project_characters；时点：迁移完成后；例外：无 | ☑ 过 |
| 5 | 新文件可重复执行（幂等） | 019a/019b 在已执行库上再跑一遍，零错误（`CREATE TABLE IF NOT EXISTS` + `ON CONFLICT DO NOTHING`） | 判据：psql 退出码 0；对象：019a/019b；时点：二次执行；例外：无 | ☑ 过 |
| 6 | data-model.md 不再声称该表缺失 | `docs/architecture/03-data-model.md` §「建表迁移」状态为已修复，列明 019a/019b | 判据：grep 断言；对象：03-data-model.md；时点：验收时；例外：无 | ☑ 过 |

## 二、设计稿逐点映射

非 UI 任务（数据库迁移缺陷修复），不适用。

## 三、边界与约束

| # | 场景 | 预期 | 自检结果 |
|---|---|---|---|
| 1 | 未修改任何已执行迁移文件（铁律） | `git diff f60c4ad..HEAD` 不含 001-020 既有文件改动 | ☑ 过 |
| 2 | 不新增非范围内表（project_props/scenes） | 迁移 diff 仅 019a/019b + 文档 | ☑ 过 |
| 3 | 已升级库（020 已成功）重复执行 019a/019b 不覆盖已有数据 | `ON CONFLICT DO NOTHING`；验证 C 断言 | ☑ 过 |

## 四、验证结果实录（2026-10-15，Docker postgres:16-alpine 实测）

| 验证 | 结果 |
|---|---|
| A 全新库 40 迁移字典序 | PASS（零错误，表存在） |
| B 带数据跨集同名 019a→021 | PASS（零错误） |
| B 同名合并唯一 | PASS（小明 count=1） |
| B 资产指向唯一 | PASS（ea1/ea2 同指 pc-9fcdd…） |
| B 代表值优先立绘 | PASS（image_url=有立绘行） |
| C 幂等（019a/019b 二次执行） | PASS（角色数保持 2） |
| D 未改已执行迁移 | PASS（diff 仅 019a/019b+文档） |

## 五、验收结论

- 全部判据 ☑ 后：本卡状态更新为**已验收**（台账同步）
- 验收人：AI Agent（实现人自查 + Docker 实证）｜Owner 抽查：台账已同步可查
