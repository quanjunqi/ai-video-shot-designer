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

## 写测试的注意事项

- **不要依赖系统时间**：CI 跑 UTC，如果你断言"现在是下午 3 点"，本地通过、CI 红
- **不要依赖执行顺序**：每个用例自己建状态，不要共享全局变量
- **不要调真实外部 API**：用 `httptest` 假服务器 mock
- **数据库测试要隔离**：用独立 schema，用完清理

## 新功能必须带测试

新功能提交 PR 时，测试必须在同一个 PR 里。不接受"后续补测试"。
