# 任务卡：Phase 2.1 — 统一 Executor 接口定义

## 基本信息

- **任务 ID**：TASK-P2-001
- **任务名称**：统一 Executor 接口定义与 API Connector 适配
- **创建日期**：2026-10-10
- **人类 Owner**：项目 Owner
- **AI 执行者**：AI Agent
- **优先级**：P1
- **预计工时**：60 分钟

---

## 1. 目标

定义统一的 Executor 接口，支持三类后端（API Connector / ComfyUI Agent / Cloud Runner），并将现有的 HTTP API 实现适配为 API Connector。

**背景**：当前 execution 服务的 engine.go 直接实现了 HTTP 调用，缺少抽象层。未来需要支持 ComfyUI（本地/云端），必须先定义统一接口。

---

## 2. 范围

### 范围内

- 定义 `Executor` 接口（Submit / Poll / Cancel / GetResult）
- 定义 `ExecutorRequest` 和 `ExecutorResult` 结构体
- 将现有 `engine.Run` / `engine.RunAsync` 封装为 `APIConnector` 实现
- 定义 `ExecutorType` 枚举（api / comfyui-local / comfyui-cloud）
- 定义 `ExecutorFactory`，根据渠道类型创建对应执行器

### 范围外

- ComfyUI Agent 具体实现（Phase 2.2）
- Cloud Runner 具体实现（Phase 2.3）
- 多渠道负载均衡（Phase 4）
- 限流配额（Phase 3）

---

## 3. 相关文件

- `services/execution/internal/engine/executor.go` — 新增，接口定义
- `services/execution/internal/engine/api_connector.go` — 新增，API Connector 实现
- `services/execution/internal/engine/engine.go` — 修改，保留现有函数但标记为 deprecated
- `services/execution/internal/engine/engine_test.go` — 新增，接口测试

---

## 4. 验收标准

- [ ] Executor 接口定义完整，包含 Submit/Poll/Cancel/GetResult 方法
- [ ] APIConnector 实现接口，功能与现有 engine.Run/RunAsync 一致
- [ ] ExecutorFactory 能根据渠道类型创建对应执行器
- [ ] 现有调用方无需修改（保持向后兼容）
- [ ] 单元测试通过：`go test ./internal/engine/...`
- [ ] 编译通过：`go build ./...`
- [ ] 无编译错误

---

## 5. 测试命令

```bash
cd services/execution
go build ./...
go test ./internal/engine/... -v
go vet ./...
```

---

## 6. 约束与禁止事项

### 必须遵守

- [ ] 遵循 `AGENTS.md` 编码规范
- [ ] 保持向后兼容，现有 engine.Run / engine.RunAsync 继续可用
- [ ] 接口设计考虑三类执行器的共性和差异
- [ ] 异步任务状态机清晰：queued → running → succeeded/failed/cancelled

### 禁止操作

- [ ] 禁止直接 push master
- [ ] 禁止修改已执行的迁移文件
- [ ] 禁止破坏现有功能
- [ ] 禁止硬编码参数映射

---

## 7. 风险与依赖

### 依赖项

- 现有 engine.go 的 Run / RunAsync 实现

### 潜在风险

- 接口定义不完善，后续需要修改（可接受，迭代式设计）
- 现有调用方较多，适配时可能遗漏

### 回滚方案

- 保留现有 engine.Run / engine.RunAsync，新接口并行存在
- 如出现问题，回退到直接调用 engine.Run

---

## 8. 输出物

- [ ] 分支：`feature/executor-interface-1010`
- [ ] PR 链接：
- [ ] 测试结果：
- [ ] 文档更新：`docs/architecture/00-technical-architecture.md` 执行器章节
