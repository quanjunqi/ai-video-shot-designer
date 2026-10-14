---
name: backend-coding
description: 当修改 services/ 下任何 Go 代码（含建表/改表、API 契约、安全相关代码）时加载。包含包分层、handler 模式、错误处理、pgx 数据访问、并发一致性、日志审计、配置、HTTP 语义、性能、测试、数据结构、契约层与安全红线的正向编码规范。
---

# 后端编码规范

> 全量规则见 `rules.md`（本目录，唯一权威）。本文件是 AI 执行时的快速参考。

## 什么时候加载这个 skill

- 改 `services/` 下任何 `.go` 文件
- 建表/改表/定义字段（数据库 schema）
- 新增/修改 API 端点、错误码、状态枚举
- 写涉及安全红线的代码（注入/XSS/密钥）

## 核心规则速查

| 族 | 关键 MUST | 检测方式 |
|---|---|---|
| BE-LAYER | 单向依赖（cmd→httpapi→领域包）；cmd 只装配；httpapi 只做 HTTP 语义 | depguard + 审查 |
| BE-HANDLER | 统一 Routes；`writeError` 统一错误响应；ctx 贯穿；/live + /ready | 审查 |
| BE-ERR | 显式处理（禁 `_ = f()` 吞错）；`%w` 包装保留根因；失败语义分级 | errcheck + 审查 |
| BE-PGX | `$N` 参数化 + 动态列白名单 map；rows.Err()；事务纪律（SET LOCAL、禁网络调用）；迁移只增不改纯数字；分页白名单聚合；成本双口径 | gosec + CI + 审查 |
| BE-CONC | 幂等键；跨实例状态共享存储；异步预扣结算；重试有上限退避 | 集成测试 |
| BE-LOG | slog 结构化；密钥打码；审计同步写；不记敏感全文 | golangci + 审查 |
| BE-CFG | 环境变量禁硬编码；启动 fail-fast；密钥集中 workspace | 审查 |
| BE-HTTP | 状态码语义；超时 + 优雅关闭；请求体上限 | 审查 |
| BE-PERF | 索引先行；防 N+1；聚合走 DB | 迁移审查 + 审查 |
| BE-TEST | 同包测试 + fake 注入；纯函数必有单测；集成测试不 SKIP；覆盖率棘轮；判据四要素 | CI 6 道关 |
| BE-DATA | 命名统一；时间 timestamptz / 金额 decimal 禁 float64；状态机单一 status；DTO 分离；唯一约束 DB 表达 | 迁移 lint + 审查 |
| CT | 契约先行；字段口径统一；错误码/状态枚举契约定义；破坏性变更治理 | PR 审查 |
| SEC | SQL/XSS/命令注入防护；密钥零落盘；输入校验；依赖安全；环境敏感信息不入仓 | gosec + CI |
| RV | PR 评审分级（阻断项/建议项/风格项）；评审话术引用规则编号 | 审查 |

## 禁止事项

- ❌ `fmt.Sprintf("... %s ...", userInput)` 拼 SQL/命令/路径
- ❌ `_ = f()` 吞错误（业务路径；best-effort 清理需注释说明）
- ❌ 裸 500 无错误码、`http.Error` 散落
- ❌ `float64` 金额、`string` 存无时区时间
- ❌ 修改已执行迁移、字母后缀编号（`019a`）
- ❌ 本地内存做跨实例计数/熔断、事务内网络调用
- ❌ 日志输出完整 Key/PII、异步写审计

## 交付前必须跑

```bash
cd services/<svc>
go build ./... && go test ./... -race && go vet ./...
```

**CI 6 道关（build/vet/gofmt/golangci-lint/test -race/覆盖率棘轮）全绿才能交付。**

## 完整规则

→ `rules.md`（BE-* 全量 + BE-DATA-* + CT-* + SEC-* + RV-* + 反模式速查 + 新表检查清单）
→ `.agents/skills/audit-ledger`（审计日志与网关规范）
→ `.agents/skills/database-migrations`（迁移号段与执行器）
