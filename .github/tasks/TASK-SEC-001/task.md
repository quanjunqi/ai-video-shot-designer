---
taskId: TASK-SEC-001
status: accepted
priority: P0
depends_on: TASK-INFRA-004
criteria: 8
criteriaPassed: 8
pr: "#195"
---

# TASK-SEC-001：模型网关出站 SSRF 防护

> 按 `.github/TASK_TEMPLATE.md` 填写。阶段 1 三项 P0 加固的第 1 项。

## 目标

阻止 execution 的模型网关被用来探测/访问内网与云元数据服务。

## 背景（威胁模型，来自能力体检）

模型网关按**渠道凭据里的 `base_url`** 发起请求，而该 URL 由 workspace 提供（用户可写）；
请求的**响应体既返回给调用方、又写入 `gateway_audit_logs`**。
修复前全仓库**零** URL/私网校验（无 `net.ParseIP`/`IsPrivate`/白名单）。

可被利用去请求：云元数据 `169.254.169.254`（窃取实例凭据）、`postgres:5432`、
K8s API、环回上的管理端口 —— 且响应内容会经审计日志与 API 外泄，
构成完整的数据外泄通道。多租户下任何能写渠道凭据的人都能触发。

## 范围

- ✅ 新增 `services/execution/internal/netguard`（策略 + 校验 + 受控 client）
- ✅ `cmd/server/main.go` 的 `engineClient` 改用受控 client（sync 与 async 两条路径共用）
- ✅ 单测 + **引擎真实调用路径的端到端测试**
- ✅ `.env.example`、`SECURITY.md`、任务卡

## 非范围

- ❌ 不改 `catalog`/`creds` 的内部 client —— 它们的目标是**私网内部服务**
  （`http://production:8081`），套用本防护会自断链路
- ❌ 不引入 OIDC（独立的 P0 项）
- ❌ 不做请求体脱敏（审计已记录，属独立议题）

## 验收标准

1. 默认策略拒绝：环回、RFC1918、IPv6 ULA、链路本地（含 `169.254.169.254`）、
   CGNAT、保留网段、组播、未指定
2. **IPv4-mapped IPv6**（`::ffff:10.0.0.1`）被还原后正确拒绝（防绕过）
3. `EXECUTION_ALLOW_PRIVATE_UPSTREAM=1` 放开环回+私网，但**仍拒绝**云元数据/链路本地/保留
4. 主机白名单生效，且 `api.openai.com.evil.com` 这类后缀伪装被拒绝
5. **重定向**到被禁地址被拒；跳数上限 5
6. **端到端**：默认策略下引擎对环回上游的调用在连接前被拦，**上游零命中**；
   放开后同一调用成功（证明不误伤本地 provider）
7. 仅允许 `http`/`https`；`file://` 等被拒
8. 不破坏内部服务调用与既有测试

## 测试命令

```bash
cd services/execution
go vet ./... && go test ./...
go test ./internal/netguard/ -v
go test ./internal/engine/ -run SSRF -v
```

## 约束与禁止事项

- 防护必须作用于**真实拨号 IP**（`Dialer.Control`），不能只在 URL 层做字符串判断
  —— 否则 DNS rebinding 可绕过
- 不得为「让本地跑通」而默认放开私网（必须显式 opt-in）
- 不得把防护套到内部服务 client 上

## 输出

- 分支 `fix/ssrf-guard-2026-10-10` + PR
- 测试结果：见 PR（11 项单测 + 1 项端到端）
- 风险说明：默认拒绝私网意味着「把渠道指向本机 provider」的既有用法需显式开启开关；
  已在 `.env.example` 与本任务卡中写明

## 附：本项未覆盖的相关风险（后续项）

| # | 风险 | 去向 |
|---|---|---|
| 1 | 无配额/限流 → 成本失控 | TASK-SEC-002（阶段 1 第 3 项） |
| 2 | 无重试/并发上限 → 任务丢失、打爆上游 | TASK-INFRA-003（阶段 1 第 2 项） |
| 3 | 浏览器→BFF 无真实身份（无 OIDC） | 阶段 2 |
