# 怎么跑测试

本文教你在本地跑前端和后端测试。

## 前端测试

```bash
cd apps/web

# 类型检查（严格模式 tsconfig.app.json）
npm run typecheck

# ESLint
npm run lint:eslint

# 完整质量门禁（typecheck + eslint + 静态反模式扫描）
npm run gate

# 单元测试
npm test
```

> 要求 Node 22.6+（测试用了 `--experimental-strip-types`）。

## 后端测试

每个服务独立跑：

```bash
cd services/<service>

go build ./...        # 编译检查
go vet ./...          # 静态分析
go test ./... -race   # 单元测试（竞态检测）
```

查看覆盖率：

```bash
go test ./... -coverprofile=coverage.out
go tool cover -func=coverage.out | tail -1
```

## 集成测试

集成测试需要真实 PostgreSQL，用 Docker Compose 的 test profile：

```bash
docker compose --env-file deploy/local/.env \
  -f deploy/local/compose.yaml \
  --profile test run --rm --build production-test
```

集成测试连接独立的测试库（`production_test` / `execution_test`），不会碰开发库。

### 让本地能跑出与 CI 同口径的结果（`.env.local`）

**为什么必须做这件事**：`scripts/preflight.sh` 会**加载 `.env.local` 到环境**（与 CI 在 workflow
`env:` 里提供变量同口径）。**缺变量 ⇒ 对应集成测试被 `t.Skip` ⇒ 覆盖率偏低 ⇒ 本地看不出真问题，
只有 CI 才发现**。这不是假设，是实测踩过的坑：一次改动在本地看是 33.8%（以为"只是跳过"），
到 CI 才暴露成 **72.3% < 80% 的真回退**。

**本机最小可用配置**（在 `.env.local` 里；该文件被 gitignore）：

```bash
# ① 测试库 —— 六个服务都要，缺一个那个服务就验不了
#    用与 CI 同镜像同凭据的库（本机可用 docker 起一个 ci-repro-pg 监听 15432）
for s in EXECUTION PRODUCTION WORKSPACE ASSET OUTBOX; do
  echo "${s}_TEST_DATABASE_URL=postgres://shotdesigner:shotdesigner@127.0.0.1:15432/postgres?sslmode=disable"
done >> .env.local

# ② asset 的对象存储 —— 缺它 asset 的 12 个 S3 集成测试会跳过，覆盖率恒被压低
#    指向本机 minio 容器（`docker compose --profile platform up -d minio`），
#    凭据用该容器的 MINIO_ROOT_USER / MINIO_ROOT_PASSWORD
cat >> .env.local <<'ENV'
ASSET_TEST_S3_ENDPOINT=127.0.0.1:9000
ASSET_TEST_S3_ACCESS_KEY=<minio 的 MINIO_ROOT_USER>
ASSET_TEST_S3_SECRET_KEY=<minio 的 MINIO_ROOT_PASSWORD>
ENV
```

**验证是否真的生效**（应看到六个服务都给出**具体覆盖率**，而不是"跳过棘轮"）：

```bash
bash scripts/preflight.sh
# ✅ workspace 71.5%(≥52)  ✅ production 53.8%(≥50)  ✅ execution 58.0%(≥55)
# ✅ asset     82.0%(≥80)  ✅ web-bff   74.5%(≥71)  ✅ outbox-relay 64.4%(≥60)
```

**未验证 ≠ 通过**：`preflight` 会把验不了的项**显式列出**（如本地未装 `golangci-lint`）。
**"环境不具备"与"代码失败"是两件事** —— 脚本会区分：跳过原因指向本服务 DSN ⇒ 判失败；
指向其它前置条件 ⇒ 记为"未验证"并继续（不假红、也不假装通过）。

## 写测试的注意事项

- **不要依赖系统时间**：CI 跑 UTC，如果你断言"现在是下午 3 点"，本地通过、CI 红
- **不要依赖执行顺序**：每个用例自己建状态，不要共享全局变量
- **不要调真实外部 API**：用 `httptest` 假服务器 mock
- **数据库测试要隔离**：用独立 schema，用完清理

## 新功能必须带测试

新功能提交 PR 时，测试必须在同一个 PR 里。不接受"后续补测试"。
