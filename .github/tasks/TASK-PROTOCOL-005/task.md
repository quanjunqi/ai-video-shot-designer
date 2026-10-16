---
taskId: TASK-PROTOCOL-005
status: 进行中
priority: P1（协议层治理收口——修复 TASK-PROTOCOL-004 检出的漂移）
pr: "#<待开>"
criteria: 6
criteriaPassed: 0
depends_on: TASK-PROTOCOL-004（其快照自证检出 openai_video 漂移；本卡修复）
---

# TASK-PROTOCOL-005：注册表补 openai_video canonical 定义（修复漂移）

> **来源**：TASK-PROTOCOL-004 快照自证检出 `pt_builtin_openai_video` 只在 DB、不在注册表（漂移）。
> **修复方式**：注册表补 canonical 定义（MergeTemplates 语义不变——DB 行优先，注册表兜底），
> 无需迁移（DB 行已存在）。

## 目标

一句话：**注册表补齐 pt_builtin_openai_video 定义（canonical 兜底），
使协议定义三方一致（audit db-only 归零），DB 行被删时注册表兜底不丢定义。**

## 探查结论（MergeTemplates 语义）

- `MergeTemplates`：① DB 行优先（允许管理员覆盖）② 注册表补 DB 缺失 id ③ 非内置自定义保留 ④ 按 id 排序。
- openai_video 的 DB 行已存在 ⇒ 实际可用；**漂移影响 = 缺 canonical 兜底**（DB 行被删即丢，且定义唯一来源在 DB）。
- `ProtocolAsync` struct 原只有 6 字段（缺 timeoutMinutes/pollIntervalSeconds）⇒ 需补（omitempty，不破坏既有定义）。
- async 由 `json.RawMessage` 透传（catalog 不强类型消费；轮询配置由 execution 消费）⇒ 兜底定义必须完整复制 DB 行。

## 设计决策

| 编号 | 主题 | 选择 | 理由 |
|---|---|---|---|
| D-001 | 修复方式 | 注册表补定义（非迁移/非删行） | DB 行已存在且优先；注册表 = canonical 兜底；audit db-only 归零 |
| D-002 | async 完整性 | ProtocolAsync 补 TimeoutMinutes/PollIntervalSeconds（omitempty） | 兜底定义完整（DB 缺行时轮询行为不退化）；不影响既有定义输出 |
| D-003 | capabilities 来源 | 常量 openaiVideoCapabilities（复制 DB 行，061 同源） | 与其它 builtin 常量同风格；词表同源原则 |
| D-004 | 自证口径 | audit 快照断言漂移归零（db-only 空、both=9）+ catalog 兜底测试 | 修完必须有门禁证明「不再漂移」且「兜底可用」 |

## 范围

### 本期
1. `services/production/internal/catalog/protocol_registry.go`：
   - ProtocolAsync 补 timeoutMinutes/pollIntervalSeconds（omitempty）
   - 注册表加 pt_builtin_openai_video 定义（完整 async + capabilities 常量 + 来源注释）
2. `protocol_registry_openai_video_test.go`（新）：2 单测（canonical 定义完整 / MergeTemplates 兜底行为）
3. `internal/protocolaudit/audit_test.go`：registryIDs 加 openai_video；快照自证断言漂移归零（db-only 空、both=9）；漂移检出演示换假 id
4. `testdata/protocol_templates_snapshot.json`：note 更新（漂移已修复）
5. 台账 TASK-PROTOCOL-005 登记

### 非范围
- ❌ 不改 DB 行（行已存在且正确——061 写入的 canonical 形态）
- ❌ 不加迁移（注册表定义不需要迁移）
- ❌ 不改 execution / 契约 / 前端

## 验收标准

1. **canonical 定义**：注册表含 openai_video；type=video、path=/v1/videos/generations、async 完整（timeout 1440/poll 15）
2. **兜底行为**：MergeTemplates 在 DB 缺 openai_video 行时返回注册表定义（含 timeoutMinutes）
3. **audit 归零**：快照自证 db-only 为空、both=9、无词表违规
4. **capabilities 同源**：text-to-video + image-to-video（061 枚举内）
5. **既有定义不受影响**：ProtocolAsync omitempty 不改变其它模板输出（既有测试全绿）
6. **门禁全绿**：production build/test -race/vet/gofmt + file-size + 台账三方一致

## 测试命令

```bash
cd services/production && go build ./... && go test ./... -race && go vet ./...
bash scripts/check-file-size.sh
bash .github/scripts/check-task-ledger.sh
```
