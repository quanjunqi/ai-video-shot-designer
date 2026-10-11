# 安全策略

> 本文件说明如何报告漏洞、我们的响应时限，以及**当前真实的安全基线**（含已知缺口）。
> 密钥管理原则见 `AGENTS.md` §3.4 与 §7；信任模型现状见
> [`docs/architecture/c4-context-container.md`](docs/architecture/c4-context-container.md#信任模型当前状态务必知悉)。

## 1. 支持范围

项目**尚无正式发布版本**（无 git tag）。仅 `master` 分支的最新提交被视为受支持。

| 版本 | 支持状态 |
|---|---|
| `master`（最新） | ✅ 接受安全修复 |
| 历史提交 / 未发布分支 | ❌ 不支持 |

## 2. 报告漏洞

**请勿通过公开 Issue 报告安全问题。**

使用 GitHub 的**私密漏洞报告**：

1. 打开仓库的 **Security** 标签页 → **Report a vulnerability**
2. 或直接访问：<https://github.com/quanjunqi/ai-video-shot-designer/security/advisories/new>

报告请包含：

| 项 | 说明 |
|---|---|
| 影响 | 能造成什么后果（越权/数据泄露/拒绝服务/…） |
| 复现步骤 | 最小可复现路径；含请求样例（**请脱敏真实密钥**） |
| 影响范围 | 哪个服务/接口/版本 |
| 利用前提 | 是否需要登录、是否需要特定角色 |
| 建议修复 | 可选 |

### 响应时限（尽力而为，本项目为个人维护）

| 阶段 | 目标 |
|---|---|
| 确认收到 | 7 天内 |
| 初步评估（是否成立、严重级别） | 14 天内 |
| 修复或缓解方案 | 视严重级别协商，高危优先 |

我们会在修复发布后于 Security Advisory 中致谢（除非你要求匿名）。

## 3. 当前安全基线（如实说明）

### 3.1 已经做到的

| 项 | 实现 |
|---|---|
| 渠道凭据加密存储 | 凭据密文存于 workspace 的 `channel_credentials.key_ciphertext`（`bytea`），明文不入库；execution 运行时通过内部接口 reveal |
| 服务间鉴权 | 下游服务用 `crypto/subtle.ConstantTimeCompare` 比对内部令牌（**常量时间比较**，抗时序侧信道），见 `services/workspace/internal/httpapi/handler.go:70` |
| 租户隔离 | 所有业务表带 `workspace_id`，查询强制按该列过滤；服务之间不跨库读写 |
| 密钥不入库 | 真实 `.env` 被 `.gitignore` 拦截，仅提交 `replace_with_*` 占位模板 |
| 日志脱敏 | 已有先例：探测请求打印 `Bearer <REDACTED>` |
| 依赖扫描 | CI 执行 gosec（Go）与 `npm audit`（前端） |
| 审计留痕 | 所有 AI 调用经 execution 网关写入 `gateway_audit_logs` |
| **出站 SSRF 防护** | 模型网关会请求「渠道凭据里的 `base_url`」（用户可控）。`execution/internal/netguard` 在 **`net.Dialer.Control`**（DNS 解析后、连接前）校验**真实拨号 IP**：默认拒绝环回/私网/链路本地（含云元数据 `169.254.169.254`）/保留网段，并还原 IPv4-mapped 地址防绕过；重定向复用同一 Transport 故仍受校验，另限 5 跳。默认**拒绝**私网，本地开发用 `EXECUTION_ALLOW_PRIVATE_UPSTREAM=1` 显式放开（该开关仍不放开云元数据）。支持 `EXECUTION_ALLOWED_UPSTREAM_HOSTS` 主机白名单 |
| 分支保护 | master 禁止直接 push、禁止 force push / 删除；需 PR + 9 项 CI 检查；管理员不可绕过 |

### 3.2 ⚠️ 已知缺口（**不要误认为已具备**）

| 缺口 | 影响 | 状态 |
|---|---|---|
| **浏览器到 BFF 无真实身份校验**（无 OIDC/JWT） | 身份可伪造；BFF 使用 `BFF_DEV_WORKSPACE_ID`/`BFF_DEV_ACTOR_ID` 固定开发身份。越权仍会被 workspace 授权拦截，但**身份本身不可信** | 未实现 |
| 服务间为**静态共享令牌** | 非 mTLS、非短期凭证；令牌泄露即横向可达 | 未实现 |
| **审计写入失败被静默忽略** | `_ = h.AuditStore.Insert(...)` → 审计记录可能静默丢失，破坏可追溯性 | 未修复 |
| ~~无速率限制 / 配额~~ **已缓解** | 现按 workspace 做 QPS 令牌桶 + 日/月成本上限，超限返回 429 并写审计（`rate_limited` / `quota_exceeded`）；worker 并发有闸门。**注意成本上限默认不限制**，需按业务额度显式配置 `EXECUTION_DAILY_COST_LIMIT` / `EXECUTION_MONTHLY_COST_LIMIT` | 已实现（2026-10-10） |
| 无 CDN/WAF/TLS 终止说明 | 生产边界尚未落地 | 未交付 |
| 无备份与恢复流程 | 数据损坏无法回滚 | 未交付 |
| **依赖漏洞门禁曾长期空转** | `apps/web/.npmrc` 指向 npmmirror，该镜像**未实现 audit 端点**（`NOT_IMPLEMENTED`）；CI 中该步骤又是 `continue-on-error: true`。两者叠加导致**依赖漏洞检查从未真正生效**。改用官方 registry 后实测：生产依赖 4 个 moderate（0 high / 0 critical），**开发构建链 2 critical + 20 high**（集中在 `concurrently`→`shell-quote`、eslint、vite、`@tailwindcss/node`） | 生产依赖已改为**阻断**；dev 链存量待修（见 `CHANGELOG.md` Known Issues） |
| 无安全响应自动化 | 已补 Dependabot（npm + 6 个 Go 模块 + GitHub Actions，每周）；仍无 SAST 之外的检测 | 部分完成 |

> **结论**：当前安全基线**仅适用于本地开发与单机验证**，不可直接对外提供服务。
> 生产化必须先补齐 OIDC + 短期凭证或 mTLS、速率限制、审计可靠性。

## 4. 安全相关约定（贡献者必读）

- **禁止**在代码、prompt、日志、Issue、PR 中写入真实密钥或凭据；示例一律用占位符。
- **禁止**读取、导出、修改生产环境用户数据。
- **禁止**自主修改认证、授权、加密逻辑（`AGENTS.md` §7 禁区）—— 此类变更必须经人类 Owner 批准。
- 新增依赖须评估维护活跃度与已知漏洞；前端高危依赖不得进入 `master`。
- 涉及凭据的功能，提交前自查：日志与错误信息中是否可能泄露密钥或 DSN 密码。

## 5. 安全审查范围（当前）

| 在范围内 | 不在范围内 |
|---|---|
| `services/*`（Go 微服务）的鉴权、输入校验、SQL 注入、凭据处理 | 第三方依赖自身的 0day（请报给上游） |
| `apps/web` 的 XSS、敏感信息暴露、权限校验绕过（前端侧） | 前端产物的压缩/混淆差异 |
| `deploy/` 的容器与编排配置（密钥、暴露面） | 开发机本地环境 |
| 迁移与数据库权限（跨库读写、越权访问） | 供应商/中转站 API 自身的服务条款问题 |

## 相关文档

- 架构与信任边界：[`docs/architecture/c4-context-container.md`](docs/architecture/c4-context-container.md)
- 可观测性与告警：[`docs/how-to/observability.md`](docs/how-to/observability.md)
- 分支与门禁：[`docs/how-to/branch-protection.md`](docs/how-to/branch-protection.md)
- AI 协作禁区：[`AGENTS.md`](AGENTS.md) §7
