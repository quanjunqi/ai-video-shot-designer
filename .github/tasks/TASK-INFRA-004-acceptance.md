# TASK-INFRA-004 验收清单

> 对应任务卡：`TASK-INFRA-004-probe-extraction.md`（B3a：渠道探测合流 + SSRF 防护）
> 类型：验收型（实现已在 develop：11b4fe1 + c4d66c3，本片补验收闭环 + AC-010 首个实践）
> 判据四要素：判据 / 对象 / 时点 / 例外

| # | 需求点（来自任务卡） | 判据（客观可验） | 对象 | 时点 | 例外 | 结果 |
|---|---|---|---|---|---|---|
| 1 | 全仓探测 HTTP 实现只有一处 | `grep -rn 'JingxuStudio/probe' services/` 恰好 1 处；`<REDACTED>` 全部集中该实现 | services/ | PR 前 | 无 | ✅ 1 处（probe.go:32）|
| 2 | BFF 不再自己实现探测 | `grep -rn 'REDACTED' services/web-bff` = 0；`channelProbe` 仅转发 execution | services/web-bff | PR 前 | 无 | ✅ 0 处，仅转发 |
| 3 | 私网目标被拒绝且理由可读 | 测试断言 netguard 拒绝（非发起连接），detail 含 policyDeniedHint | execution probe 测试 | 测试运行 | 显式 AllowPrivate | ✅ TestProbeReportsPrivateTargetAsPolicyDenial |
| 4 | 用户渠道无需 body 即可探测 | `POST /api/v1/channels/{id}/probe`（无 body）非 400 | BFF 转发 + probe 解析 | 测试运行 | 渠道不存在仍 404 | ✅ 两条测试覆盖 |
| 5 | 返回字段不减少 | probe.Result 与前端 ProbeResult 逐字段一致（7 键）；无必填新增 | probe.go / api-generated.ts | PR 前 | 无 | ✅ 一致 |
| 6 | production 无跨库直读 | `grep -rn 'channel_credentials' services/production` 代码=0（迁移注释可留） | services/production | PR 前 | 迁移注释除外 | ✅ 仅 2 处注释 |
| 7 | 三服务后端全绿 | `go build ./... && go vet ./... && go test ./... -count=1` | execution / production / web-bff | 测试运行 | 无 | ✅ 全绿 |

## 非范围核对（未越界）

- [x] 未改 authOk 语义（布尔判决去留 = 另一片）
- [x] 未实现定时巡检（B3b/B3c）
- [x] 未改前端 ProbeResult 消费侧 / 组件布局
- [x] 未新增迁移（本片无 schema 变更）
- [x] 未把真实密钥送进探测（保持占位串语义）
