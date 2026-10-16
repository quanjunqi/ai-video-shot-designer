---
taskId: TASK-PROTOCOL-001
status: 进行中
priority: P1（底座收尾的自动化补刀——对齐 VOZEB requestTemplate 形态；等价可迁移子集回填）
pr: "#211"
criteria: 6
criteriaPassed: 0
depends_on: 不依赖任何 Owner 决策（纯工程切片；判别标准已由执行器语义实证）
---

# TASK-PROTOCOL-001：requestTemplate 数据迁移（等价可迁移子集回填 + 判别标准固化）

> **来源**：2026-10-16 与 VOZEB-PRO 对比识别差距「requestTemplate『{{占位符}}』模板字符串
> （我们 params[]+role 为主，契约已通 execution 但数据未迁移）」。
> **关键前提**（执行器语义实证，非推测）：`request_template` 非空 → 渲染模板作为**请求体全文**
> （不再合并 params[] 组装的字段，仅注入 task_type/__passthrough）；**占位符缺失 → 响亮报错**
> （ErrTemplateMissingValue，迁移 028 规格第 3 条）。

## 目标

一句话：**把 request_template 从「能力已就绪但未生效」落到「等价可迁移子集已生效」，
并把「哪些协议能安全模板化、哪些不能、为什么」的判别标准固化进迁移注释与 ADR-007 D3——
防止未来无脑回填造成现有调用被破坏。**

## 探查结论：8 个内置协议模板化可行性（执行器语义推导，逐项给理由）

| 协议 | params 构成 | 模板化 | 理由（模板占位符必须恒 Present 才等价） |
|---|---|---|---|
| pt_builtin_comfyui | client_id static | ✅ **本卡回填** | 唯一静态字段恒 Present ⇒ 模板 `{"client_id":"{{client_id}}"}` 与 params[] 组装语义等价，可加金标准等价性测试 |
| pt_builtin_minimax_text | stream static | ✅ 已生效 | 迁移 028 能力 + 注册表定义 + 等价性测试已锁定（TestRequestTemplateEquivalenceBuiltinMinimaxText） |
| pt_builtin_grsai | 空 params | ⚠️ 无增益 | params[] 形态 = {} + __passthrough 动态注入；模板表达不了映射产物，回填 = 形式主义 |
| pt_builtin_jimeng_image | 空 params | ⚠️ 无增益 | 同上 |
| pt_builtin_jimeng_video | 空 params | ⚠️ 无增益 | 同上 |
| pt_builtin_minimax_video | 空 params | ⚠️ 无增益 | 同上 |
| **pt_builtin_openai** | 14 字段含 runtime（messages/tools/user） | ❌ **禁止回填** | 模板含 tools/user ⇒ 业务缺省时 ErrTemplateMissingValue（**破坏现有调用**：现行为是缺省不发送）；模板不含 ⇒ 丢字段。两者都不等价。判别标准第一条反例 |
| pt_builtin_openai_img | model + prompt runtime + static | ⚠️ 有边界 | prompt 依赖业务必给（Present 非恒真）；需调用方保证 + 逐场景等价性测试，本期不做（列为候选，待有真实业务调用时再评估） |

**判别标准（固化进迁移注释 + ADR-007 D3）**：模板可安全迁移 ⇔
① 模板占位符集合 ⊆ 执行器恒 Present 的 key 集合（static 非空默认值 / role=model / 业务恒给的 runtime）；
② 模板请求体字段集合 == params[] 形态发送集合（模板形态不再合并 params[] 组装的字段）；
③ 有金标准等价性测试（同输入，两边 json.Unmarshal 后 DeepEqual）。

## 范围

### 本期（三个独立可验证产物）
1. **迁移 065**：`UPDATE protocol_templates SET request_template = '{"client_id":"{{client_id}}"}' WHERE id='pt_builtin_comfyui'`（幂等 UPDATE；只增不改已执行迁移；号段 060-069 内）；迁移注释内嵌 8 协议可行性表 + 判别标准
2. **execution 等价性测试**：`TestRequestTemplateEquivalenceBuiltinComfyUI`（仿 minimax_text 金标准：legacy params[] vs 模板形态，同步/异步两入口，多输入场景）
3. **ADR-007 D3 状态更新**：「建议方向」→「已落地等价子集（minimax_text + comfyui）+ 判别标准；openai 系禁止无脑回填」

### 非范围
- ❌ 不回填 grsai/jimeng×2/minimax_video（无增益，空 params 靠 __passthrough）
- ❌ 不回填 openai chat（不等价，会破坏现有调用）
- ❌ 不改 execution 渲染器（RenderRequestTemplate 语义已由迁移 028 + 金标准测试锁定）
- ❌ 不做前端（协议配置页已降级为专家模式，ADR-005 D2）

## 验收标准

1. **迁移 065 存在且合规**：只增不改已执行迁移；号段 060-069 内；`UPDATE` 幂等（重复应用结果一致）；注释含 8 协议可行性表 + 判别标准
2. **comfyui 模板生效**：迁移应用后 `SELECT request_template` 非空 = `{"client_id":"{{client_id}}"}`；`MergeTemplates` 后 DB 行优先（`withSource` 标记 db）
3. **等价性金标准**：`TestRequestTemplateEquivalenceBuiltinComfyUI` 通过——legacy params[] 与模板形态在同步/异步两入口、含 __passthrough/模型级覆盖场景下请求体语义相等
4. **判别标准文档化**：ADR-007 D3 状态更新（含 openai 禁止回填的原因链）
5. **真库验证**：本地 4 库迁移到 065；production 库 `request_template` 列实测生效
6. **门禁全绿**：`cd services/production && go build/test -race/vet`；`cd services/execution && go build/test -race/vet`；`gofmt`；`check-file-size`；台账三方一致（AC-008/010/011）

## 测试命令

```bash
cd services/execution && go test ./internal/engine/ -run TestRequestTemplateEquivalenceBuiltinComfyUI -v
cd services/production && go build ./... && go test ./... -race && go vet ./...
cd services/execution && go build ./... && go test ./... -race && go vet ./...
bash scripts/preflight.sh   # 台账门禁 + 文件行数
```

## 号段

| 迁移 | 号段 | 状态 |
|---|---|---|
| `065_request_template_comfyui.sql` | production 模型中心 060-069（已用 060-064，065 = 段内下一号） | 新增 |
