# CI 怎么工作的

本文介绍 CI 流水线的结构和常见问题排查。

## CI 跑什么

| Job | 什么时候跑 |
|---|---|
| Detect Changes | 每次都跑（只判断改了什么，几秒） |
| Frontend Quality Gate | 前端代码有改动时 |
| Backend Build & Test × 6 | 对应服务有改动时 |
| Security Scan | 前端或后端有改动时 |
| Documentation Check | 每次都跑（检查关键文档存在） |
| Contract Breaking Change | PR 且 `openapi/**` 有改动时 |
| Merge Check | PR 汇总 |

## 改动什么会触发全量

以下改动会触发所有检查全跑：
- `.github/**`（CI 配置本身）
- `deploy/**`（部署配置）

## Security Scan 包含什么（W6）

`services/**` 或 `apps/web/**` 有改动时，Security Scan job 依次执行：

| 步骤 | 工具 | 阻断条件 |
|---|---|---|
| Secrets 扫描 | Gitleaks v8.18.4（官方二进制，零权限依赖） | 检出硬编码密钥/凭据/Token |
| Go SAST | Gosec | 检出安全反模式 |
| Go 依赖漏洞 | govulncheck（全部 7 个 module，`-mode=source`） | 代码受影响的漏洞（exit 1）；模块含漏洞但未调用（exit 3）放行并提示 |
| NPM 生产依赖 | npm audit（官方 registry） | high/critical 阻断 |
| NPM 全量依赖 | npm audit（含 dev） | 仅提示（存量 dev 工具漏洞，见 CHANGELOG Known Issues） |

要点：
- Gitleaks 豁免清单在 `.gitleaks.toml`（`[extend] useDefault = true` 保留官方规则 + `[allowlist]` 豁免开发/测试占位值）；新增豁免必须说明理由，禁止豁免生产密钥。
- govulncheck 的标准库漏洞由 setup-go 的 `go-version: '1.25.x'`（最新 patch）消除，不要用固定旧版本。
- Go 依赖升级后本地复扫：`cd services/<svc> && go run golang.org/x/vuln/cmd/govulncheck@latest -mode=source ./...`（本地工具链若有标准库漏洞输出，以 CI 的 1.25.x 为准）。

## 契约门禁（两道，各管一半）

`openapi/bff.yaml` 是前后端字段级契约的唯一事实源，改它会同时被两道检查覆盖：

| 检查 | 在哪 | 回答什么问题 | 阻断条件 |
|---|---|---|---|
| 生成同步 | Frontend Quality Gate 的 `npm run api:check` | 生成类型是否与契约一致（契约**自洽**） | `apps/web/src/types/api-generated.ts` 过期 |
| 破坏性变更 | Contract Breaking Change 的 `oasdiff breaking --fail-on ERR` | 已有客户端会不会被改挂 | ERR 级破坏性变更（旧客户端按旧契约发的请求会失效） |

要点：
- 本地复现破坏性检测（`oasdiff` 可用官方 release 二进制，无需 Docker）：
  `git show origin/develop:openapi/bff.yaml > /tmp/base.yaml && oasdiff breaking --fail-on ERR /tmp/base.yaml openapi/bff.yaml`
- **`--fail-on` 不可省**：`oasdiff breaking` 默认只打印、恒定退出码 0（上游 `internal/run_test.go`
  的 `Test_BasicBreakingChanges` 就是这条断言），少了它就是一条永远绿的「假防线」。
- WARN 级（契约信息不足以判定是否破坏）只打印不阻断；要收紧就把 `--fail-on` 提到 `WARN`。
- 破坏性变更的正确处置：PR 描述标 `BREAKING`，同 PR 改前端并重新生成类型（见 `openapi/README.md` §3）。
- 该 job 在非 PR 事件、或 `openapi/**` 无改动时走第一条「Skipped」步骤如实上报成功，
  不给 job 加 `if:`（见下面「改 CI 配置注意」）。

## CI 红了怎么排查

| 症状 | 先看哪里 |
|---|---|
| 前端红 | 本地跑 `npm run gate` |
| 后端红 | 本地跑对应服务的 `go test ./... -race` |
| 文档检查红 | 看缺了哪个文件 |
| 某检查一直没跑 | 看 Detect Changes 的输出，确认有没有识别到你的改动 |

## 本地复现 CI 判定

```bash
printf 'services/asset/a.go\n' | bash .github/scripts/detect-changes.sh --from-stdin
```

## 改 CI 配置注意

- 必需检查的 job 必须始终运行，不要给 job 加 `if:`（会导致 PR 永远卡着等检查）
- 要跳过重的步骤，在 job 内部加步骤级 `if:`
