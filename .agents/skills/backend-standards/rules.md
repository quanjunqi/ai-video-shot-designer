# 后端代码设计规范 · 完整规则

> 本文件是 `SKILL.md` 的完整规则集。规则采用模板化格式：
> 级别（MUST/SHOULD/MAY）+ 触发条件 + 正反例 + 检测方式。
> 维护：新增规则先进"观察期"（仅警告），验证有效后升级为 MUST。

## 一、分层与文件组织（高内聚低耦合）

### BE-LAYER-001 单向依赖
**级别**: MUST
**触发条件**: 创建新包或添加 import 时
**依赖方向**: `cmd → httpapi → usecase → domain ← store`
**禁止**: domain 包 import httpapi/pgx/store；httpapi 包直接调 store；store 包 import httpapi
**必须**: 依赖方向用 depguard 在 CI 强制
**检测**: golangci-lint depguard

### BE-LAYER-002 cmd 只装配（薄 cmd）
**级别**: MUST
**触发条件**: 编写 `cmd/` 下的代码时
**禁止**: 业务逻辑、SQL 查询、HTTP handler 实现、worker 循环
**必须**: 只做依赖注入、配置读取、server 启动；装配校验收敛到构造函数（New 返回 error）
**正确模式**: `cmd/server/main.go` ≤ 50 行：读 env → `New(cfg)` → `ListenAndServe`
**错误模式**: 890 行 main.go 堆 19 个代理 handler（web-bff 历史事故）
**检测**: 覆盖率棘轮（fail-closed）+ 代码审查

### BE-LAYER-003 业务收敛 internal
**级别**: MUST
**触发条件**: 新增服务代码时
**必须**: 业务代码收敛在 `services/<svc>/internal/<pkg>/`；**每个服务必须有 internal/**
**禁止**: 以"薄服务/无 internal"为由把业务留在 cmd/——结构违规由门禁直接告警（覆盖率无法测量），不做例外
**检测**: check-coverage.sh（无条件排除 cmd/）

### BE-SIZE-001 单文件 ≤ 500 行
**级别**: MUST（存量已拆分清零）
**触发条件**: 新增或修改 Go 文件时
**必须**: 单个文件 ≤ 500 行；超限按域拆分为同包多文件
**正确模式**: handler 按域拆（handlers_catalog.go / handlers_episodes.go / handlers_rules.go / handlers_characters.go）；engine/store 按职责拆（request.go / params.go / query.go / stats.go）
**禁止**: 上帝文件（handler.go 1345 行 / store.go 719 行 属历史事故，已拆分）
**检测**: 代码审查 + PR 审查

### BE-LAYER-004 测试随业务迁移
**级别**: MUST
**触发条件**: 迁移业务代码时
**必须**: 测试文件 git mv 到业务所在包（同包测试），引用随迁修正
**禁止**: 测试留在 cmd/ 测 internal 代码（跨包测试破坏包边界语义）
**检测**: 代码审查

## 二、Handler 与错误

### BE-HANDLER-001 统一 writeError
**级别**: MUST
**触发条件**: 返回错误响应时
**必须**: 使用统一 `writeError(w, status, code, message)`，输出 `{code, message}` JSON
**禁止**: 手写 `http.Error`、自定义错误结构
**检测**: 代码审查

### BE-ERR-001 错误码共享生成
**级别**: MUST
**触发条件**: 定义或使用错误码时
**禁止**: 硬编码字符串错误码、硬编码 HTTP 状态码判断
**必须**: 从契约生成源导入
**检测**: CI 生成同步检查

### BE-ERR-002 retryable 分类
**级别**: MUST
**触发条件**: 定义 API 错误响应时
**必须**: 标注 `retryable`：401 刷新重试一次；403/404/422 false；409 提示刷新；429 true（尊重 Retry-After）；5xx 仅幂等请求 true
**检测**: 代码审查

## 三、数据与并发

### BE-DATA-001 命名统一
**级别**: MUST
**必须**: DB snake_case、JSON camelCase、Go PascalCase
**检测**: sqlc 生成 + 代码审查

### BE-DATA-002 时间/金额
**级别**: MUST
**禁止**: 无时区时间字符串、float 金额
**必须**: timestamptz UTC、decimal 或最小单位整数
**检测**: migration lint

### BE-DATA-003 单一状态机
**级别**: MUST
**禁止**: 多个布尔表达状态（is_active + is_pending）
**必须**: 单一 status 字段 + 状态转移表
**检测**: 代码审查

### BE-CONC-001 幂等键
**级别**: MUST
**触发条件**: 创建资源、支付、Webhook 等非幂等操作
**必须**: 客户端生成 Idempotency-Key，服务端去重表 + 唯一约束
**检测**: 集成测试

### BE-CONC-002 事务内禁网络调用
**级别**: MUST
**禁止**: 事务内调用外部 API、发消息、写文件
**必须**: 先完成 DB 操作提交事务，再做外部调用
**检测**: 代码审查

## 四、反模式速查（AI 遇到立即停止并纠正）

- ❌ cmd/main.go 里写业务逻辑 / SQL / handler（必须 ≤ 50 行装配）
- ❌ 服务没有 internal/（结构违规，覆盖率门禁会告警）
- ❌ 单文件超过 500 行（必须按域拆分）
- ❌ ORM 实体直接 json.Marshal 返回（必须 DTO 映射）
- ❌ `is_deleted`/`is_active`/`is_pending` 多个布尔状态
- ❌ float64 存金额、string 存时间无时区
- ❌ 修改已提交的 migration 文件
- ❌ 事务内 http.Get / redis.Publish
- ❌ 无 rows.Err() 检查
- ❌ 无幂等键的 POST 创建接口
- ❌ 日志输出密钥/token/PII
