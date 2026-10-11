---
name: audit-ledger
description: 当修改 execution 服务、审计日志、gateway_audit_logs、或涉及 AI 模型调用时加载。包含审计写入规范、密钥打码要求、不可丢失原则。
---

# 审计日志规范

> 完整文档见 `docs/how-to/observability.md`。
> 本文件是 AI 执行时的快速参考。

## 什么时候加载这个 skill

- 改了 `services/execution/` 下任何代码
- 涉及 AI 模型调用、网关、provider
- 涉及密钥、凭据、API Key
- 涉及审计日志表 `gateway_audit_logs`

## 核心原则

**所有 AI 模型调用必须经过 execution 网关，写入 `gateway_audit_logs`。**

- 审计日志**同步写入**，不异步丢失
- 禁止绕过网关直接调上游 API
- 审计日志是合规要求，不是可选功能

## 密钥打码

- API Key / Token 在日志中必须打码为 `<REDACTED>`
- 参考 `services/execution/internal/audit/redact.go`
- 响应体中的 Key 永不回传前端

## 审计日志字段

每次 AI 调用必须记录：
- 调用时间、租户 ID、项目 ID
- 模型 ID、渠道 ID、协议模板 ID
- 请求参数（不含密钥）、响应摘要
- 状态（成功/失败）、耗时、HTTP 状态码
- 错误信息（如有）

## 禁止事项

- ❌ 在日志中打印完整 API Key
- ❌ 异步写审计（可能丢失）
- ❌ 跳过审计直接调上游
- ❌ 在前端回显密钥

## 完整文档

→ `docs/how-to/observability.md`（日志/指标/追踪/健康检查规范）
→ `services/execution/internal/audit/redact.go`（打码实现）
