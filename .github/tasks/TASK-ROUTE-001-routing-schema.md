# TASK-ROUTE-001：路由层表结构（逻辑模型 + 多渠道候选 + 租户策略）

> 按 `.github/TASK_TEMPLATE.md` 填写。ADR-003 落地的第 1 步（共 3 步）。

## 目标

为模型聚合网关的路由层建立 schema：对外是「逻辑模型」，内部是多渠道候选。

## 背景（ADR-003）

实测：`model_catalog` 带 `channel_id` → 一行模型只绑一个渠道，无失败切换。
外部看到「一个模型 = 一个渠道」，某家上游故障即整体不可用 —— 这只是在列渠道，不是聚合。

## 范围

- ✅ `production/025_logical_models.sql`：逻辑模型表
- ✅ `production/026_model_catalog_routing.sql`：`logical_model_id` + `route_priority` + 外键 + 部分索引
- ✅ `workspace/006_tenant_routing_policy.sql`：租户级 `own_channels_first` / `platform_fallback` / `max_attempts`
- ✅ 按实测校正 ADR-003 的取值（`status` 实为 `enabled/disabled`，非 `active`；`type` 无 `audio`）
- ✅ 任务卡 + CHANGELOG

## 非范围

- ❌ 不播种逻辑模型（候选绑定涉及"等价性判断"，需人工审核，另开 PR 附提案）
- ❌ 不改目录快照、execution 网关、BFF（第 2、3 步）
- ❌ 不放宽 `type` 以支持 `audio`（等真正接音频模型时同时改两处）

## 验收标准

1. `logical_models` 可建；`type` 限 `text/image/video`；`status` 限 `enabled/disabled`（**与实测一致**）
2. 多行 `model_catalog` 可共享同一 `logical_model_id`（= 候选集合）
3. 各候选 `provider_model` **可互不相同**（行级字段，这是解耦的关键）
4. `route_priority` 默认 100
5. **`logical_model_id IS NULL` 的行行为不变**（向后兼容，存量 16 行不受影响）
6. 删除逻辑模型 → 候选行保留并解绑（`ON DELETE SET NULL`，不误删上游配置）
7. 策略表默认 `own_channels_first=false`、`platform_fallback=true`、`max_attempts=3`
8. `max_attempts` 越界（如 11）被拒；不存在的 `workspace_id` 被外键拒绝
9. production 与 workspace 全量迁移在**全新库**上零错误

## 测试命令

```bash
docker run --rm -d --name mdp -e POSTGRES_PASSWORD=test -e POSTGRES_DB=production postgres:16-alpine
for f in services/production/migrations/*.sql; do docker exec -i mdp psql -U postgres -d production -v ON_ERROR_STOP=1 -q < "$f"; done
docker exec -i mdp psql -U postgres -d production -c "INSERT INTO logical_models (id,label,type) VALUES ('image-t2i-high','文生图-高质量','image');"
docker rm -f mdp
```

## 约束与禁止事项

- 迁移只增不改；先 `DROP CONSTRAINT IF EXISTS` 再 `ADD`
- 约束取值必须**照抄实测**，不得凭猜（本项目已因 `status` 取值写错而校正一次）
- 不得让 NULL 行为发生变化（向后兼容是硬要求）

## 风险说明

- `type` 暂无 `audio`：未来接音频模型需**同时**放宽 `logical_models` 与 `model_catalog` 两处约束（已记入 ADR 与迁移注释）
- 逻辑模型 `id` 一旦对外即成契约，不得改名（展示名用 `label`）
