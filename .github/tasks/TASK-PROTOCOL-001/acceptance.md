# TASK-PROTOCOL-001 需求验收清单

> 用法：开工前产出，开发完成后逐项自检勾对（AC-004/005）。

---

## 任务信息

- 任务名称：requestTemplate 数据迁移（等价可迁移子集回填 + 判别标准固化）
- 关联需求/任务卡：TASK-PROTOCOL-001（来源：VOZEB requestTemplate 形态差距 + ADR-007 D3）
- 开发者（AI）：AI Agent（会话 m_0cwRd4Q1hew）
- 开工日期：2026-10-16
- 目标一句话：把 request_template 落到等价可迁移子集（comfyui）已生效，并把「哪些能安全模板化、哪些不能、为什么」的判别标准固化进迁移注释与 ADR-007 D3

---

## 一、需求点 → 可验证判据

| # | 需求点（用户原话/文档） | 验收判据（可客观验证） | 判据四要素备注 | 自检结果 |
|---|---|---|---|---|
| 1 | 迁移 065 合规 | 迁移文件存在；号段 060-069 内；只 UPDATE request_template 一列（幂等）；未改任何已执行迁移；注释含 8 协议可行性表 + 判别标准 | 判据：文件内容；对象：services/production/migrations/065_*.sql | ✅ 过 |
| 2 | comfyui 模板生效 | 迁移应用后 `SELECT request_template` = `{"client_id":"{{client_id}}"}`；`MergeTemplates` DB 行优先（withSource=db） | 真库 SELECT + 单测 | ✅ 过 |
| 3 | 等价性金标准 | `TestRequestTemplateEquivalenceBuiltinComfyUI`：legacy params[] vs 模板形态，同步/异步两入口 + 默认/模型级覆盖/__key 覆盖/__passthrough 场景，json.Unmarshal 后 DeepEqual | 单测通过 | ✅ 过 |
| 4 | 判别标准文档化 | ADR-007 D3 状态从「建议方向」更新为「已落地等价子集 + 判别标准 + openai 禁止回填原因链」 | 文件 diff | ✅ 过 |
| 5 | 真库验证 | 本地 production 库迁移到 065；request_template 列实测非空 | docker exec psql | ✅ 过 |
| 6 | 门禁 | production + execution `go build/test -race/vet` 全绿；gofmt 干净；check-file-size 0 超标；台账三方一致 | 命令执行 | ✅ 过 |

## 二、设计稿逐点映射（非 UI 任务，无设计稿）

**本任务为迁移 + 测试 + 文档，不涉及 UI（AC-009 不适用）。**

## 三、三态与边界

| # | 场景 | 预期 | 自检结果 |
|---|---|---|---|
| 1 | 迁移重复应用 | UPDATE 幂等，request_template 值不变 | ✅ 过 |
| 2 | openai 回填 | **明确禁止**（判别标准第一条反例，防误回填） | ✅ 过 |
| 3 | 空 params 协议 | 不回填（无增益，防形式主义） | ✅ 过 |
| 4 | 模板缺失占位符 | 已有渲染器响亮报错（既有行为，本卡不动） | ✅ 过 |

## 四、反模式自查（命中即改，引用规则编号）

| # | 反模式检查 | 命中？ | 处理 |
|---|---|---|---|
| 1 | 后端吞错 `_ = f()`（BE-ERR-001） | ☐ 否 | |
| 2 | SQL 拼接（BE-PGX-001 / SEC-001） | ☐ 否 | |
| 3 | 修改已执行迁移 / 字母后缀编号 | ☐ 否 | |
| 4 | 日志打 Key（SEC-005 / BE-LOG-002） | ☐ 否 | |
| 5 | 文件超 500 行（BE-SIZE-001） | ☐ 否 | |
| 6 | 无测试回填（BE-TEST） | ☐ 否 | |

## 五、门禁与测试

| # | 检查 | 命令 | 结果 |
|---|---|---|---|
| 1 | execution 等价性 | `cd services/execution && go test ./internal/engine/ -run TestRequestTemplateEquivalenceBuiltinComfyUI -v` | ✅ 过 |
| 2 | production 门禁 | `cd services/production && go build ./... && go test ./... -race && go vet ./...` | ✅ 过 |
| 3 | execution 门禁 | `cd services/execution && go build ./... && go test ./... -race && go vet ./...` | ✅ 过 |
| 4 | 台账门禁 | `bash .github/scripts/check-task-ledger.sh` | ✅ 过 |

## 六、PR 附勾对结果（提交 PR 时随 body 附上）

```markdown
## ✅ 验收勾对（acceptance-checklist）
- 需求点：6/6 通过（未过项：无）
- 三态与边界：4/4 通过
- 反模式自查：6/6 未命中
- 门禁：production + execution 全绿 / 台账门禁通过
- 未过项及原因：（如实填写，不得隐瞒）
```
