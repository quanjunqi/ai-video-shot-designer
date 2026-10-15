# TASK-INFRA-001 验收清单

> 任务卡：`.github/tasks/TASK-INFRA-001-migration-runner.md`
> 说明：实现已于 2026-10-10 提交合并（d612122，已在 develop）；**本清单补做验收闭环**（此前未验收、台账状态为空）。
> 验收方式：真实 PostgreSQL 16（Docker）8 类场景对照验证。

## 任务信息

- 任务名称：迁移执行器引入版本跟踪与校验和
- 关联任务卡：TASK-INFRA-001
- 开发者（AI）：AI Agent
- 验收日期：2026-10-15
- 目标一句话：迁移「只执行一次 + 校验和防篡改 + 显式采纳」从约定变成机制

## 一、需求点 → 可验证判据

| # | 验收标准（任务卡） | 验收判据（可客观验证） | 自检结果 |
|---|---|---|---|
| 1 | 全新库首次执行：全部应用，schema_migrations 记录齐全 | 全新 postgres 容器执行 migrate.sh exit 0；`schema_migrations` count = 迁移文件数；业务表存在 | ☑ 过 |
| 2 | 重复执行 exit 0 | 同库再跑一次 exit 0，输出「无需执行」；业务表数量不变 | ☑ 过 |
| 3 | 既有表无跟踪记录：拒绝并给出指引 | 建模拟业务表无 schema_migrations → 执行 exit 1，stderr 含指引（不静默 baseline） | ☑ 过 |
| 4 | MIGRATE_ADOPT=1：登记不执行 SQL | adopt 后 exit 0；schema_migrations count=文件数；**业务表仍只有模拟表**（未执行） | ☑ 过 |
| 5 | ADOPT_UNTIL：部分采纳后继续应用 | adopt until=021 后 exit 0；schema_migrations count=40；021 之前为登记值、022 之后业务表存在 | ☑ 过 |
| 6 | 已应用文件被改 → 校验和拒绝 | 修改容器内已应用迁移文件 → 执行 exit 1，错误引用 database-migrations 铁律 | ☑ 过 |
| 7 | 单文件失败整体回滚、先前保持已应用 | 追加 998 好文件 + 999 坏文件：998 登记成功、999 报错 exit 1、999 的 CREATE 被回滚（表不存在）、998 表存在 | ☑ 过 |
| 8 | 多库（production/execution/workspace/asset）均可工作 | 4 个 migrations 目录各在独立库全量执行 exit 0 | ☑ 过 |

## 二、设计稿逐点映射

非 UI 任务（基础设施脚本），不适用。

## 三、边界与约束

| # | 场景 | 预期 | 自检结果 |
|---|---|---|---|
| 1 | 未修改任何迁移文件（本任务非范围） | 仓库 migrations/ 无改动（验证均在容器内副本进行） | ☑ 过 |
| 2 | 采纳绝不执行 SQL | 场景 4 断言业务表数不变 | ☑ 过 |
| 3 | 未放宽校验和检查 | 场景 6 必须 exit 1 拒绝 | ☑ 过 |

## 四、验证结果实录（2026-10-15，Docker postgres:16-alpine 实测）

| 场景 | 结果 |
|---|---|
| 1 全新库 40 迁移全应用 + 记录齐全 | PASS（exit 0，rec=40，project_characters 表存在） |
| 2 重复执行 exit 0 | PASS（exit 0，业务表数 17 不变，无重复副作用） |
| 3 既有表无跟踪 → 拒绝 | PASS（exit 1，stderr 含 MIGRATE_ADOPT 指引） |
| 4 MIGRATE_ADOPT=1 登记不执行 | PASS（rec=40，业务表仅 legacy_data，SQL 未执行） |
| 5 ADOPT_UNTIL 部分采纳继续 | PASS（应用 17 + 采纳 23 = 40，exit 0） |
| 6 校验和篡改拒绝 | PASS（exit 1，错误引用 database-migrations 铁律） |
| 7 单文件失败回滚 | PASS（998 登记+表在；999 未登记+表回滚；原 40 记录保持） |
| 8 多库可用 | PASS（execution 18/18、workspace 9/9、asset 1/1） |

## 五、验收结论

- 全部判据 ☑ 后：本卡状态更新为**已验收**（台账同步）
