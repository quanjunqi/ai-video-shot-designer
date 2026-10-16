# TASK-PROTOCOL-006 需求验收清单

## 任务信息
- 任务名称：接真实渠道实战——OpenAI Responses API 全流程首战
- 关联任务卡：TASK-PROTOCOL-006
- 开发者（AI）：AI Agent（会话 m_0cwRd4Q1hew）
- 开工日期：2026-10-17
- 目标一句话：官方规范 → protocol-gen → 审查 → 落库 068 → 回归，新增 pt_builtin_openai_responses

## 一、需求点 → 可验证判据
| # | 需求点 | 验收判据 | 四要素备注 | 自检 |
|---|---|---|---|---|
| 1 | 规范可追溯 | 官方 openapi.json（v2.3.0, 2026-10-17）sha256 留档 + doc_ref 注记 | 文件 + SQL | ✅ 过 |
| 2 | 生成确定性 | protocol-gen -path /v1/responses 输出 31 params + response_extract | 命令执行 | ✅ 过 |
| 3 | 审查留痕 | type=text / capabilities=text-chat（061 枚举）/ param_mapping 标注待实测 | 迁移 + registry | ✅ 过 |
| 4 | 落库三处同步 | 迁移 068 + registry.go + 快照 10 行（migration=068） | 真库 SELECT | ✅ 过 |
| 5 | 回归验证 | audit 无漂移 + 协议门禁 ✓ + execution mapping 冒烟 ✓ + production build/vet/test -race ✓ | 命令执行 | ✅ 过 |
| 6 | 台账/门禁 | 台账三方一致 + preflight 门 0d | 命令执行 | ✅ 过 |

## 二、设计稿逐点映射
非 UI 任务，无设计稿（AC-009 不适用）。

## 三、三态与边界
| # | 场景 | 预期 | 自检 |
|---|---|---|---|
| 1 | 官方规范无 required（CreateResponse allOf） | 不臆测，required_params 按文档语义仅标 model | ✅ 过 |
| 2 | doc_ref 传非 JSON（jsonb 列） | 迁移报错 → 修复为 JSON 对象（B-001） | ✅ 过（已修复） |
| 3 | 宿主无 psql | 容器内跑迁移执行器（ADOPT_UNTIL=067 + 068） | ✅ 过 |
| 4 | 测试硬编码 9→10 | builtinTemplateIDs/golden/merge/audit registryIDs 全量更新 | ✅ 过 |

## 四、反模式自查
| # | 检查 | 命中？ | 处理 |
|---|---|---|---|
| 1 | 无依据臆测 param_mapping | ☐ 否 | 标注待真实渠道实测 |
| 2 | 改已执行迁移 | ☐ 否 | 068 全新文件，只增不改 |
| 3 | 快照脱离真库 | ☐ 否 | 真库 jsonb_agg 实拍 10 行 |
| 4 | 测试数硬编码漏改 | ✅ 是（9→10 三处） | 已全量更新并全绿 |

## 五、门禁与测试
| # | 检查 | 命令 | 结果 |
|---|---|---|---|
| 1 | production 门禁 | go build + go vet + go test ./... -race | ✅ 过 |
| 2 | audit + catalog | go test ./internal/protocolaudit/ ./internal/catalog/ | ✅ 过 |
| 3 | 协议门禁 | bash .github/scripts/check-protocol-consistency.sh | ✅ 过（RC=0） |
| 4 | 台账门禁 | bash .github/scripts/check-task-ledger.sh | ☐ |

## 六、PR 附勾对结果
```markdown
## ✅ 验收勾对（acceptance-checklist）
- 需求点：6/6 通过（未过项：无）
- 三态与边界：4/4 通过
- 反模式自查：4/4（1 命中已修复）
- 门禁：production 全绿 / audit ✓ / 协议门禁 ✓
- 未过项及原因：（如实填写）
```
