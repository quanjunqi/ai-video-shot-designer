# TASK-SEC-004：鉴权改数据驱动（authHeader + authPrefix）

> ADR-007 D2（Owner 已确认）。消除 `auth_type` 封闭枚举带来的"每遇新形态就改代码+迁移"。

## 背景
为对接 AutoDL 的裸 Token（`Authorization: <key>`，无前缀），我们付出了：engine 改 3 处 +
新增 `auth_type='token'` + 两个迁移放宽 CHECK（`workspace/005`、`production/024`）。
参考实现用 `authHeader` + `authPrefix` 两字段通吃。

## 范围
- ✅ `workspace/007`、`production/027`：各加 `auth_header`/`auth_prefix`（**可空、不回填**）
- ✅ `execution`：`Credentials` 加两字段；`applyAuth` 数据驱动；creds 客户端解析透出
- ✅ `workspace`：store/handler 读写与 reveal 透出
- ✅ 单测 + 真库集成测试

## applyAuth 分支表（兼容性底线）
```
AuthHeader != "" → Set(AuthHeader, AuthPrefix + APIKey)
AuthHeader == "" → none/"" → 不写头
                   token   → Authorization: <key>
                   其余(含未知) → Authorization: Bearer <key>
```

## 验收标准
1. `AuthHeader` + **空前缀** = 裸 Token（空前缀必须被保留，**不得转成 NULL**）
2. 无 `authHeader` 时，五种 `auth_type` 行为与改动前**逐字一致**
3. 自定义头名（如 `X-Api-Key`）真的生效，且**优先于** `auth_type`（含 `none`）
4. 可空列 NULL → 读出空串**不 panic**（pgx 在 codec 层拒绝 NULL 扫入 `*string`，`COALESCE` 护不住）
5. `auth_header=''` 与 `NULL` **语义不同**：前者"未配置走兜底"，后者需 `keepOr` 区分"保留既有值"与"显式清空"
6. 迁移在全新库上零错误；`auth_type` 及其 CHECK 不被改动

## 遗留（本任务不做，另开）
1. **production catalog Go 代码未改**：模型中心暂时无法编辑平台渠道的这两列
   （`catalog.Channel`/`ChannelPatch`/`postgres.go` 的 SELECT/UPDATE 与 `model.go` 校验）。
   注意：**运行时功能路径已完成** —— 网关取凭据走 workspace reveal，与 production 无关。
2. **BFF `channelProbe` 的 switch 缺 `token` 分支**（`services/web-bff/cmd/server/main.go:222-229`）：
   既有缺陷，token 渠道探测时不带占位头。建议顺手改为读 `authHeader`/`authPrefix`。
