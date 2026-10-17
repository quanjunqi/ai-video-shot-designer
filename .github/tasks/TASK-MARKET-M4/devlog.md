# TASK-MARKET-M4 开发日志

> 规则：AC-010。开工即建，随开发追加。

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [task.md](task.md) |
| 验收清单 | [acceptance.md](acceptance.md) |
| 分支 | feature/market-image-async-test-2026-10-17 |
| PR | #<n> |
| 开工 | 2026-10-17 23:55 |
| 开发者 | AI Agent |

## 执行轨迹

### 2026-10-17 23:55 开工/探查
- **动作**：定位 Boogu 试跑 async 拒绝根因。
- **证据**：handlers_run_model.go 试跑直调 engine.Run（sync，async.Enabled 拒绝）；engine.RunAsync（submit→poll→result，默认 task_id/status=SUCCESS/FAILED、pollPath=/v1/images/tasks/{task_id}、6 分钟轮询）已完整实现未被使用。
- **决策**：D-001 最小分流修复（async→RunAsync），不动引擎。

## 决策记录 D

| 编号 | 主题 | 选项 | 选择 | 理由 | 时机 |
|---|---|---|---|---|---|
| D-001 | 修复方式 | 引擎改 async 支持 vs 试跑分流 | 分流 | RunAsync 已完整，只缺调用点 | 开工 |

### 2026-10-18 00:05 开发/验证
- **动作**：handler 分流（async.Enabled → RunAsync）+ RunAsync 轮询单测 3 例（state machine/fail/disabled）+ 本地 stub 扩展 async 图片端点。
- **证据**：
  - 单测：`go test ./internal/engine/ -run TestRunAsync -v` 3 PASS；execution 全量 `go test ./... -race` 全绿；`go vet ./...` 通过。
  - 端到端（stub 渠道 chan_localstub）：同步 raw_count=3（新增 stub-image-0.1）→ 策展 m_stub_image（type=image）→ 绑 pt_builtin_openai_img → 试跑 `{"prompt":"一只橙色的猫"}` → **ok:true, status:200, providerTaskId=stub-img-1, extracted={"data.0.url":"https://stub.local/img.png"}**（submit 注入 task_type=async → 提取 id → poll running→completed → 提取 data.0.url）。
  - 回归：m_stub_text 试跑仍 ok:true（sync 路径不变）。
- **踩坑**：①netguard 拦截 127.0.0.1 → 需 `EXECUTION_ALLOW_PRIVATE_UPSTREAM=1` 重启 execution；②DB 模板终态枚举 doneValue=completed（OpenAI Images 标准）非 SUCCESS → stub 对齐为 completed；③模板 responseParams 提取 `data.0.url` → stub 返回结构对齐 OpenAI `data:[{url}]`。
- **决策**：D-002 stub 对齐 OpenAI 标准（id/completed/data.0.url），不动模板（模板即契约）。

## 纪律自检

- [x] 日志随开发同步记录（非一次性补写）
- [x] 先本地验证再提交（单测+全量+端到端+回归）
- [x] 未改用户未要求范围（仅 handler 分流 + 测试 + stub）
