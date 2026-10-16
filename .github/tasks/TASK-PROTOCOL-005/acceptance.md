# TASK-PROTOCOL-005 需求验收清单

> 用法：开工前产出，开发完成后逐项自检勾对（AC-004/005）。

## 任务信息

- 任务名称：注册表补 openai_video canonical 定义（修复漂移）
- 关联需求/任务卡：TASK-PROTOCOL-005（来源：TASK-PROTOCOL-004 快照自证检出漂移）
- 开发者（AI）：AI Agent（会话 m_0cwRd4Q1hew）
- 开工日期：2026-10-17
- 目标一句话：注册表补齐 openai_video 定义（canonical 兜底），audit 漂移归零

## 一、需求点 → 可验证判据

| # | 需求点（用户原话/文档） | 验收判据（可客观验证） | 判据四要素备注 | 自检结果 |
|---|---|---|---|---|
| 1 | canonical 定义 | 注册表含 openai_video；type=video、path=/v1/videos/generations、async 完整（timeout 1440/poll 15） | 单测断言 | ✅ 过 |
| 2 | 兜底行为 | MergeTemplates 在 DB 缺行时返回注册表定义（含 timeoutMinutes） | 单测断言 | ✅ 过 |
| 3 | audit 归零 | 快照自证 db-only 空、both=9、无词表违规 | 单测断言 | ✅ 过 |
| 4 | capabilities 同源 | text-to-video + image-to-video（061 枚举内） | 单测断言 | ✅ 过 |
| 5 | 既有定义不受影响 | ProtocolAsync omitempty 不改变其它模板输出（既有测试全绿） | test -race | ✅ 过 |
| 6 | 门禁 | production build/test -race/vet/gofmt + file-size + 台账三方一致 | 命令执行 | ✅ 过 |

## 二、设计稿逐点映射（非 UI 任务，无设计稿）

**本任务为后端注册表 + 测试，不涉及 UI（AC-009 不适用）。**

## 三、三态与边界

| # | 场景 | 预期 | 自检结果 |
|---|---|---|---|
| 1 | DB 有 openai_video 行 | MergeTemplates 返回 DB 行（优先） | ✅ 过 |
| 2 | DB 无 openai_video 行 | 注册表兜底返回（含完整 async） | ✅ 过 |
| 3 | 既有模板 async 无 timeout | omitempty 不输出新字段 | ✅ 过 |
| 4 | audit 漂移演示 | 用不存在的 id 演示检出（openai_video 已归位） | ✅ 过 |

## 四、反模式自查（命中即改，引用规则编号）

| # | 反模式检查 | 命中？ | 处理 |
|---|---|---|---|
| 1 | 造 mock / 填推测数据（无依据不填） | ☐ 否 | 定义 = 061 迁移实证的 DB 行形态复制 |
| 2 | 修改已执行迁移 | ☐ 否 | 本卡无迁移 |
| 3 | 破坏既有定义输出 | ☐ 否 | omitempty + 全量测试验证 |
| 4 | 文件超 500 行（BE-SIZE-001） | ☐ 否 | |
| 5 | 越界改 DB/契约/execution | ☐ 否 | 只改注册表 + 测试 + 台账 |

## 五、门禁与测试

| # | 检查 | 命令 | 结果 |
|---|---|---|---|
| 1 | production 门禁 | `cd services/production && go build ./... && go test ./... -race && go vet ./...` | ✅ 过 |
| 2 | 台账门禁 | `bash .github/scripts/check-task-ledger.sh` | ✅ 过 |
| 3 | 文件行数 | `bash scripts/check-file-size.sh` | ✅ 过 |

## 六、PR 附勾对结果（提交 PR 时随 body 附上）

```markdown
## ✅ 验收勾对（acceptance-checklist）
- 需求点：6/6 通过（未过项：无）
- 三态与边界：4/4 通过
- 反模式自查：5/5 未命中
- 门禁：production 全绿 / 台账门禁通过
- 未过项及原因：（如实填写，不得隐瞒）
```
