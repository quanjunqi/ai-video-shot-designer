# TASK-SEC-003：auth_type 增加 `token`（无前缀 Authorization）

> 按 `AGENTS.md` §5.3 填写。为 A 线（AutoDL ComfyUI 接入）解锁前置条件。

## 目标

让网关能够调用要求 `Authorization: <Token>`（**不带 `Bearer ` 前缀**）的上游。

## 背景（外部文档 + 代码核实）

AutoDL 的 ComfyUI 工作流 API 文档示例为：
`headers = {"Authorization": "<Token>", "Content-Type": "application/json"}`
即**裸 Token、无前缀**。

而 `services/execution/internal/engine/engine.go` 原先在**三处**（提交 / 异步提交 / 轮询）
硬编码 `"Bearer "+creds.APIKey`，只有 `auth_type` 为 `none/""` 时不写该头 —— **裸 Token 无法表达**。

同时 `auth_type` 在库中有 CHECK 约束，只允许 `bearer/apikey/sign/none`，
因此即使代码支持了，用户也**存不进去**。

## 范围

- ✅ engine：三处鉴权统一走新的 `applyAuth`，新增 `token`（无前缀）
- ✅ `workspace/005_auth_type_token.sql`：放宽 `channel_credentials` 与 `user_channels` 的 CHECK
- ✅ `production/024_auth_type_token.sql`：放宽 `model_channels` 的 CHECK（与上对齐）
- ✅ 单测覆盖 6 种 auth_type
- ✅ CHANGELOG + 任务卡

## 非范围

- ❌ 不改 `bearer/apikey/sign` 的既有行为（**default 仍是 Bearer**，避免静默变更）
- ❌ 不做"自定义 header 名/前缀"的通用机制（YAGNI；真有第二个形态再加）
- ❌ 不播种 AutoDL 的协议模板（属 A 线，需确认 workflow_id 与入参）

## 验收标准

1. `auth_type=token` → `Authorization: <key>`（无前缀）
2. `auth_type=bearer/apikey/sign` → `Authorization: Bearer <key>`（**与改动前一致**）
3. `auth_type=none` 或空 → 不写 Authorization 头
4. `workspace` / `production` 全量迁移在全新库上零错误
5. `user_channels` 与 `model_channels` 均接受 `'token'`，非法值仍被拒

## 测试命令

```bash
cd services/execution && go test ./internal/engine/ -run ApplyAuth -v
# 真库验证（与既有习惯一致）
docker run --rm -d --name mdpauth -e POSTGRES_PASSWORD=test -e POSTGRES_DB=workspace postgres:16-alpine
for f in services/workspace/migrations/*.sql; do docker exec -i mdpauth psql -U postgres -d workspace -v ON_ERROR_STOP=1 -q < "$f"; done
docker exec -i mdpauth psql -U postgres -d workspace -c "INSERT INTO user_channels (...) VALUES (...,'token',...)";  # 应成功
docker rm -f mdpauth
```

## 风险说明

放宽 CHECK 只增不减，既有数据不受影响；engine 的 default 分支保持 Bearer，
因此 `apikey`/`sign` 渠道行为不变。

## 附：A 线后续（本任务解锁后）

1. 确认 AutoDL 的 `workflow_id` 与目标工作流入参字段
2. 播种一条内置 `protocol_templates`（`async` 用 `statusField=data.status`、
   `doneValue=SUCCESS`、`failValue=FAILED`、`pollPath=…/result/{task_id}`）
3. ⚠️ **仍需决策**：生成产物必须在任务成功时落盘到我们自己的对象存储
   （上游 URL 有效期短）。生产对象存储已确认是 MinIO —— 因此"落盘"是**必需项**，
   否则画布节点引用的是必然失效的 URL。方案二选一：
   (a) execution 成功后直接把结果写入 asset 服务；(b) 前端下载后经 asset 上传。
