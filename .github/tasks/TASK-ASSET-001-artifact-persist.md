# 任务卡：TASK-ASSET-001 — execution 产物落盘 MinIO（第一刀）

> 模板：`.github/TASK_TEMPLATE.md`。本卡随 PR 提交。

## 基本信息

- **任务 ID**：TASK-ASSET-001
- **任务名称**：execution 产物落盘 MinIO（第一刀）
- **创建日期**：2026-10-11
- **人类 Owner**：quanjunqi
- **优先级**：P0（ROADMAP #3，明确"建议提前做"）
- **预计工时**：90 分钟

---

## 1. 目标

任务成功且上游返回产物 URL 时，execution 将 URL 转存到 asset（MinIO），把 `asset_id` / `object_key` / `asset_url` 写回响应，让产物地址不再依赖上游临时 URL（可灵 30 天清理、Vidu 24 小时过期）。

**背景**：ROADMAP #3。当前 `/internal/v1/generate` 同步分支成功后直接返回 `out.Extracted`（上游 URL），无落盘。asset 服务已有上传会话三接口（create/put/commit），但 execution 无客户端。

---

## 2. 范围

### 范围内（In Scope）

- 新增 `services/execution/internal/artifact` 包：
  - `extract.go`：从 `RunResult.Extracted` 按约定键（`image_url` / `video_url` / `url` / `result`）提取产物 URL
  - `client.go`：asset 转存客户端（create upload → 下载上游 URL → put content → commit），含 **SSRF 防护**（仅 http/https，拒绝内网/元数据地址）与下载大小上限
- `handler.go` generate 同步成功路径：提取 → 转存（**best-effort，失败不阻塞生成**）→ 响应加 `artifact` 字段（`asset_id` / `object_key` / `asset_url` / `byte_size`）
- asset 新增最小读取端点 `GET /internal/v1/assets/{id}/content`（从 MinIO 读字节），使 `asset_url` 可访问
- 配置：execution 新增 `ASSET_BASE_URL` / `ASSET_INTERNAL_TOKEN`
- 单测：提取 / SSRF 拒绝 / 转存成功与失败 / 下载超限；asset 读取端点测试

### 范围外（Out of Scope）

- 前端改用 asset 地址展示（下一刀）
- 媒体扫描 / 缩略图 / 转码（ROADMAP #5）
- 个人素材 scope（ADR-006 D4）
- schema 迁移（本刀零迁移：`result_payload` 已是 JSONB、asset 表已存在）
- 补齐所有协议模板的 URL 字段标注（本刀用约定键浅层提取）
- 异步 job 路径的落盘（worker 未接真实执行，同步路径先行）

---

## 3. 相关文件

- `services/execution/internal/artifact/extract.go` — 新增
- `services/execution/internal/artifact/client.go` — 新增
- `services/execution/internal/artifact/client_test.go` — 新增
- `services/execution/internal/httpapi/handler.go` — generate 成功路径 + Handler.Artifacts 字段
- `services/execution/cmd/server/main.go` — 组装与配置注入
- `services/asset/internal/asset/store.go` — `GetContent` 方法
- `services/asset/internal/httpapi/handler.go` — `GET /assets/{id}/content` 端点
- `.env.example` — execution 段加 `ASSET_BASE_URL` / `ASSET_INTERNAL_TOKEN`
- `docs/reference/environment.md` — 同步新环境变量
- `.github/tasks/TASK-ASSET-001-artifact-persist.md` — 本卡

---

## 4. 验收标准

- [ ] **AS1 落盘成功**：上游返回含 `image_url`/`video_url` 的产物 → 响应含 `artifact.asset_id` + `object_key` + `asset_url`，asset 表新增一行（MinIO 有对象）
- [ ] **AS2 无 URL**：上游无产物 URL → 任务仍成功，响应无 `artifact` 字段，审计记录原因
- [ ] **AS3 转存失败**：asset 不可达 / 下载失败 → 任务仍成功（落盘失败不阻塞生成），审计记录转存失败
- [ ] **AS4 可访问**：`asset_url`（`GET /assets/{id}/content`）返回落盘字节，Content-Type 正确
- [ ] **AS5 测试**：`go test ./... -race` 全绿；单测覆盖 提取 / SSRF 拒绝 / 转存成功与失败 / 下载超限 / 读取端点

---

## 5. 测试命令

```bash
cd services/execution && go test ./... -race
cd services/asset && go test ./... -race
go vet ./...
```

---

## 6. 约束与禁止事项

- [x] 服务边界：execution 只调 asset 内部 API，不跨库读写
- [x] **SSRF 防护**：转存目标仅限上游返回的 `http(s)` URL，禁止内网/元数据地址（对齐 TASK-SEC-001）
- [x] 落盘失败不得导致任务失败（生成是主流程，落盘是增强）
- [x] 不修改已执行迁移；密钥不硬编码（token 走环境变量）

---

## 7. 风险与依赖

- 依赖：asset 内部 API 已存在 ✓；asset 服务可被 execution 访问（同 Compose 网络）
- 风险：上游 URL 下载超时/超大 → 下载上限 + context 超时兜底
- 回滚：新增代码独立包，移除 `artifact` 注入即可回退，无迁移

---

## 8. 输出物

- 分支：`feature/asset-persist-1011`（worktree `.worktrees/asset-persist`）
- PR 链接：待开
- 测试结果：待填
