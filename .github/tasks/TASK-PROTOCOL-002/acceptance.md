# TASK-PROTOCOL-002 需求验收清单

> 用法：开工前产出，开发完成后逐项自检勾对（AC-004/005）。

---

## 任务信息

- 任务名称：协议模板 capabilities 补齐（服务 MODEL-006 判据 4）
- 关联需求/任务卡：TASK-PROTOCOL-002（来源：MODEL-006 判据 4「能力声明覆盖」）
- 开发者（AI）：AI Agent（会话 m_0cwRd4Q1hew）
- 开工日期：2026-10-17
- 目标一句话：5 个可静态声明能力的协议模板具备能力声明（能力键与 061 同源），comfyui 例外文档化 → 判据 4 达成（8/9）

## 一、需求点 → 可验证判据

| # | 需求点（用户原话/文档） | 验收判据（可客观验证） | 判据四要素备注 | 自检结果 |
|---|---|---|---|---|
| 1 | 迁移 066 合规 | 迁移文件存在；号段 060-069 内；只 UPDATE capabilities 一列（幂等）；未改任何已执行迁移；注释含 6 模板裁定表 | 文件内容 | ✅ 过 |
| 2 | 5 个模板能力声明生效 | 真库 `SELECT id, jsonb_object_keys(capabilities)`：grsai/minimax_text→text-chat；jimeng_image→text-to-image,image-to-image；jimeng_video/minimax_video→text-to-video,image-to-video | 真库 SELECT | ✅ 过 |
| 3 | 能力键同源 | 所有新键 ∈ {text-chat, text-to-image, image-to-image, text-to-video, image-to-video}（061 枚举） | 断言/查询 | ✅ 过 |
| 4 | comfyui 例外留痕 | 迁移注释 + PR body 说明「工作流自定义无法静态声明，判据 4 口径 8/9」 | diff + PR | ✅ 过 |
| 5 | 真库验证 | 迁移应用后 `SELECT count(*) FILTER (WHERE capabilities<>'{}')||'/'||count(*)` → 8/9 | 真库 SELECT | ✅ 过 |
| 6 | 门禁 | production build/test -race/vet/gofmt + file-size + 台账三方一致 | 命令执行 | ✅ 过 |

## 二、设计稿逐点映射（非 UI 任务，无设计稿）

**本任务为迁移 + 数据回填 + 验证，不涉及 UI（AC-009 不适用）。**

## 三、三态与边界

| # | 场景 | 预期 | 自检结果 |
|---|---|---|---|
| 1 | 迁移重复应用 | UPDATE 幂等，capabilities 值不变 | ✅ 过 |
| 2 | comfyui | 例外不填（工作流自定义）；判据 4 口径 8/9 已在注释/PR 说明 | ✅ 过 |
| 3 | param_mapping 缺失 | 映射引擎 NewEngine 空 JSON 不报错；走默认 __passthrough（mapping/engine.go 实证） | ✅ 过 |
| 4 | 能力键与 061 不一致 | 无——同源断言保证（D-001） | ✅ 过 |

## 四、反模式自查（命中即改，引用规则编号）

| # | 反模式检查 | 命中？ | 处理 |
|---|---|---|---|
| 1 | 造第二份 mock / 填推测数据（MODEL-006 约束） | ☐ 否 | param_mapping 省略（D-002） |
| 2 | 修改已执行迁移 / 字母后缀编号 | ☐ 否 | |
| 3 | SQL 拼接（BE-PGX-001 / SEC-001） | ☐ 否 | |
| 4 | 日志打 Key（SEC-005 / BE-LOG-002） | ☐ 否 | |
| 5 | 文件超 500 行（BE-SIZE-001） | ☐ 否 | |

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
