# TASK-ROUTE-002：逻辑模型与候选绑定 API（production 服务）

> ADR-003 落地第 2 步的前半：先有 API，前端才有页面可做。

## 目标

让逻辑模型（对外标识）与候选（多渠道）可被程序化创建、绑定、排序。

## 背景

迁移 025/026 已建表，但 production 服务**没有任何 API** —— 管理页无从做起。

## 范围

- ✅ `internal/catalog`：类型/校验/领域错误/Store 接口 + pgx 实现（写操作全事务）
- ✅ `internal/httpapi`：7 个端点 + 错误→状态码映射
- ✅ 单测 + **真库集成测试**（env 门控，未设 DSN 时 SKIP）
- ✅ 任务卡 + CHANGELOG

## 端点

```
GET|POST /internal/v1/logical-models
GET|PATCH /internal/v1/logical-models/{id}
GET|POST  /internal/v1/logical-models/{id}/candidates
DELETE    /internal/v1/logical-models/{id}/candidates/{modelId}
```

## 验收标准（含我特意加的防坑约束）

1. **`id` 不可修改**：请求体 id ≠ 路径 id → 400 `ID_IMMUTABLE`
2. 绑定**只允许改** `logical_model_id` 与 `route_priority` 两列
3. 候选**已属于另一逻辑模型** → 409 `MODEL_ALREADY_BOUND`（避免静默抢占），且**整体回滚**
4. 解绑是**置 NULL**，`model_catalog` 行必须保留
5. 候选按 `route_priority` 升序返回；未给优先级时默认 100
6. 不存在的逻辑模型 → 404；不存在的 modelId → 404 并**点名**
7. 未提及的候选行**不被改动**
8. 并发绑定同一候选：**恰好一方成功、一方 409**（不变量，非尽力而为）
9. `GET /internal/v1/catalog` 行为不回归（仍返回原 16 个模型）

## 测试命令

```bash
export GOCACHE=/tmp/mdp-gocache
cd services/production && gofmt -l . && go build ./... && go vet ./... && go test ./...
# 真库集成（未设 DSN 时自动 SKIP）
docker run --rm -d --name mdpapi -p 55440:5432 -e POSTGRES_PASSWORD=test -e POSTGRES_DB=production postgres:16-alpine
for f in services/production/migrations/*.sql; do docker exec -i mdpapi psql -U postgres -d production -v ON_ERROR_STOP=1 -q < "$f"; done
PRODUCTION_TEST_DATABASE_URL="postgres://postgres:test@127.0.0.1:55440/production?sslmode=disable" go test ./internal/catalog/ -run Postgres -v
docker rm -f mdpapi
```

## 已确认的行为选择（实现时明确过的边界）

| 场景 | 选择 | 理由 |
|---|---|---|
| `PATCH` 请求体 id 与路径**相同** | 200 放行 | 同值不构成改名意图；已用测试固定 |
| `DELETE` 一个本就不属于任何逻辑模型的候选 | 404 `CANDIDATE_NOT_FOUND` | 无绑定可删 → 明确 404，避免含糊的 204 |
| 列表过滤枚举非法值（`status=paused`、`type=audio`） | 400 | 防御性校验，避免静默返回空集 |
| 未强制 `Idempotency-Key` | 不加 | 与既有 `createCatalogModel` 一致，不擅自扩张契约 |

## 两个重要的技术陷阱（已规避，供后人参考）

1. **pgx NULL 陷阱**：text codec 在解码前即拒绝 NULL 扫入 `*string`（报
   `cannot scan NULL into *string`），**`COALESCE(col,'')` 护不住** —— NULL 先到 codec。
   可空列必须扫进 `**string`。
2. **并发绑定会静默抢占**：只做「SELECT 查归属 + UPDATE」在 read committed 下，
   若行在 SELECT 后被别的逻辑模型抢走，UPDATE 命中 0 行而 store 仍返回成功。
   已改为事务内 `SELECT … FOR UPDATE` 锁候选行。

## 附：发现的一个**既有**测试缺陷（不在本任务范围）

`internal/project` 的 `TestPostgresCreateReplayIsolationAndImmutability` 断言
`DELETE FROM source_versions` 会被触发器拒绝；但迁移 `015_allow_source_version_delete.sql`
已把触发器收窄为**仅 BEFORE UPDATE**，因此该断言过时 —— **本地有真库时必失败**
（CI 不设 DSN 会 SKIP，所以一直没暴露）。建议单开任务修：要么改测试断言，
要么恢复 DELETE 保护。
