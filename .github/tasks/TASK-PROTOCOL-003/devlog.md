# TASK-PROTOCOL-003 开发日志

> 开发过程的事实源：**动作 / 证据 / 决策 / 阻塞** 四类条目，随开发同步记录。
> 规则：AC-010（`.agents/skills/acceptance-checklist/SKILL.md`）。**开工即建，随开发追加，PR 前完成；禁止交付前一次性补写。**

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [TASK-PROTOCOL-003/task.md](task.md) |
| 验收清单 | [TASK-PROTOCOL-003/acceptance.md](acceptance.md) |
| 分支 | `feature/protocol-generator-2026-10-17` |
| PR | #<待开> |
| 开工 | 2026-10-17 00:55（本地） |
| 完成 | 待填 |
| 开发者 | AI Agent（会话 m_0cwRd4Q1hew） |

## 执行轨迹（正序；每个动作一条）

### 2026-10-17 00:55 探查
- **动作**：确认 MODEL-006 剩余判据（1/7/8/9/12）依赖 Owner 数据/决策 ⇒ 下一张卡选 VOZEB 三件套之三（自动协议生成）。探测真实上游文档可获取性：PearAPI /openapi.json = SPA HTML（无规范）；MiniMax = SPA；**GitHub raw openai/openai-openapi master openapi.yaml = HTTP 200（OpenAI 官方 OpenAPI 3.1，4.1MB）**。
- **证据**：/tmp/openai_openapi.yaml（openapi: 3.1.0 / info.version 2.3.0）；端点 /chat/completions（requestBody→CreateChatCompletionRequest）、/images/generations（→CreateImageRequest）；CreateImageRequest props 含 model/prompt/n/size/quality/response_format（= 注册表 openai_img params）；CreateChatCompletionRequest = allOf 组合；**漂移证据：pt_builtin_openai_video 只在 DB 不在注册表**（grep -c = 0，DB 行 061 实证）。
- **决策**：D-001~D-006（零依赖解析 / $ref 文件内 / allOf 合并 oneOf 首分支 / basePath 注入 / capabilities+param_mapping 不自动生成 / response_extract 保守推导）。

### 2026-10-17 01:00 立卡
- **动作**：建 `.github/tasks/TASK-PROTOCOL-003/` 四件套 + 新分支 `feature/protocol-generator-2026-10-17`。
- **证据**：task.md 6 条验收判据 + 6 条决策；fixture 生成脚本（BFS 裁剪 88 schema 140KB）。

## 决策记录 D

| 编号 | 主题 | 选项 | 选择 | 理由 | 时机 |
|---|---|---|---|---|---|
| D-001 | 解析器依赖 | A.引入 kin-openapi / B.零依赖手写 | B | 只需确定性结构提取；避免大依赖 | 探查 |
| D-002 | $ref 解析 | A.支持跨文件 / B.仅文件内，跨文件报错 | B | 单文件是发布常态；跨文件报错不静默 | 探查 |
| D-003 | allOf/oneOf/anyOf | A.全展开 / B.allOf 合并 + oneOf 取首含 properties 分支 | B | 确定性：同输入同输出 | 探查 |
| D-004 | basePath | A.servers 提取 / B.调用方注入 | servers 优先，缺省注入 | OpenAI 官方 paths 无 /v1 前缀 | 探查 |
| D-005 | 生成范围 | A.全生成 / B.结构生成 + capabilities/param_mapping 留人审 | B | mode 语义需人审；param_mapping 需实测 | 探查 |
| D-006 | response_extract | A.深层递归 / B.顶层+数组一层 | B | 确定性 + 保守：不猜深层语义键 | 探查 |

## 验证记录 V

| 编号 | 对应验收判据 | 命令/方式 | 结果 | 证据位置 |
|---|---|---|---|---|
| V-001 | 判据 1 | 单测：Parse $ref/allOf/oneOf 确定性（同输入两次输出一致） | ✅ TestParseDeterministic 等 10 单测全绿；修复 3 处确定性破坏（map 遍历随机 → 字母序排序） | 本日志 |
| V-002 | 判据 2 | openai_fixture.json 头部来源注释 | ✅ x-source 字段（openai/openai-openapi master，2026-10-16） | testdata/ |
| V-003 | 判据 3/4 | Generate(chat)/Generate(images) 断言 vs 注册表键集 | ✅ chat 14 键 ⊇、images model/prompt/n/size/quality/response_format 全命中——官方文档独立验证手写定义零臆测 | generate_test.go |
| V-004 | 判据 5 | 输出不含 capabilities/param_mapping 推测值；含待审查标记 | ✅ Template 结构无这两字段（编译期保证）+ ReviewNotes 3 条 + TestGenerateNoInference | protocolgen 单测 |
| V-005 | 判据 6 | production build/test -race/vet + file-size + 台账门禁 | ✅ build/test -race/vet/gofmt 全绿；file-size 0 超标；check-task-ledger 通过 | 本日志 |

## 阻塞与解法 B

| 编号 | 阻塞 | 根因 | 解法 | 复用教训 |
|---|---|---|---|---|
| — | — | — | — | — |

## 纪律自检（对照 `.agents` 规则，逐项留证据）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 先本地测试/验证再 commit | ✅ | V-001~V-005 全绿后提交 |
| 按路径 add（禁 `git add -A`） | ✅ | 提交时按路径 add |
| 只改点名范围（未越界） | ✅ | 仅 protocolgen/ + cmd/protocol-gen + docs + 台账 |
| 验收清单逐项勾对（AC-004/005） | ✅ | acceptance.md 6/6 |
| GATE / 后端门禁全绿 | ✅ | V-005；CI 待跑 |
| 台账同步（状态/PR 号） | ✅ | 三方一致；pr=#<待开> |
| 迁移只增不改 / 号段合规 | ✅ | 本卡无迁移 |

## 复盘（收尾时写）

- **做得好的**：
- **可改进的**：
- **遗留/后续**：
