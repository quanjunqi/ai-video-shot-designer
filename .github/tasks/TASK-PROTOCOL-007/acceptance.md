# TASK-PROTOCOL-007 需求验收清单

## 任务信息
- 任务名称：修复 openai_responses 参数落库形状（B-002）
- 关联任务卡：TASK-PROTOCOL-007
- 开工日期：2026-10-17

## 需求点 → 可验证判据
| # | 需求点 | 验收判据 | 自检 |
|---|---|---|---|
| 1 | DB params/response_params 为数组 | jsonb_typeof=array、长度 32/37（真库 SELECT） | ✅ 过 |
| 2 | 生成可追溯 | protocol-gen 从官方 openapi.json 确定性生成（临时 cmd 留档逻辑） | ✅ 过 |
| 3 | registry 同步 | protocol_registry.go Params 32/ResponseParams 37（与 DB 一致） | ✅ 过 |
| 4 | 测试基线 | golden params/responseParams 更新，catalog 全绿 | ✅ 过 |
| 5 | 回归验证 | production build/vet/test -race 全绿 + 协议门禁 ✓ + 快照 069 | ✅ 过 |
| 6 | 页面可见 | 前端 /settings/channels/protocols 显示「全部10 + Responses 卡片 32/37」 | ✅ 过 |

## 三态与边界
| # | 场景 | 预期 | 自检 |
|---|---|---|---|
| 1 | jsonb 数组字面量语法 | 需 $$ 美元引号包裹（裸数组非法 SQL） | ✅ 过 |
| 2 | desc 含反引号/换行 | golden/registry 转义处理（Go 原始字符串与 JSON 转义） | ✅ 过 |
| 3 | 误改已执行迁移 | 068 不动，新增 069 UPDATE | ✅ 过 |

## 反模式自查
- 无依据臆测参数：❌ 否（全部来自官方规范确定性生成）
- 修改已执行迁移：❌ 否（069 新文件）
- 快照脱离真库：❌ 否（migration=069 真库重拍）

## 门禁与测试
| 检查 | 命令 | 结果 |
|---|---|---|
| production 门禁 | go build + go vet + go test ./... -race | ✅ 过 |
| catalog | go test ./internal/catalog/ | ✅ 过 |
| 协议门禁 | bash .github/scripts/check-protocol-consistency.sh | ✅ 过（069） |
| 台账门禁 | bash .github/scripts/check-task-ledger.sh | ✅ |

## PR 附勾对结果
```markdown
## ✅ 验收勾对（acceptance-checklist）
- 需求点：6/6 通过；三态与边界：3/3；反模式自查：3/3
- 门禁：production 全绿 / catalog ✓ / 协议门禁 ✓ / 台账 ✓
- 页面实测：/settings/channels/protocols 显示 10 模板 + Responses 卡片（32 参数/37 响应映射）
```
