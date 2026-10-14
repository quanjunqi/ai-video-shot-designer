# 需求验收清单：T4 单元熔断三件套

> 模板：`.agents/skills/acceptance-checklist/templates/acceptance-checklist.md`
> 任务卡：`.github/tasks/TASK-ROUTE-003-circuit-breaker.md`
> 权威依据：access-design v2.2 §3.4（表 3-1 错误码分类 / channel_health 唯一键 / 原子计数 / 半开单飞）；dev-plan v1.3 §7 T4。

---

## 任务信息

- 任务名称：T4 单元熔断三件套（channel_health 表 + 错误码分类 + 多副本状态共享 + 4xx 不重试）
- 关联需求/任务卡：TASK-ROUTE-003
- 开发者（AI）：Doubao MainAgent
- 开工日期：2026-10-14
- 目标一句话：坏供给单元（渠道×模型）失败计数→冷却→半开探活→恢复；熔断中单元不消耗尝试次数；同渠道不同模型互不影响；硬 4xx 不重试不切换。

---

## 一、需求点 → 可验证判据

| # | 需求点（access-design §3.4 / dev-plan T4） | 验收判据（可客观验证） | 判据四要素备注 | 自检结果 |
|---|---|---|---|---|
| 1 | 迁移 015：channel_health 表，唯一键 channel_id+provider_model | `execution-migrate` 可应用；`\d channel_health` 主键为 (channel_id, provider_model)；重复插入同单元被唯一约束拒绝 | 判据=表结构与唯一键；对象=本地库；时点=迁移后 | ☐ 过 / ☐ 未过 |
| 2 | 失败计数原子 UPDATE（无读改写竞态） | 单条 `UPDATE channel_health SET fail_count=fail_count+1 WHERE channel_id=? AND provider_model=?`；并发测试下计数无覆盖 | 判据=单语句原子；对象=store 实现；时点=代码审查+并发测试 | ☐ 过 / ☐ 未过 |
| 3 | 达阈值（默认 3）→ 进入冷却（cooldown_until=now+60s） | 连续 3 次失败后，该单元被 FilterHealthy 剔除；冷却期内请求不消耗尝试次数 | 判据=冷却判定；对象=集成测试；时点=提交时 | ☐ 过 / ☐ 未过 |
| 4 | 冷却到期 → 半开探活单飞（DB 原子占位，probe_owner 判空） | 冷却到期后 TryAcquireProbe 只允许一个实例成功（并发调用仅 1 个 true）；探活请求不计入失败计数 | 判据=单飞；对象=并发测试；时点=提交时 | ☐ 过 / ☐ 未过 |
| 5 | 表 3-1 错误码分类：硬 4xx（400/401/403/404/422）不重试不切换直返；软 4xx（408/409/425/429）可重试可切换计入失败；5xx/超时切换计入失败；内容安全拒绝不切换 | Classify 单测逐码断言分类正确；AttemptEach 遇硬 4xx 立即直返（不再尝试后续候选）；软 4xx/5xx 继续切换 | 判据=分类与行为；对象=classify 单测+集成测试；时点=提交时 | ☐ 过 / ☐ 未过 |
| 6 | 同渠道不同模型互不影响（单元级唯一键生效） | A 模型熔断后，同渠道 B 模型（不同 provider_model）候选仍可用、不被剔除 | 判据=单元隔离；对象=集成测试；时点=提交时 | ☐ 过 / ☐ 未过 |
| 7 | 运营开关：熔断参数误伤可一键关闭 | `EXECUTION_CIRCUIT_BREAKER=off`（或等价值）后 FilterHealthy 恒放行、失败不计数 | 判据=开关生效；对象=配置测试；时点=提交时 | ☐ 过 / ☐ 未过 |
| 8 | 候选上限 3 与审计不变量不动（ADR-003） | 熔断剔除后候选数仍 ≤3；审计 attempts 轨迹仍记录每次尝试 | 判据=不变量；对象=代码审查+既有测试回归 | ☐ 过 / ☐ 未过 |

> 判据四要素：判据（看什么算过）、对象（哪个文件/接口/环境）、时点（什么时候看）、例外（什么情况不算失败）。

---

## 二、设计稿逐点映射（无设计稿，映射到权威方案 §3.4）

| # | 方案模块（access-design §3.4） | 对应需求点 | 实现位置 | 偏差说明 | 自检结果 |
|---|---|---|---|---|---|
| 1 | channel_health 落 execution 共享库 PG，单元级唯一键 | 需求点 1 | `services/execution/migrations/015_channel_health.sql` | 无 | ☐ 过 / ☐ 未过 |
| 2 | 失败计数原子更新（单语句无读改写） | 需求点 2 | `internal/breaker/store.go` RecordFailure | 无 | ☐ 过 / ☐ 未过 |
| 3 | 冷却/恢复以 DB 状态+时间戳判定（cooldown_until） | 需求点 3 | `internal/breaker/store.go` FilterHealthy | 无 | ☐ 过 / ☐ 未过 |
| 4 | 半开探测单飞（probe_owner 原子占位，`cooldown_until < now AND probe_owner IS NULL`） | 需求点 4 | `internal/breaker/store.go` TryAcquireProbe | 无 | ☐ 过 / ☐ 未过 |
| 5 | 表 3-1 错误码分类 | 需求点 5 | `internal/breaker/classify.go` | 无 | ☐ 过 / ☐ 未过 |
| 6 | 单元级（渠道×模型）互不影响 | 需求点 6 | 唯一键 + FilterHealthy 按单元查询 | 无 | ☐ 过 / ☐ 未过 |
| 7 | 熔断参数误伤可一键关闭 | 需求点 7 | `internal/breaker/config.go` FromEnv | 无 | ☐ 过 / ☐ 未过 |
| 8 | 路由决策：候选 ∧ 不在熔断/冷却中 → 依次尝试 | 需求点 8 | `catalog/attempt.go` AttemptEach + 调用点过滤 | 熔断过滤在调用点做（AttemptEach 保持纯净） | ☐ 过 / ☐ 未过 |

---

## 三、三态与边界（后端数据流边界）

| # | 场景 | 预期 | 自检结果 |
|---|---|---|---|
| 1 | 候选全部被熔断剔除 | 不静默放行：返回可读错误（如"all candidates cooling"），与 ADR-003 全部失败语义兼容 | ☐ 过 / ☐ 未过 |
| 2 | channel_health 无该单元行（首次调用） | FilterHealthy 视作健康放行；RecordFailure 用 UPSERT 原子插入计数 | ☐ 过 / ☐ 未过 |
| 3 | 冷却期后成功调用 | 成功即重置 fail_count=0、清 cooldown_until（恢复） | ☐ 过 / ☐ 未过 |
| 4 | 半开探活失败 | 释放占位并重新冷却（防探测风暴） | ☐ 过 / ☐ 未过 |
| 5 | DB 不可用（熔断系统故障） | fail-open：FilterHealthy 放行 + 日志告警（不误伤全部请求） | ☐ 过 / ☐ 未过 |

---

## 四、反模式自查（命中即改，引用规则编号）

| # | 反模式检查 | 命中？ | 处理 |
|---|---|---|---|
| 1 | 本地内存做跨实例计数/熔断（BE-CONC-002） | ☐ 否 / ☐ 是 | 一律走 channel_health 表原子 UPDATE |
| 2 | 后端吞错 `_ = f()`（BE-ERR-001） | ☐ 否 / ☐ 是 | 熔断上报失败显式处理+日志 |
| 3 | SQL 拼接（BE-PGX-001 / SEC-001） | ☐ 否 / ☐ 是 | 全部 `$N` 参数化 |
| 4 | 探活另写一套（与 ADR-008 probe 合流要求） | ☐ 否 / ☐ 是 | 复用 probe 包 / netguard，不新写 HTTP 探测 |
| 5 | 修改已执行迁移 / 撞号（BE-PGX / migrations） | ☐ 否 / ☐ 是 | 015 号段认领，只增不改 |
| 6 | 日志打 Key（SEC-005 / BE-LOG-002） | ☐ 否 / ☐ 是 | 只记 channel/provider_model，不打密钥 |
| 7 | 契约未先行（CT-001） | ☐ 否 / ☐ 是 | 本任务纯内部实现，无外部契约变更 |

---

## 五、门禁与测试

| # | 检查 | 命令 | 结果 |
|---|---|---|---|
| 1 | 后端构建/测试/vet | `cd services/execution && go build ./... && go test ./... -race && go vet ./...` | ☐ 过 / ☐ 未过 |
| 2 | 迁移应用验证 | `docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml --profile app up execution-migrate` | ☐ 过 / ☐ 未过 |
| 3 | 新增纯函数有测试 | classify.go / config.go / store.go 同包测试存在 | ☐ 过 / ☐ 未过 |

---

## 六、PR 附勾对结果（提交 PR 时随 body 附上）

```markdown
## ✅ 验收勾对（acceptance-checklist）
- 需求点：8/8 通过（未过项：无）
- 方案映射：8/8 无偏差
- 三态与边界：5/5 通过
- 反模式自查：7/7 未命中（命中并修复：无）
- 门禁：后端全绿 / 迁移应用通过 / 单测存在
- 未过项及原因：（如实填写，不得隐瞒）
```

> 勾对必须如实。未过项在 PR 中说明原因与影响，由 Owner 决定是否放行；隐瞒勾对 = 违反 AC-005，评审直接打回。
