# TASK-FIX-003：协议模板补齐 `pollPath`（异步轮询路径）

## 目标

让协议模板 UI 能配置异步轮询路径，并阻止"漏配导致静默失败"。

## 背景（实测发现的真实缺口）

| 证据 | 结果 |
|---|---|
| `SettingsProtocols.tsx` 中 `statusField`/`doneValue`/`failValue`/`taskIdField` | 各出现 **5** 次（可编辑） |
| 同一文件 `pollPath` | **0** 次（**UI 根本配不了**） |
| `pt_builtin_jimeng_video` 的 `async` | **没有 `pollPath`** |
| 引擎 `engine.go` 兜底行为 | `if async.PollPath == "" { async.PollPath = "/v1/images/tasks/{task_id}" }` |

⇒ 因为 UI 配不了 `pollPath`，播种内置模板时无从声明；引擎于是退化到**硬编码的**
`/v1/images/tasks/{task_id}` —— 对 PearAPI 实测应为 `GET /v1/video/generations/{task_id}`
（**提交用复数 `videos`、查询用单数 `video`**，不对称）。表现为视频异步任务全部轮询失败。

另修正一处**与实现不符的注释**：`model-catalog.ts` 原写"未声明时执行器按提交端点兜底轮询"，
实际是硬编码默认值 —— 这种注释会让人对真实行为产生错误预期。

## 范围

- ✅ `SettingsProtocols.tsx`：异步区新增「轮询路径（必填）」全宽字段
- ✅ 保存校验：`async.enabled` 时 `pollPath` 必填，且**必须含 `{task_id}` 占位符**
- ✅ `ProtocolPreview.tsx`：展示轮询地址；未声明时**显式红色报警**
- ✅ `client.ts` 3 处与 `ProtocolAsync` 类型同步（`pollPath?: string`，保持向后兼容）
- ✅ 修正 `model-catalog.ts` 的失实注释
- ✅ 任务卡 + CHANGELOG

## 非范围

- ❌ 不改引擎的兜底逻辑（保持向后兼容；是否改为"报错而非静默兜底"另议）
- ❌ 不修 `pt_builtin_jimeng_video` 的数据（属 PearAPI 接入任务）

## 验收标准

1. 异步区可编辑 `pollPath`
2. 启用异步但 `pollPath` 为空 → 保存被拒并给出明确提示
3. `pollPath` 不含 `{task_id}` → 保存被拒（否则 ReplaceAll 后 URL 不含任务 ID，必然轮询错）
4. 预览区显示轮询地址；未声明时有醒目的红色提示
5. `pollPath` 为可选字段 → 既有模板与调用方**不受影响**（typecheck 通过）
6. `npm run gate` 通过

## 测试命令

```bash
cd apps/web && npm run gate
```

## 约束

- 不得把 `pollPath` 改成必填而破坏既有数据（它天然可选）
