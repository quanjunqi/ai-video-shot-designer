# TASK-SEC-001 验收清单

> 对应任务卡：`task.md`（模型网关出站 SSRF 防护）
> 类型：验收型（实现已在 develop：netguard 由 INFRA-004 抽至 shared/，引擎双路径已接入）
> 判据四要素：判据 / 对象 / 时点 / 例外

| # | 需求点（任务卡验收标准） | 判据（客观可验） | 对象 | 时点 | 例外 | 结果 |
|---|---|---|---|---|---|---|
| 1 | 默认策略拒绝内网各段 | `TestCheckIP_DefaultPolicyBlocksInternalRanges` 全过（环回/RFC1918/ULA/链路本地/CGNAT/保留/组播/未指定） | shared/netguard | 测试运行 | 显式 AllowPrivate | ✅ |
| 2 | IPv4-mapped IPv6 还原后拒绝 | 用例含 `::ffff:10.0.0.1`/`::ffff:127.0.0.1`，netguard.go:106 还原逻辑 | shared/netguard | 测试运行 | 无 | ✅ |
| 3 | AllowPrivate=1 仍拒元数据/链路本地/保留 | `TestCheckIP_AllowPrivateOpensLoopbackAndPrivateButNotMetadata` 全过 | shared/netguard | 测试运行 | 无 | ✅ |
| 4 | 白名单生效 + 后缀伪装拒绝 | `TestCheckURL_Allowlist` 含 `api.openai.com.evil.com` 拒绝 | shared/netguard | 测试运行 | 无 | ✅ |
| 5 | 重定向到被禁地址被拒 + 跳数上限 5 | `TestClient_RevalidatesRedirectTarget` + `TestClient_RedirectHopLimit` 全过 | shared/netguard | 测试运行 | 无 | ✅ |
| 6 | 端到端：默认拦截（上游零命中）→ 放开后成功 | `TestSubmit_SSRFGuardBlocksLoopbackUpstream`（0 命中断言 + AllowPrivate 成功 1 命中断言） | execution/engine | 测试运行 | 无 | ✅ |
| 7 | 仅 http/https，file:// 等拒绝 | `TestCheckURL` 含 ftp:// file:// 拒绝 | shared/netguard | 测试运行 | 无 | ✅ |
| 8 | 不破坏内部服务调用与既有测试 | main.go asset 内部 API 普通 client；execution 全量 `go build/vet/test` 全绿 | execution 全服务 | 测试运行 | 内部服务 client 例外 | ✅ |

## 非范围核对（未越界）

- [x] 未改 catalog/creds 内部 client（内网目标，套防护自断链路）
- [x] 未引入 OIDC（独立 P0）
- [x] 未做请求体脱敏（独立议题）
- [x] 未为本地跑通默认放开私网（必须显式 EXECUTION_ALLOW_PRIVATE_UPSTREAM=1 opt-in）
