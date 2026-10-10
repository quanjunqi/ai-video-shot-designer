# 测试策略

> 本文件是测试的**权威规范**。测试门禁的执行口径见 [`docs/development/frontend-quality-gate.md`](frontend-quality-gate.md)，
> 图与链路见 [`architecture/02-key-sequences.md`](../architecture/02-key-sequences.md)。

## 1. 原则

1. **不接受「后续补测试」** —— 新功能必须在同一个 PR 内含测试（AGENTS.md §6.3）。
2. **测行为，不测实现** —— 断言对外可观察的结果，不锁死内部调用顺序。
3. **失败必须可复现** —— 测试不得依赖执行顺序、系统时间、真实外部网络。
4. **越靠近领域核心，要求越高** —— 参数映射、状态流转、审计写入属高风险区，必须覆盖边界。

## 2. 测试分层

| 层 | 范围 | 位置 | 何时必须有 |
|---|---|---|---|
| **单元** | 纯函数与领域逻辑（映射引擎、校验、状态机、序列化） | 与被测代码同包 `*_test.go` / `*.test.ts` | 所有新增领域逻辑 |
| **集成** | Repository ↔ 真实 PostgreSQL；HTTP handler ↔ 真实依赖 | `services/<svc>/internal/**/postgres_integration_test.go` | 所有数据库读写路径 |
| **契约** | BFF `/api/v1/*` 与 [`../openapi/`](../../openapi/) 的一致性 | 待建（见 §6） | 接口变更时 |
| **端到端** | 浏览器 → BFF → 服务 → 库 | 待建（见 §6） | 关键用户旅程 |

## 3. 覆盖率要求

### 3.1 目标（按风险分级，不搞全局一刀切）

| 范围 | 目标 | 理由 |
|---|---|---|
| 领域核心：`execution/internal/mapping`、`engine`（提取/映射部分）、状态流转 | **≥ 80%** | 算错参数或状态直接导致错误计费与审计失真 |
| HTTP handler：`*/internal/httpapi` | **≥ 60%** | 主要验证参数校验、错误码、鉴权分支 |
| Repository：`*/internal/**/postgres.go` | 关键路径必须有集成测试 | 覆盖率数字意义有限，重点是「真实 SQL 跑通」 |
| 前端：`stores/`、`hooks/`、`lib/` | **≥ 60%** | 状态与请求逻辑是 bug 高发区 |
| 前端：`features/`、`pages/` | 关键交互 + 可访问性 | 渲染类代码以行为测试为主 |

### 3.2 现状（2026-10-10 实测，**远低于目标**）

| 指标 | 现状 |
|---|---|
| 前端测试文件 | **1 个**（`apps/web/tests/workflow.test.ts`，3 个用例） |
| 前端代码规模 | 19 个页面、55 个 UI 组件、13 个 store、53 个 API 方法 |
| 后端测试文件 | 12 个（含 1 个 PostgreSQL 集成测试） |
| CI 覆盖率门禁 | **无阈值** —— CI 产出 `coverage.out` 并上传 artifact，但不阻断 |

**结论**：覆盖率是当前最薄弱环节之一。直接要求「立刻达标」不现实，因此采用**棘轮策略**（§3.3）。

### 3.3 棘轮策略（推荐落地方式）

1. **先禁止下降**：CI 记录当前覆盖率基线，PR 不得降低；一旦下降即失败。
2. **按模块逐步提高**：对改动到的包，要求其覆盖率不低于既定目标（增量从严，存量从宽）。
3. **禁止用 `//nolint`/跳过用例**绕过门禁；确需豁免必须在 PR 中写明理由并由人类批准。

> 落地此项需要 CI 改造（见 §5），属 P1「CI 增强」范围。

## 4. 各层怎么跑

### 4.1 前端

```bash
cd apps/web
npm run typecheck     # tsc -p tsconfig.app.json（严格模式）
npm run lint:eslint
npm run gate          # typecheck + eslint + quality-gate 反模式静态扫描
npm test              # node --experimental-strip-types --test tests/*.test.ts
```

> **CI 注意**：`npm test` 使用 Node 22.6+ 的 `--experimental-strip-types`。
> CI 的 `node-version` 必须 ≥ 22，否则 `npm test` 会以 exit code 9 失败（曾真实发生）。

### 4.2 后端（每个服务独立）

```bash
cd services/<service>
go build ./...
go vet ./...
go test ./... -race -coverprofile=coverage.out
go tool cover -func=coverage.out | tail -1     # 查看总覆盖率
```

### 4.3 集成测试（需要真实 PostgreSQL）

```bash
# 用 compose 的 test profile（独立测试库 production_test，每个测试自建并清理 schema）
docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml \
  --profile test run --rm --build production-test
```

集成测试通过 `PRODUCTION_TEST_DATABASE_URL` / `EXECUTION_TEST_DATABASE_URL` 连接，
**不得**指向开发/生产库。

## 5. 测试数据与确定性

| 要求 | 说明 |
|---|---|
| 禁止依赖真实外部 API | 外部依赖一律用 `httptest` 假服务器（参照 `services/execution/internal/engine/engine_test.go`） |
| 禁止依赖系统时间 | 需要时间时注入或使用可控时钟；不得断言「当前时间」 |
| 禁止依赖执行顺序 | 每个用例自建所需状态，不共享可变全局状态 |
| 数据库测试隔离 | 使用独立测试库 + 每用例独立 schema，用完清理 |
| 固定随机 | 需要随机时使用固定种子 |
| 无密钥 | 测试中只允许占位令牌（如 `test-key`） |

## 6. 当前缺口（按优先级）

| 优先级 | 缺口 | 影响 |
|---|---|---|
| **P0** | 前端测试仅 1 个文件 | 19 个页面/13 个 store 的回归全靠人工 |
| **P0** | CI 覆盖率无阈值 | 「覆盖率」是声明而非约束 |
| **P1** | 无契约测试 | BFF 与前端字段漂移无法自动发现（[`../openapi/`](../../openapi/) 就位后可补） |
| **P1** | 无端到端测试 | 跨服务链路（生成→审计→任务）无自动化验证 |
| **P1** | 无性能/容量测试 | 异步 worker 无并发上限，容量未知（见 [architecture/02](../architecture/02-key-sequences.md)） |
| **P2** | 无变异测试/模糊测试 | 可选增强，非阻塞 |

## 7. 新增测试的检查清单

- [ ] 覆盖成功路径与至少一个失败路径
- [ ] 覆盖边界：空值、超长、类型不符、并发重复提交
- [ ] 断言错误码/错误信息，而非只断言「报错」
- [ ] 数据库变更同时补集成测试
- [ ] 不引入新的不稳定因素（时间/顺序/网络）
- [ ] 本地 `npm run gate` 与 `go test ./...` 全绿

## 相关文档

- 质量门禁执行口径：[`docs/development/frontend-quality-gate.md`](frontend-quality-gate.md)
- 关键链路（决定该测什么）：[`architecture/02-key-sequences.md`](../architecture/02-key-sequences.md)
- 跨库数据隔离（集成测试前提）：[`architecture/03-data-model.md`](../architecture/03-data-model.md)


---

## 测试不得依赖本地时区 / 时钟（2026-10-10 追加）

**背景（真实事故）**：`create-result-utils.test.ts` 断言
`formatTaskTime('...T18:04:19+08:00').includes('18:04')` —— 该作者机器是 UTC+8 故通过，
但 **CI 跑 UTC** 会渲染成 `10:04`，导致「本地全绿、CI 单点红」。

**规则**：

1. **禁止**对 `toLocaleString` / `getHours()` / `Date` 格式化结果**硬编码具体数字**（小时、日期、相对时间如"3 分钟前"）
2. 需要时间断言时，用以下任一方式：
   - **同一时刻的多种表示必须等价**：`assert.equal(f('...T18:04:19+08:00'), f('...T10:04:19Z'))`
   - **形状断言**：`assert.match(f(...), /^\d{2}:\d{2}/)`
   - **注入时钟**：让被测函数接受 `now`/`clock` 参数（纯函数化），测试传入固定时间
3. 同一原则适用于：随机数（注入随机源）、并发（不依赖调度顺序）、网络（必须 mock）
