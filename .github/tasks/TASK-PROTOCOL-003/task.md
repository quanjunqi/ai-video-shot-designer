---
taskId: TASK-PROTOCOL-003
status: 进行中
priority: P1（协议层的自动化补刀——VOZEB 三件套之三「从上游文档确定性解析生成协议」）
pr: "#<待开>"
criteria: 6
criteriaPassed: 0
depends_on: 不依赖 Owner 数据口径（输入 = OpenAI 官方 OpenAPI 3.1 公开规范）
---

# TASK-PROTOCOL-003：协议模板生成器（OpenAPI 规范 → 协议定义，确定性生成）

> **来源**：VOZEB-PRO 对比结论三件套之三。VOZEB 更强项 = 「从上游文档确定性解析生成协议」；
> 我方现状 = 9 个 builtin 协议模板全部**手写**（protocol_registry.go + DB 行）——手写的风险 = 臆测
> （064 教训 / 061 证据分级精神：无依据不填）。
> 本卡 = **用上游官方 OpenAPI 规范作为确定性输入，生成器输出协议定义**，让协议定义可追溯、可验证。

## 目标

一句话：**实现「OpenAPI 3.x 规范 → ProtocolTemplate 定义」的确定性生成器（解析 + 单测 + CLI + 接入 SOP），
并用 OpenAI 官方 OpenAPI 3.1 规范独立验证既有 openai / openai_img 手写定义的正确性。**

## 关键事实（探查实证）

1. **独立上游输入已取得**：OpenAI 官方 OpenAPI 3.1 规范
   （GitHub `openai/openai-openapi` 官方仓库 master 分支，2026-10-16 拉取，`openapi: 3.1.0` / `info.version 2.3.0`，4.1MB）。
   目标端点：`/chat/completions`（POST，requestBody→CreateChatCompletionRequest）、
   `/images/generations`（POST，requestBody→CreateImageRequest）。
2. **OpenAI 官方字段 vs 我方注册表（独立验证点）**：
   - CreateImageRequest props = prompt/model/n/quality/response_format/size/... ——
     **pt_builtin_openai_img 的 params（model/prompt/n/size/quality/response_format）全部在官方字段内** ⇒ 手写定义可被官方文档独立验证。
   - CreateChatCompletionRequest = allOf[CreateModelResponseProperties + 直接 properties(messages/model/.../tools/...)]。
3. **漂移证据（顺带发现，SOP 记录）**：`pt_builtin_openai_video` **只在 DB、不在注册表 Go 代码**
   （grep -c = 0；DB 行 061 实证过 pollPath=/v1/videos/{id}）。协议定义来源不统一 = 漂移面。
4. **真实上游（PearAPI/MiniMax）不提供静态 OpenAPI 文件**（SPA 渲染）——生成器输入形态 = OpenAPI 3.x JSON
   （上游提供时直接用；不提供时由「端点实证 + 官方文档核读」整理成规范描述后生成，见 SOP）。

## 设计决策

| 编号 | 主题 | 选择 | 理由 |
|---|---|---|---|
| D-001 | 解析器依赖 | **零外部依赖**（encoding/json + 手写解析） | 只需提取确定性结构（paths/method/params/responses），完整 OpenAPI 语义用不上；避免引入大依赖 |
| D-002 | $ref 解析 | 支持**文件内** `#/components/schemas/...`；跨文件 ref 报错 | 单文件 OpenAPI 是发布常态；跨文件 = 未支持（报错不静默） |
| D-003 | allOf/oneOf/anyOf | allOf 合并（properties 并集 + required 并集）；oneOf/anyOf 取**第一个含 properties 的分支**，其余跳过并记录 | 确定性规则：同一输入 → 同一输出；OpenAI 响应 oneOf 分支取首个可解析者 |
| D-004 | basePath | 从 servers[0].url 提取路径段；缺省由调用方注入（opts.BasePath） | OpenAI 官方 paths 无 `/v1` 前缀，我方 RequestPath 需要 `/v1/chat/completions` |
| D-005 | 生成范围 | method/request_path/params/required/response_extract 确定性生成；**capabilities 与 param_mapping 不自动生成**（输出标注「待审查」） | capabilities = mode 语义需人审（061 证据分级）；param_mapping 需实测（无依据不填） |
| D-006 | response_extract 推导 | 响应 schema 顶层 properties + 数组 items 一层：`data.items.url` → `data.0.url`；嵌套更深不自动（标注待审查） | 确定性 + 保守：不猜深层语义键 |

## 范围

### 本期
1. `services/production/internal/protocolgen/`：Parse（OpenAPI JSON → 操作）+ Generate（操作 → Template）+ 单测
2. `testdata/openai_fixture.json`：OpenAI 官方 OpenAPI 目标端点子图（BFS 裁剪 88 schema，140KB），**含来源注释**
3. `services/production/cmd/protocol-gen/`：CLI（读 OpenAPI 文件 → 输出模板定义 JSON；main ≤50 行）
4. `docs/how-to/protocol-onboarding.md`：协议接入 SOP（获取上游规范 → 生成 → 审查 → 迁移/API 落库）
5. **断言**：Generate(chat) / Generate(images) 与注册表 pt_builtin_openai / openai_img 结构一致
   （官方文档独立验证手写定义——本卡的核心价值）

### 非范围
- ❌ 不生成 capabilities / param_mapping（人审项，输出标注）
- ❌ 不改注册表 / 不动 DB 行 / 不改执行器
- ❌ 不修 openai_video 注册表缺失（漂移证据只记录进 SOP，修归入后续卡）
- ❌ 不自动落库（生成器输出 = 可审查定义；落库走 SOP：builtin 迁移或 tenant API）

## 验收标准

1. **解析确定性**：Parse 支持 $ref（文件内）/ allOf 合并 / oneOf 取首分支；同输入两次输出一致
2. **fixture 独立来源**：openai_fixture.json 含来源注释（官方仓库 URL + 版本 + 拉取日期）
3. **chat 断言**：Generate(chat) → RequestPath=/v1/chat/completions；params 键集 ⊇ 注册表 pt_builtin_openai 键集
4. **images 断言**：Generate(images) → RequestPath=/v1/images/generations；params 键集 ⊇ 注册表 openai_img 键集
   （model/prompt/n/size/quality/response_format）
5. **非生成边界**：输出不含 capabilities/param_mapping 的推测值；含「待审查」标记
6. **门禁全绿**：production build/test -race/vet/gofmt + file-size + 台账三方一致 + SOP 文档存在

## 测试命令

```bash
cd services/production && go build ./... && go test ./... -race && go vet ./...
bash scripts/check-file-size.sh
bash .github/scripts/check-task-ledger.sh
```
