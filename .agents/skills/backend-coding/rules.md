# 后端编码规范（全量规则）

> 定位：**services/** 下 Go 微服务编写代码时的正向规范。与 `.agents/skills/audit-ledger`、`database-migrations`、`ci-triage`（场景规则）互补。
> 规则格式：唯一 ID + 级别（MUST/SHOULD/MAY）+ 触发条件 + 正反例 + 检测方式 + 例外。MUST 进 CI、SHOULD 进评审、MAY 仅文档。
> 编号族：`BE-*`（编码）、`BE-DATA-*`（数据结构）、`CT-*`（契约）、`SEC-*`（安全）、`RV-*`（评审）。与场景 skill 不重复定义（重复项引用场景 skill）。
> 规则编号永久不变，只追加不修改。

---

## 一、总原则

1. **简单性**：标准库优先；一个文件说清不放三个包；同步写完不引入并发。
2. **显式**：错误显式处理；配置来自环境变量，无魔法常量。
3. **组合**：小接口 + 结构体组合；`internal/` 包不越界。
4. **服务边界**：一个服务一类事实；禁止跨库读写、绕过 BFF/网关。
5. **可审计**：AI 调用必须经 execution 网关写审计；密钥零硬编码。

## 二、包分层

### BE-LAYER-001 单向依赖（MUST）
- **触发**：新增 import 时
- **依赖方向**：`cmd → httpapi → 领域包(store)`，禁止反向
- **禁止**：领域包 import httpapi；httpapi 直接写 SQL；store 包 import httpapi
- **检测**：golangci-lint depguard（可配）+ 代码审查

### BE-LAYER-002 cmd 只装配（MUST）
- **触发**：写 `cmd/` 代码时
- **禁止**：业务逻辑、SQL、handler 实现
- **必须**：依赖注入 + 配置读取 + 启动/优雅关闭
- **检测**：代码审查
- **例外**：execution main.go 的 worker 分发（本质是引擎装配，保持）

### BE-LAYER-003 httpapi 只做 HTTP 语义（MUST）
- **触发**：写 `internal/httpapi/` 时
- **禁止**：SQL、领域规则判断
- **必须**：解析 → 调用领域包 → writeError/writeJSON
- **检测**：代码审查

## 三、Handler 模式

### BE-HANDLER-001 统一 Handler + Routes（MUST）
- **触发**：新增 HTTP 端点
- **必须**：方法路由（`POST /internal/v1/tasks`、`{id}` PathValue）；依赖字段注入；nil 能力注释
- **检测**：代码审查

### BE-HANDLER-002 统一错误响应（MUST）
- **触发**：返回错误时
- **必须**：`writeError(w, status, code, msg)`，`{"code","message"}`；错误码大写蛇形语义精确
- **禁止**：裸 500 无码；`http.Error` 散落
- **检测**：代码审查
- **例外**：协议约定（引擎失败走 200+{ok:false}）保持

### BE-HANDLER-003 上下文贯穿（MUST）
- **触发**：调用领域层
- **必须**：`r.Context()` 一路传递（超时/取消传播）
- **检测**：代码审查

### BE-HANDLER-004 探活端点（MUST）
- **触发**：服务提供 HTTP
- **必须**：`/live`（进程活）+ `/ready`（依赖就绪，未就绪 503）
- **检测**：CI / 代码审查

## 四、错误处理

### BE-ERR-001 显式处理（MUST）
- **触发**：任何返回 error 的调用
- **禁止**：`_ = f()` 吞错误、空 catch
- **必须**：`if err := f(); err != nil { ... }`；best-effort 清理类吞错需注释说明
- **检测**：代码审查 + errcheck linter

### BE-ERR-002 错误包装保留根因（MUST）
- **触发**：跨层返回错误
- **必须**：`fmt.Errorf("...: %w", err)`；上层只映射状态码
- **检测**：代码审查

### BE-ERR-003 失败语义分级（MUST）
- **触发**：模型网关错误处理
- **必须**：按错误码分类表分支（401/403/404/422 不重试不切换；408/409/425/429 可重试/切换；5xx/超时切换；内容安全拒绝不切换）
- **禁止**：散落 `if status == 429 || status == 500` 判断
- **检测**：代码审查

### BE-ERR-004 配置失败保留原始码（MUST）
- **触发**：失败切换场景
- **必须**：所有候选均为配置问题时，保留第一个候选原始状态码与文案
- **检测**：代码审查

## 五、数据访问（pgx）

### BE-PGX-001 参数化 + 白名单动态列（MUST）
- **触发**：写 SQL
- **禁止**：字符串拼接 SQL；动态列/排序直接拼接用户输入
- **必须**：`$N` 参数化；动态 SET 列名必须走**代码内白名单 map**（列名→SQL 片段），禁止直接拼外部输入
- **正确**：
  ```go
  var setCols = map[string]string{"title": "title = $2", "status": "status = $2"}
  col, ok := setCols[field]; if !ok { return errInvalidField }
  query := fmt.Sprintf("UPDATE episodes SET %s WHERE ...", col)
  ```
- **错误**：`fmt.Sprintf("UPDATE ... SET %s = '%s'", userField, userValue)`
- **检测**：gosec + 代码审查
- **存量**：production ruletemplate/episode/episodeasset 动态 SET 已核对为白名单（列名字面量+值参数化）并在代码内注释证明（2026-10-13）

### BE-PGX-002 rows.Err()（MUST）
- **触发**：迭代 rows 后
- **必须**：`if err := rows.Err(); err != nil { return err }`
- **检测**：代码审查

### BE-PGX-003 事务纪律（MUST）
- **触发**：多步写操作
- **必须**：pgx.Tx 包裹（Begin/Commit/Rollback）；`SET LOCAL` 做行级守卫；事务内**禁网络调用**（先提交再外部调用）
- **检测**：代码审查

### BE-PGX-004 迁移只增不改（MUST）
- **触发**：schema 变更
- **必须**：`migrations/NNN_description.sql`，号段按服务认领（execution 010-019、production 模型中心 024-039 等）
- **禁止**：修改已执行迁移；**字母后缀编号**（如 `019a/019b`——破坏纯数字序列与执行器排序）
- **检测**：CI（已校验和）+ 代码审查
- **存量**：production 已有 `019a/019b` 历史文件（不回改，后续新迁移用 020+）

### BE-PGX-005 分页 + 白名单聚合（MUST）
- **触发**：列表/聚合查询
- **必须**：limit/offset + 总数；GROUP BY 白名单维度；禁止任意列排序/分组（防注入）
- **检测**：代码审查

### BE-PGX-006 成本双口径（MUST）
- **触发**：成本字段
- **必须**：预估（cost_estimated_calls）与校准（cost_calibrated）分离；报表/预算只用校准价
- **检测**：代码审查

## 六、并发一致性

### BE-CONC-001 幂等键（MUST）
- **触发**：创建资源/异步任务
- **必须**：幂等键 + 唯一约束（execution 已有 idempotency_hash，保持）；重复请求不产生重复数据
- **检测**：集成测试

### BE-CONC-002 跨实例状态共享（MUST）
- **触发**：熔断计数/预算累计
- **禁止**：本地内存计数
- **必须**：共享存储（DB 行锁/Redis 原子操作）
- **检测**：集成测试

### BE-CONC-003 异步任务预扣结算（MUST）
- **触发**：异步任务（视频按秒计费）
- **必须**：预扣 → 执行 → 结算（成功确认/失败释放），配对账任务
- **检测**：集成测试

### BE-CONC-004 重试有上限有退避（MUST）
- **触发**：重试逻辑
- **必须**：上限 + 退避；4xx 不重试；重试写审计（request_id 关联）
- **检测**：代码审查

## 七、日志与审计

### BE-LOG-001 slog 结构化（MUST）
- **触发**：新增日志
- **必须**：`log/slog` 键值对；禁止 `log.Print` 裸文本
- **检测**：golangci-lint + 代码审查

### BE-LOG-002 密钥打码（MUST）
- **触发**：日志/响应涉及密钥
- **必须**：打码 `<REDACTED>`（`audit/redact.go`）；响应 Key 永不回传前端
- **检测**：代码审查

### BE-LOG-003 审计同步写（MUST）
- **触发**：AI 模型调用
- **必须**：写 `gateway_audit_logs`，同步不异步
- **禁止**：绕过网关直调上游
- **检测**：代码审查（audit-ledger skill）

### BE-LOG-004 不记敏感全文（MUST）
- **触发**：记录 prompt/response
- **必须**：只记摘要/元数据（长度、耗时、状态码）
- **检测**：代码审查

## 八、配置

### BE-CFG-001 环境变量（MUST）
- **触发**：配置项
- **禁止**：硬编码地址/密钥/端口
- **必须**：`os.Getenv`；新变量按服务分节追加 `.env.example`
- **检测**：代码审查

### BE-CFG-002 启动即校验（MUST）
- **触发**：服务启动
- **必须**：必填变量缺失即退出（fail-fast）
- **检测**：代码审查

### BE-CFG-003 密钥集中（MUST）
- **触发**：凭据处理
- **必须**：workspace 加密存储，execution 运行时 reveal
- **检测**：代码审查

## 九、HTTP 语义

### BE-HTTP-001 状态码语义（MUST）
- **触发**：写响应
- **必须**：2xx 成功 / 4xx 客户端 / 5xx 服务端；业务失败用语义码（协议约定除外）
- **检测**：代码审查

### BE-HTTP-002 超时与优雅关闭（MUST）
- **触发**：外部调用/服务启停
- **必须**：`http.Client{Timeout}` + ctx deadline；SIGTERM 优雅退出
- **检测**：代码审查

### BE-HTTP-003 请求体上限（SHOULD）
- **触发**：接收大 body
- **必须**：`http.MaxBytesReader` 设上限
- **检测**：代码审查

## 十、性能（BE-PERF）

### BE-PERF-001 索引先行（MUST）
- **触发**：新增查询/迁移
- **必须**：常用查询列（WHERE/ORDER BY/JOIN）有索引；迁移文件含 CREATE INDEX + COMMENT
- **检测**：迁移审查 + 慢查询日志
- **例外**：小表（<1k 行）可不建，迁移中注释说明

### BE-PERF-002 防 N+1（MUST）
- **触发**：循环内查询
- **禁止**：for 循环内逐条 QueryRow（N+1）
- **必须**：批量查询（`WHERE id = ANY($1)`）+ 内存分组
- **检测**：代码审查

### BE-PERF-003 聚合查询走 DB（MUST）
- **触发**：报表/统计
- **必须**：GROUP BY 聚合在 DB 完成，不拉全量内存计算
- **检测**：代码审查

### BE-PERF-004 响应体最小化（SHOULD）
- **触发**：列表/详情响应
- **必须**：只返回页面所需字段（DTO 裁剪），大字段（payload/response）默认不随列表返回
- **检测**：代码审查

## 十一、测试

### BE-TEST-001 同包测试 + fake 注入（MUST）
- **触发**：handler/store 测试
- **必须**：`package httpapi` 同包；fakeStore/httptest，不依赖数据库
- **检测**：代码审查

### BE-TEST-002 纯函数必有单测（MUST）
- **触发**：纯函数（auditFilterFrom 类）
- **必须**：单测覆盖（曾有纯函数零覆盖事故）
- **检测**：覆盖率报告

### BE-TEST-003 集成测试不 SKIP（MUST）
- **触发**：数据库行为测试
- **必须**：有测试库就执行；CI 守卫 SKIP 变失败
- **检测**：CI（ci-triage skill）

### BE-TEST-004 覆盖率棘轮（MUST）
- **触发**：提交代码
- **必须**：不降线（`.github/coverage-baseline.txt`）；核心逻辑必有测试
- **检测**：CI 6 道关

### BE-TEST-005 判据四要素（MUST）
- **触发**：声明「已通过/已验证」
- **必须**：判据/对象/时点/例外 四要素齐全；禁止 `&&`/`-q`/`2>/dev/null` 推断成功
- **检测**：代码审查（判据必须写全「判据/对象/时点/例外」，只写「已通过」而无证据即不合规）

---

# 数据结构规范（BE-DATA-*）

## 字段命名与类型

### BE-DATA-001 命名统一（MUST）
- **触发**：建表/定义字段
- **必须**：DB `snake_case`、JSON `camelCase`（或契约口径）、Go `PascalCase`；字段名自解释
- **检测**：迁移审查 + 代码审查

### BE-DATA-002 时间与金额（MUST）
- **触发**：时间/金额字段
- **禁止**：无时区时间字符串（`timestamp without time zone`、`string` 存时间）
- **必须**：时间 `timestamptz`（UTC 存储，展示时区在边界转换）；金额 `numeric/decimal` 或**最小单位整数**（如毫厘/分）
- **检测**：迁移 lint + 代码审查
- **例外（过渡）**：execution 存量成本 `float64`——随 ADR-004 价格校准推进改为 decimal，**新字段禁止 float64 金额**

### BE-DATA-003 状态用状态机（MUST）
- **触发**：对象状态字段
- **禁止**：多个布尔表达状态（`is_active` + `is_pending` + `is_done` 并存）
- **必须**：单一 `status` 字段 + 显式状态转移表；状态枚举 Go 常量定义
- **正确**（production 已有此模式）：
  ```go
  type ProjectStatus string
  const (
      ProjectDraft   ProjectStatus = "draft"
      ProjectActive  ProjectStatus = "active"
      ProjectDone    ProjectStatus = "done"
  )
  ```
- **检测**：迁移审查 + 代码审查

### BE-DATA-004 DTO 与实体分离（MUST）
- **触发**：API 响应
- **禁止**：ORM/领域实体直接 `json.Marshal` 返回（字段暴露不可控、口径漂移）
- **必须**：独立 DTO 结构 + 显式字段映射（`ToDTO()` 方法或映射函数）
- **检测**：代码审查

### BE-DATA-005 唯一约束表达业务不变量（MUST）
- **触发**：业务唯一性（幂等、渠道模型去重、角色归属）
- **必须**：DB 唯一索引表达（不只靠代码判断——并发下代码判断会竞态）
- **正确**：`UNIQUE(workspace_id, channel_id, model_id)`、幂等 `(idempotency_key, workspace_id)`
- **检测**：迁移审查

### BE-DATA-006 迁移只增不改 + 纯数字编号（MUST）
- **触发**：schema 变更
- **禁止**：修改已执行迁移；**字母后缀**（`019a`）破坏执行器排序
- **必须**：`migrations/NNN_description.sql` 纯数字递增；号段按服务认领（见 `database-migrations` skill）；破坏性变更走 expand-contract（新增→双写→回填→切读→清理）
- **检测**：CI（校验和）+ 迁移审查

### BE-DATA-007 软删除用 deleted_at（SHOULD）
- **触发**：可恢复删除
- **必须**：`deleted_at timestamptz NULL`（查询默认过滤），**禁止**布尔 `is_deleted` 叠加状态布尔
- **检测**：迁移审查

## 错误码体系

### BE-ERR-005 错误码集中定义（MUST）
- **触发**：新错误码
- **必须**：按服务集中定义（如 `internal/httpapi/errors.go` 常量或共享包），禁止散落字符串字面量
- **格式**：大写蛇形语义精确（`NOT_READY`、`INVALID_UNTIL`、`MISSING_PARAM`），带 HTTP 状态码映射
- **检测**：代码审查

### BE-ERR-006 retryable 语义（MUST）
- **触发**：定义错误响应
- **必须**：明确可重试边界（401 刷新 token 一次后重试；403/404/422 不重试；429 尊重 Retry-After；5xx 仅幂等请求重试）
- **检测**：代码审查

## 新表设计检查清单（建表前逐项过）

- [ ] 命名：snake_case、自解释、无缩写歧义
- [ ] 时间：`timestamptz` UTC；`created_at/updated_at` 必备；审计对象加 `deleted_at`（如需软删）
- [ ] 金额：`numeric`/最小单位整数（禁 float64 新字段）
- [ ] 状态：单一 status 枚举 + 转移表（禁布尔堆叠）
- [ ] 唯一性：业务不变量有 DB 唯一索引
- [ ] 外键与索引：常用查询列有索引；外键方向正确（服务边界内）
- [ ] 迁移：纯数字编号、号段已认领、只增不改、含 COMMENT
- [ ] 回滚：破坏性变更走 expand-contract，不直接删列

---

# 契约层规范（CT-*）

## 总原则

1. **契约先行**：先定接口（字段、错误码、状态），再写前后端实现。禁止「先写代码后补契约」。
2. **单一事实源**：`openapi/bff.yaml` 是 BFF 契约的权威；前端类型、后端 DTO 都是它的**派生**，不允许出现第三个事实源。
3. **字段口径统一**：传输层字段用后端口径（snake_case 如 `style_id`），前端 UI 边界才转 camelCase；禁止前端自造不一致字段名。
4. **错误码共享**：错误码在契约中定义，前后端引用同一枚举，禁止各自硬编码字符串。

## 规则族

### CT-001 新增/修改 API 先改契约（MUST）
- **触发**：新增端点、改字段、改错误码
- **禁止**：先改 client.ts / Go handler，后补 openapi
- **必须**：先改 `openapi/bff.yaml` → 同步前端类型 → 同步后端 DTO → 实现
- **检测**：PR 审查 + 契约 diff 检查（可加 CI）

### CT-002 字段命名与映射（MUST）
- **触发**：定义 API 字段
- **必须**：
  - 传输层：后端口径 snake_case（`default_text_model`、`current_source_version`）
  - 前端 `types/`：保持 snake_case 直传，仅在 UI 组件边界转 camelCase
  - Go DTO：JSON tag 与契约一致（`json:"style_id"`）
- **禁止**：前端把服务端字段改名、添加契约外字段
- **检测**：代码审查

### CT-003 错误码在契约定义（MUST）
- **触发**：新错误场景
- **必须**：在契约/共享错误码表中定义（大写蛇形语义精确），前端 `ApiError.code` 与后端 `writeError` code 同源
- **禁止**：前后端各自硬编码错误码字符串
- **检测**：代码审查（对照错误码表）

### CT-004 状态枚举共享（MUST）
- **触发**：对象状态字段
- **必须**：状态枚举在契约定义（`draft/active/done`…），前后端引用同值；禁前端硬编码状态字符串判断
- **检测**：代码审查

### CT-005 破坏性变更治理（MUST）
- **触发**：修改已有字段
- **禁止**：直接删字段、改字段类型、改枚举值（会造成前后端不同步上线）
- **必须**：新增可选字段（向前兼容）或走版本化；删除走 expand-contract
- **检测**：PR 审查（后续可加 oasdiff）

### CT-006 响应形状稳定（SHOULD）
- **触发**：定义列表/详情响应
- **必须**：稳定 envelope（如 `{items, total}`），不随场景变形状；字段缺失有兜底（前端 optional + 守卫）

## 前后端类型同步流程（新 API 标准动作序列）

```
1. 需求 → 2. openapi/bff.yaml 定义端点/字段/错误码/状态枚举
   → 3. 后端实现（Go DTO + handler，JSON tag 对齐契约）
   → 4. 前端 types/ 或 client.ts 更新类型（与契约逐字段核对）
   → 5. 前端实现页面/调用
   → 6. PR 附「契约变更说明」（改了什么字段/码，前后端是否同步）
```

> 6 步缺一不可。任何一步跳过 = 违反 CT-001，PR 不通过。

## 错误码表（全仓共享，追加式）

> 编号永久不变，只追加。前端 `ApiError.code` 与后端 `writeError` code 必须取自此表。

| 错误码 | HTTP | 语义 | retryable |
|---|---|---|---|
| `NOT_READY` | 503 | 服务依赖未就绪 | false |
| `MISSING_PARAM` | 422 | 请求缺少必填参数 | false |
| `INVALID_UNTIL` | 422 | 时间参数非法 | false |
| `NOT_FOUND` | 404 | 资源不存在 | false |
| `UNAUTHORIZED` | 401 | 未认证/凭据失效 | 刷新后重试 |
| `FORBIDDEN` | 403 | 无权限 | false |
| `CHANNEL_UNAVAILABLE` | 502 | 渠道不可用（熔断/探活失败） | true |
| `QUOTA_EXCEEDED` | 429 | 预算/额度超限 | true（尊重 Retry-After） |
| `MODEL_NOT_FOUND` | 422 | 逻辑模型无可用渠道 | false |
| `INTERNAL` | 500 | 未预期服务端错误 | 幂等可重试 |

- 新错误码：在 openapi 契约 + 本表同时追加；前端使用处引用，禁散落字符串。

## 契约生成化路线（分阶段，不阻塞当前开发）

| 阶段 | 动作 | 前置 | 状态 |
|---|---|---|---|
| P0（现在） | 契约先行纪律（CT-001~006）+ 错误码表 + 人工同步 | 无 | **立即生效** |
| P1 | openapi-typescript 生成前端类型（client.ts 手写 → 生成） | CI 稳定 | 待排期 |
| P2 | oapi-codegen 生成 Go DTO + spectral lint + oasdiff | 契约完整度 | 待排期 |

> 契约先行纪律**不依赖生成工具即可生效**——新 API 一律按流程走。

---

# 安全编码规范（SEC-*）

> 前后端通用安全红线（OWASP 10 映射到本项目）。与 audit-ledger skill（审计/密钥打码）互补。

## 一、注入防护（最高优先级）

### SEC-001 SQL 注入（MUST）
- **触发**：写 SQL
- **禁止**：字符串拼接 SQL、拼接用户输入到列名/排序/分组
- **必须**：`$N` 参数化；动态列名走代码内白名单 map
- **检测**：gosec + 代码审查

### SEC-002 XSS 防护（MUST）
- **触发**：渲染用户输入（脚本/立绘/提示词/评论等）
- **禁止**：`dangerouslySetInnerHTML` 渲染未净化用户内容
- **必须**：默认转义；确需富文本时用净化库（DOMPurify 等）白名单；prompt 等纯文本用 `<pre>`/textContent
- **检测**：ESLint `react/no-danger` + 代码审查

### SEC-003 命令/路径注入（MUST）
- **触发**：后端执行系统命令、文件路径、URL 拼接
- **禁止**：用户输入直接拼命令/路径/URL
- **必须**：参数化/白名单/路径规范化（`filepath.Join` + 清理 `..`）
- **检测**：gosec + 代码审查

### SEC-004 URL/重定向校验（MUST）
- **触发**：前端跳转、后端 302
- **必须**：只允许白名单协议与域名（`https://` 内部域）；禁止 `javascript:` 协议跳转
- **检测**：代码审查

## 二、敏感数据

### SEC-005 密钥零落盘（MUST）
- **触发**：API Key/Token/密钥
- **禁止**：代码/日志/prompt 写真实密钥；前端存储 token 用内存变量（非 localStorage 明文）
- **必须**：workspace 加密存储；日志打码 `<REDACTED>`
- **检测**：代码审查 + audit-ledger

### SEC-006 审计日志脱敏（MUST）
- **触发**：记录 prompt/response/用户数据
- **必须**：只记摘要/元数据（长度、耗时、状态码），不记全文敏感内容
- **检测**：代码审查（BE-LOG-004）

### SEC-007 用户数据最小化（MUST）
- **触发**：处理用户数据
- **禁止**：读取/导出生产用户数据；记录不必要的个人字段
- **必须**：按需最小化 + 展示脱敏（手机号/ID 打码）
- **检测**：代码审查

## 三、输入与输出

### SEC-008 输入校验（MUST）
- **触发**：后端接收参数/前端表单
- **必须**：长度/格式/枚举白名单校验；超限拒绝而非截断静默
- **检测**：代码审查

### SEC-009 请求体上限（MUST）
- **触发**：接收大 body（上传/长文本）
- **必须**：后端 `http.MaxBytesReader` 设上限；前端上传组件 `maxSize` 校验
- **检测**：代码审查

### SEC-010 防暴力/滥用（SHOULD）
- **触发**：登录/探活/批量接口
- **必须**：限流（execution quota 已有）；探活频率上限
- **检测**：代码审查

## 四、依赖与供应链

### SEC-011 依赖安全（MUST）
- **触发**：引入新依赖/升级依赖
- **禁止**：已知漏洞版本（npm audit / govulncheck 报红）、来源不明的包
- **必须**：依赖升级走 Dependabot PR + CI 安全扫描；新依赖说明用途
- **检测**：CI Security Scan + npm audit

### SEC-012 无环境敏感信息入仓（MUST）
- **触发**：提交配置/示例文件
- **禁止**：`.env` 真实密钥入仓；测试凭证、内网地址硬编码
- **必须**：`.env.example` 占位符；真实密钥走环境变量注入
- **检测**：CI + 代码审查

## 五、OWASP 10 映射（自查表）

| OWASP 项 | 本项目对应规则 |
|---|---|
| 注入 | SEC-001/002/003 |
| 失效认证 | UNAUTHORIZED 错误码 + 凭据集中管理（workspace） |
| 敏感数据泄露 | SEC-005/006/007 |
| XML 外部实体 | 不使用 XML 解析（JSON 为主） |
| 失效访问控制 | FORBIDDEN + 角色权限矩阵（模型中心） |
| 安全配置错误 | BE-CFG（环境变量 fail-fast） |
| XSS | SEC-002 |
| 不安全反序列化 | JSON 解析加类型守卫（不 eval/不 unsafe） |
| 已知漏洞组件 | SEC-011 |
| 日志/监控不足 | BE-LOG（slog + 审计同步写） |

---

# 评审与自审清单（RV-*）

> PR 合入前统一评审标准——Google 工程实践落地版。评审目的是保证代码库长期健康度持续提升；自动化能查的交工具，人（AI）查设计与边界。

## 评审分级（判定代码能否合入）

| 级别 | 含义 | 处置 |
|---|---|---|
| **阻断项（MUST）** | 违反 MUST 规则 / 门禁不绿 / 安全红线 | **必须修复后合入**，无例外 |
| **建议项（SHOULD）** | 违反 SHOULD 规则 / 风格偏好 | 可合入但须在 PR 中说明理由 |
| **风格项（MAY）** | 自动化格式化差异 | 交给工具（prettier/gofmt），不人工争论 |

> 引用规则必须说「违反 XX-XXX」，不许用「我觉得这里不好」——技术事实与持久原则优先，个人品味是小事。

## PR 自审清单（AI 开 PR 前逐项过）

- [ ] **门禁绿**：前端 `npm run gate` GATE=0；后端 `go build/test -race/vet` 全绿；CI 6 道关通过
- [ ] **范围对**：只含本任务文件；`git diff --cached --name-only` 核对无他人文件（禁 `git add -A`）
- [ ] **规范命中**：改动涉及前端 → 对照 FE-*；后端 → BE-*；契约 → CT-*；安全 → SEC-*（违反即阻断）
- [ ] **反模式自查**：命中反模式速查任一 → 修复
- [ ] **三态齐全**：数据请求有 loading/error/empty（FE-API-002）
- [ ] **契约同步**：新 API/字段/错误码 → openapi 契约已先行（CT-001），前后端同步
- [ ] **测试覆盖**：新纯函数有测试（FE-TEST-001 / BE-TEST-002）；核心逻辑不裸奔
- [ ] **安全自查**：无注入/XSS/密钥泄露（SEC-*）
- [ ] **判据四要素**：PR 描述中的「已验证/已通过」注明 判据/对象/时点/例外
- [ ] **PR 模板完整**：变更概述 + 详情 + 测试结果 + 风险说明

## 评审他人 PR 清单（收到 PR 时按序过）

1. **先看门禁**：CI 是否全绿（判据用 API 的 `steps[].conclusion`，不是日志文本）
2. **再看范围**：diff 是否只含本任务；有无越界文件/调试残留/console.log
3. **然后审设计与边界**：
   - 组件：props 契约、三态、零业务依赖（FE-COMP）
   - 状态：selector 切片、persist 白名单（FE-STATE）
   - 后端：分层、错误码、rows.Err、事务、幂等（BE-*）
   - 契约：字段口径、错误码共享（CT-*）
   - 安全：注入/XSS/密钥（SEC-*）
4. **最后看测试**：新逻辑有无测试；测试是否依赖本地时区/被 SKIP

## 评审话术规范

- 阻断项：`[阻断] 违反 FE-TS-001（any），请改为类型守卫。位置：...`
- 建议项：`[建议] FE-STYLE-004 建议用语义 token，当前硬编码色值。可合入，说明理由即可`
- 禁止：无规则依据的「我觉得」「最好这样」；允许：指出事实问题 + 引用规则 + 具体位置

---

# 反模式速查（后端，AI 遇到立即停止并纠正）

| 反模式 | 正确做法 |
|---|---|
| `fmt.Sprintf("... %s ...", userInput)` | `$N` 参数化 + 白名单动态列 |
| `_ = f()` 吞错误（业务路径） | 显式处理 + 注释 |
| 裸 500 无错误码 | `writeError(w, 500, "INTERNAL", msg)` |
| rows 循环不查 Err | 循环后 `rows.Err()` |
| 日志打完整 Key | redact `<REDACTED>` |
| 异步写审计 | 同步写 gateway_audit_logs |
| 迁移加字母后缀 `019a` | 纯数字序列 `020`+ |
| 本地内存熔断计数 | 共享存储 |
| 无超时上游调用 | `http.Client{Timeout}` |
| 事务内网络调用 | 先提交再外部调用 |
| ORM 实体直接 json 返回 | DTO 显式映射（BE-DATA-004） |
| `float64` 金额 | `numeric` / 最小单位整数（BE-DATA-002） |
| `string` 存无时区时间 | `timestamptz` UTC |
| `is_active + is_pending + is_done` | 单一 status 状态机 |
| 唯一性只靠代码判断 | DB 唯一索引 |
| 错误码散落字符串 | 集中 `errors.go`（BE-ERR-005） |
| 改已执行迁移 | 新迁移 + expand-contract |
| `dangerouslySetInnerHTML` 渲染用户内容 | 转义/DOMPurify 净化（SEC-002） |
| 前端 localStorage 存 token | 内存变量/安全存储（SEC-005） |
| 已知漏洞依赖 | 升级或换库（SEC-011） |
| 真实密钥入 .env.example | 占位符（SEC-012） |
| 门禁没绿就说「本地过了」 | CI 全绿才算；本地绿 ≠ CI 绿（RV-*） |
| 「代码风格」争论不休 | 交给 prettier/gofmt，不人工吵（RV-*） |
| 凭感觉拦 PR | 引用具体规则编号 + 位置（RV-*） |

---

# 存量违规状态（2026-10-13 已清零）

> 历史存量违规（outbox-relay main.go:151 吞错、production 3 处动态 SET 未注释）已于 2026-10-13 整改完成：
> - outbox-relay 吞错改为显式处理 + 失败可见日志；
> - 3 处动态 SET 已核对为白名单模式并在代码内注释证明；
> - execution 存量 `float64` 成本字段、production `019a/019b` 迁移为历史遗留，不回改；**新代码零例外满足全部 MUST**。
