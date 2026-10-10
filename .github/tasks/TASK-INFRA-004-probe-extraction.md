# TASK-INFRA-004：把「渠道探测」抽成一份公共能力（B3a）

- **来源**：`.github/tasks/PLAN-a-and-adr008-2026-10-10.md` 切片 **B3a**（建议顺序第 1 位）
- **依据**：ADR-008 §9（「实测巡检」与「接入验证」是同一套能力，必须合流）
- **状态**：待 Owner 确认改动清单后再动代码

---

## 1. 目标（一句话）

把现有**两套等价的渠道探测实现**合流为一份公共能力，并让它**走 SSRF 防护**。

## 2. 背景与实测事实

| 事实 | 证据 |
|---|---|
| **已有两套等价实现** | production `services/production/internal/probe/probe.go`（123 行）+ BFF `services/web-bff/cmd/server/main.go:120-258` |
| **两者返回结构几乎相同** ⇒ 可合流 | `probe.Result{channelId, reachable, authConfigured, authOk?, statusCode?, detail, probedAt}`（`probe.go:27-35`）↔ BFF 的 `map[string]any` 同名键（`main.go:233-255`） |
| **两者都发占位串**（从不解密真钥） | `probe.go:90-94`、`main.go:224-228`：`Bearer <REDACTED>` / `X-API-Key: <REDACTED>` / `Sign <REDACTED>` |
| **两者都没有 SSRF 防护** | production：裸 `&http.Client{Timeout: 5s}`（`probe.go:39`），`grep netguard services/production` = **0**；BFF：`s.httpClient`（300s）且**自定义渠道 baseUrl 完全由请求体控制**（`main.go:28-29`）。**实测已拨到 `127.0.0.1:8188`** |
| **production 跨服务直读 workspace 的表** | `probe.go:49-60` 直接 `SELECT ... FROM channel_credentials`（属 workspace 域）⇒ 违反 `AGENTS.md §3.1` |
| **production 的探测路由在 BFF 视角是死代码** | 路由存在（`production/.../handler.go:150`），但 BFF **不转发**，自己在边缘重实现 |
| **execution 已具备探测所需三件** | `internal/netguard/`（2 文件）· `creds.NewClient` + `Reveal(ctx, ws, channelID)`（`creds/client.go:24,29`）· `catalog.NewClient` + `Get(ctx, ws, actor)`（`catalog/client.go:23,67`） |
| **用户渠道当前探测不到** | 实测 `POST /api/v1/channels/chan-muo4b9zo/probe`（无 body）→ **400 INVALID_CHANNEL**，因为 BFF 那套对用户渠道要求在请求体里带 `baseUrl` |

## 3. 目标形态

```
新增  services/execution/internal/probe/          ← 唯一一份探测实现
      输入：workspaceID + channelID（【只此两个】）
      baseUrl：内置渠道走 catalog；用户渠道走工作区渠道信息
      凭据：经 creds 客户端（不跨库直读）
      HTTP：走 netguard 的 client
      输出：与现有 probe.Result【字段完全一致】（保证前端兼容）

execution 暴露  POST /internal/v1/channels/{id}/probe
BFF       改为   转发到 execution（复用已有 proxy 模式，参考 catalogProxy）
production 删除  internal/probe 包与 /internal/v1/channels/{id}/probe 路由
                 （同时消除 §3.1 跨库直读）
```

## 4. 范围 / 非范围

**做**
- 新增 execution 侧探测实现（字段与现有完全一致）
- BFF 改为转发；**不再接受请求体里的 baseUrl**（消除 SSRF 面）
- 删除 production 的 `internal/probe` 包与该路由
- 为「私网被拒」补测试

**不做（本片刻意隔离，避免"搬+改"混在一个 PR 里）**
- **不改 `authOk` 的语义**（去掉布尔判决是 ① 「验证」的设计，另行一片）
- 不实现定时巡检（那是 B3b/B3c）
- 不改前端 `ProbeResult` 消费侧
- 不改协议页 / 模型页

## 5. ⚠️ 一条必须先定的交互（否则会破坏本地渠道探测）

**引入 netguard 会改变一个现有行为**：

| | 现在 | 抽公共能力后（若沿用全局策略） |
|---|---|---|
| 探测 `http://127.0.0.1:8188`（本地 ComfyUI） | 返回 `reachable=false, detail="网络不可达：dial tcp ... connection refused"`（**能试，失败**） | **被 netguard 直接拒绝**（`netguard.go:104-108` 默认拒环回/私网） |

⇒ 而 `EXECUTION_ALLOW_PRIVATE_UPSTREAM` 目前是**进程级全局**（`netguard.go:47-55`，仅认字面量 `"1"`），
开启后**不留痕**（只在启动打一行日志，`main.go:77-78`）。

**因此本片必须同时决定**（否则本地/内网渠道的探测会被无声地"弄坏"）：

| 选项 | 含义 |
|---|---|
| **① 全局开关**（现状） | 打开即全部放开，无粒度、无留痕 —— 最快，但安全语义最弱 |
| **② 按渠道粒度 + 留痕**（推荐） | 每个渠道一个"允许私网"标记；开启写入审计 —— 与 ADR-008「用户自己的内网中转站」场景匹配 |
| **③ 本片先只做"如实拒绝"** | 明确拒绝并在 `detail` 里说清"私网目标被策略拒绝（如需请开启 X）"，粒度问题下一片解决 |

**我的建议：③（本片）→ ②（下一片）**，理由：本片先把"只有一处实现 + 走防护"做完，
**不把策略模型一并改掉**（同样是"一次只改一件事"）。

## 6. 验收判据（客观可验）

| # | 判据 | 怎么验 |
|---|---|---|
| 1 | 全仓探测 HTTP 实现**只有一处** | `grep -rn 'JingxuStudio/probe' services/` → **恰好 1 处**；`grep -rn '<REDACTED>' services/` → 全部集中在该文件 |
| 2 | **BFF 不再自己实现探测** | `grep -n 'REDACTED' services/web-bff/cmd/server/main.go` → **0** |
| 3 | **私网目标被拒绝**，且理由可读 | 新增测试：探测 `127.0.0.1:PORT` → 断言被 netguard 拒绝（而非发起连接） |
| 4 | **用户渠道无需 body 即可探测** | `POST /api/v1/channels/chan-muo4b9zo/probe`（无 body）→ **不再是 400** |
| 5 | **返回字段不减少** | 与 `probe.Result` 逐字段比对；前端 `ProbeResult` 无类型变更 |
| 6 | production 里**不再有跨库直读** | `grep -n 'channel_credentials' services/production -r` → **0** |
| 7 | 后端全绿 | `go build ./... && go vet ./... && go test ./... -count=1`（三个服务：execution / production / web-bff） |

## 7. 测试命令

```bash
export GOCACHE=/tmp/mdp-gocache
for s in execution production web-bff; do
  (cd services/$s && gofmt -l . && go build ./... && go vet ./... && go test ./... -count=1)
done
```

## 8. 约束与禁止

- 迁移号段：**本片不新增迁移**（无 schema 变更）
- 不改 `.github/workflows/**` 的逻辑
- 不改前端组件的布局/样式
- **不得**把真实密钥送进探测（保持占位串语义；这是既有设计，本片不改）

## 9. 风险与回滚

| 风险 | 应对 |
|---|---|
| 删除 production 的探测路由 ⇒ 若有未知调用方 | 先 grep 全仓确认无转发；BFF 不调用它（已实测） |
| netguard 引入后本地渠道探测行为变化 | §5 已单列，本片采选项 ③（如实拒绝 + 可读 detail） |
| 字段兼容 | 输出结构与 `probe.Result` 逐字段对齐；不新增必填字段 |
| 回滚 | 单片独立 PR；revert 该 PR 即可回到两套实现的状态 |

## 10. 输出

分支 + PR（base `develop`）+ 验收判据 1–7 的实测结果 + 风险说明。
