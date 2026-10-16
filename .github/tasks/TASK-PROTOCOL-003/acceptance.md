# TASK-PROTOCOL-003 需求验收清单

> 用法：开工前产出，开发完成后逐项自检勾对（AC-004/005）。

---

## 任务信息

- 任务名称：协议模板生成器（OpenAPI 规范 → 协议定义，确定性生成）
- 关联需求/任务卡：TASK-PROTOCOL-003（来源：VOZEB 对比三件套之三）
- 开发者（AI）：AI Agent（会话 m_0cwRd4Q1hew）
- 开工日期：2026-10-17
- 目标一句话：OpenAPI 3.x → ProtocolTemplate 确定性生成器，用 OpenAI 官方规范独立验证 openai/openai_img 手写定义

## 一、需求点 → 可验证判据

| # | 需求点（用户原话/文档） | 验收判据（可客观验证） | 判据四要素备注 | 自检结果 |
|---|---|---|---|---|
| 1 | 解析确定性 | Parse 支持 $ref（文件内）/ allOf 合并 / oneOf 取首含 properties 分支；同输入两次输出一致 | 单测 | ✅ 过 |
| 2 | fixture 独立来源 | openai_fixture.json 头部含来源注释（官方仓库 URL + 版本 + 拉取日期） | 文件内容 | ✅ 过 |
| 3 | chat 断言 | Generate(chat) → RequestPath=/v1/chat/completions；params 键集 ⊇ 注册表 pt_builtin_openai 键集 | 单测断言 | ✅ 过 |
| 4 | images 断言 | Generate(images) → RequestPath=/v1/images/generations；params 键集 ⊇ openai_img 键集（model/prompt/n/size/quality/response_format） | 单测断言 | ✅ 过 |
| 5 | 非生成边界 | 输出不含 capabilities/param_mapping 推测值；含「待审查」标记 | 单测/审查 | ✅ 过 |
| 6 | 门禁 + SOP | production build/test -race/vet/gofmt + file-size + 台账 + docs/how-to/protocol-onboarding.md 存在 | 命令 + 文件 | ✅ 过 |

## 二、设计稿逐点映射（非 UI 任务，无设计稿）

**本任务为后端工具 + 单测 + 文档，不涉及 UI（AC-009 不适用）。**

## 三、三态与边界

| # | 场景 | 预期 | 自检结果 |
|---|---|---|---|
| 1 | 非法 OpenAPI（非 3.x / 无 paths） | Parse 返回错误（不 panic） | ✅ 过 |
| 2 | 跨文件 $ref | 报错（明确不支持） | ✅ 过 |
| 3 | 响应 oneOf 多分支 | 取第一个含 properties 的分支，不 panic | ✅ 过 |
| 4 | 深层响应嵌套 | response_extract 只推导顶层+数组一层；更深标注待审查 | ✅ 过 |

## 四、反模式自查（命中即改，引用规则编号）

| # | 反模式检查 | 命中？ | 处理 |
|---|---|---|---|
| 1 | 造 mock / 填推测数据（无依据不填） | ☐ 否 | capabilities/param_mapping 不生成（D-005） |
| 2 | 引入未必要的大依赖 | ☐ 否 | 零依赖解析（D-001） |
| 3 | SQL 拼接（BE-PGX-001 / SEC-001） | ☐ 否 | 本卡无 SQL |
| 4 | 日志打 Key（SEC-005 / BE-LOG-002） | ☐ 否 | |
| 5 | 文件超 500 行（BE-SIZE-001） | ☐ 否 | 按域拆文件 |

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
