# TASK-MODEL-006 验收清单

> 逐项可验证判据（判据/对象/时点/例外 四要素）。规则：AC-001~011。
> ⚠️ **本卡尚未开工**（`status: 待开工`）；清单按 AC-008 先行落盘。
> ⚠️ **部分数据项依赖 Owner 提供真实口径**（见 task.md「需 Owner 提供的信息」）——
> 未获信息前**不得凭猜测填数据**，否则等于造第二份 mock。

---

## 任务信息

- 任务名称：供给单元池真实化（底座收尾 · dev-plan T5 + T6 + T12）
- 关联需求/任务卡：[task.md](task.md)
- 开发者（AI）：待指派
- 开工日期：待定
- 目标一句话：让供给单元池装真实供给单元，前端从 `demo` 切到 `server` 并跑通真实业务流。

---

## 一、需求点 → 可验证判据

| # | 需求点 | 验收判据（可客观验证） | 四要素备注 | 自检结果 |
|---|---|---|---|---|
| 1 | 逻辑模型真实化（T12） | `SELECT id FROM logical_models` → 恰为 GATE-3 的 5 个命名；`accept-smoke-*` 不再存在 | 判据：5 个且无冒烟行；对象：production 库；时点：迁移后 | ☐ 未开始 |
| 2 | 入池行 providerModel 必填（T6） | `SELECT count(*) FROM model_catalog WHERE logical_model_id IS NOT NULL AND (provider_model IS NULL OR provider_model='')` → **0** | 判据：计数为 0；对象：production 库；时点：数据回填后；例外：无 | ☐ 未开始 |
| 3 | 语义违反行被处置 | 现存 `gpt-image-2`（空 providerModel 且入池）**被修正或移出池**，且有迁移记录 | 判据：该行不再违反；对象：该行；时点：迁移后 | ☐ 未开始 |
| 4 | 能力声明覆盖（T5） | `SELECT count(*) FILTER (WHERE capabilities<>'{}'::jsonb)||'/'||count(*) FROM protocol_templates` → **8/8** | 判据：8/8；对象：production 库；时点：迁移后 | ☐ 未开始 |
| 5 | 能力档位字段（T5） | 档位字段（`aspect_ratios`/`duration_range`/`quality_options`/`reference_rule`）存在，且**至少 1 个真实模型**声明了取值 | 判据：字段存在 + 有真实取值；对象：契约/库；时点：迁移后 | ☐ 未开始 |
| 6 | 候选能力过滤（T6） | `Resolve` 按能力过滤：构造一个"不支持该能力"的候选 → 被剔除；**有自动化测试断言** | 判据：断言存在且通过；对象：execution Resolve；时点：开发后 | ☐ 未开始 |
| 7 | 单元级价格（T12） | `cost_*` 有真实值，且来源口径与 T0 的 synced/manual 一致（可追溯） | 判据：非空 + 口径一致；对象：model_catalog；时点：数据回填后 | ☐ 未开始 |
| 8 | 前端不再依赖 mock | `useSettingsStore.catalogSource` 成功加载后为 **`server`**；创作流读真实目录 | 判据：source 值 + 数据来源；对象：apps/web；时点：端到端 | ☐ 未开始 |
| 9 | 端到端真实链路 | 真实目录 → 选模型 → 提交 → 任务 succeeded → 拿到**产物地址**；全程无 mock/硬编码目录参与 | 判据：跑通 + 无 mock；对象：全链路；时点：集成验证 | ☐ 未开始 |
| 10 | 迁移合规 | 全新库零错误；号段认领正确；**未改任何已执行迁移** | 判据：全新库通过 + diff 无旧迁移改动；对象：migration；时点：开发后 | ☐ 未开始 |
| 11 | 门禁 | 后端 `go build/test -race/vet` 全绿；前端 `gate`=0/0、`npm test` 全绿 | 判据：命令均通过；对象：前后端；时点：开发后 | ☐ 未开始 |
| 12 | 文档同步 | CHANGELOG + 台账（README/ledger）同步；`check-task-ledger.sh` rc=0 | 判据：三处一致；对象：文档；时点：收尾 | ☐ 未开始 |

---

## 二、设计稿逐点映射

**N/A —— 非 UI 任务**（供给侧数据与能力声明；不改页面布局/视觉系统）。

---

## 三、三态与边界

| # | 场景 | 预期 | 自检结果 |
|---|---|---|---|
| 1 | 正常态（真实数据齐备） | 前端走 `server`，业务流跑通 | ☐ 未开始 |
| 2 | 服务端目录不可达 | 退回 `offline-fallback` **并在 UI 如实提示**（不得静默用 mock 冒充真实） | ☐ 未开始 |
| 3 | 空态（某逻辑模型无候选） | 明确报错/空态，不静默降级到 mock | ☐ 未开始 |
| 4 | 边界：候选能力不匹配 | 被过滤掉，不进入选择器 | ☐ 未开始 |
| 5 | 边界：旧库升级 | 存量行 `provider_model` 为空时不报错（但入池行须已被修正） | ☐ 未开始 |
| 6 | 边界：未获 Owner 数据口径 | **不填猜测值**；结构可先行，数据留空并标注 | ☐ 未开始 |

---

## 四、反模式自查

| # | 反模式检查 | 命中？ | 处理 |
|---|---|---|---|
| 1 | **造第二份 mock**（凭猜测填"真实"数据） | ☐ 未开始 | 约束：无 Owner 口径不填数据 |
| 2 | 自动全量入池（违反 ADR-004 不变量：入池=管理员精选） | ☐ 未开始 | task.md 非范围明令 |
| 3 | 改已执行迁移 | ☐ 未开始 | 判据 10 |
| 4 | 金额用 float64 | ☐ 未开始 | 后端红线 |
| 5 | 契约未先行（若需改契约） | ☐ 未开始 | CT-001 |
| 6 | 前端静默降级到 mock 而不提示 | ☐ 未开始 | 边界 2/3 |

---

## 五、门禁与测试

| # | 检查 | 命令 | 结果 |
|---|---|---|---|
| 1 | production | `cd services/production && go build ./... && go test ./... -race && go vet ./...` | ☐ 未开始 |
| 2 | execution | `cd services/execution && go build ./... && go test ./... -race && go vet ./...` | ☐ 未开始 |
| 3 | 前端 | `cd apps/web && npm run gate && npm test` | ☐ 未开始 |
| 4 | 迁移 | 见 `.agents/skills/database-migrations/SKILL.md` | ☐ 未开始 |
| 5 | 台账 | `bash .github/scripts/check-task-ledger.sh` | ☐ 未开始 |

---

## 六、PR 附勾对结果

```markdown
## ✅ 验收勾对（acceptance-checklist）
- 需求点：__/12 通过（未过项：）
- 设计稿映射：N/A（非 UI 任务）
- 三态与边界：6/6 通过
- 反模式自查：6/6 未命中
- 门禁：production / execution / 前端 / 迁移 / 台账
- 未过项及原因：（如实填写，不得隐瞒）
```
