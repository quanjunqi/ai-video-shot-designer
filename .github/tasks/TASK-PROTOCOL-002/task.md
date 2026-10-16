---
taskId: TASK-PROTOCOL-002
status: 进行中
priority: P1（底座收尾的自动化补刀——服务 TASK-MODEL-006 判据 4「能力声明覆盖」）
pr: "#<待开>"
criteria: 6
criteriaPassed: 0
depends_on: 不依赖任何 Owner 数据口径（能力键沿用 061 枚举；param_mapping 无实测依据不写）
---

# TASK-PROTOCOL-002：协议模板 capabilities 补齐（服务 MODEL-006 判据 4）

> **来源**：TASK-MODEL-006 判据 4「能力声明覆盖：`SELECT count(*) FILTER (WHERE capabilities<>'{}'::jsonb)||'/'||count(*) FROM protocol_templates` → 8/8」。
> 真库现状（2026-10-16）：9 个模板仅 3 个有能力声明（pt_builtin_openai / openai_img / openai_video，061 已补），
> **6 个 EMPTY**：comfyui / grsai / jimeng_image / jimeng_video / minimax_text / minimax_video。

## 目标

一句话：**让 5 个可静态声明能力的协议模板具备能力声明（能力键与 061 枚举同源），达成 MODEL-006 判据 4（8/9，comfyui 例外文档化）——为未来真实接入即梦/MiniMax/聚合渠道时的能力过滤与参数映射提供就绪的协议定义。**

## 探查结论（执行前实证）

### 1. 能力键枚举（061 已确立，本卡同源）
- `text-chat`（openai）
- `text-to-image` + `image-to-image`（openai_img）
- `text-to-video` + `image-to-video`（openai_video）

### 2. 执行器最小消费契约（已读 mapping/engine.go + catalog/resolve.go）
- `NewEngine(capabilitiesJSON)`：空/null → 空 Engine，**不报错**
- `HasCapability(mode)`：能力键命中检查——**能力键是核心消费**
- `GetCapability(mode)`：取 CapabilityConfig（param_mapping 等）；缺失 param_mapping = 空映射 → 走默认 __passthrough，**不破坏**
- ResolveFor 注释（2026-10-17）：capabilities 数据**渐进补齐**，「未声明 ≠ 不支持」；模板层 mode 校验是另一数据源（经 ProtocolTemplateID 取模板）

### 3. 6 个模板的注册表定义（protocol_registry.go，capabilities 全为 nil = DB 行持有）
| 模板 | Type | request_path | params | response_params（response_extract 依据） | async |
|---|---|---|---|---|---|
| pt_builtin_grsai | all | /v1/chat/completions | [] | choices.0.message.content | 同步 |
| pt_builtin_jimeng_image | image | /v1/images/generations | [] | 见注册表 145-147 | 同步 |
| pt_builtin_jimeng_video | video | /v1/videos/generations | [] | task_id/status/data.0.url | 异步 |
| pt_builtin_minimax_text | text | /v1/text/chatcompletion_v2 | [stream] | choices.0.message.content | 同步 |
| pt_builtin_minimax_video | video | /v1/video_generation | [] | task_id/status/file_id | 异步 |
| pt_builtin_comfyui | image | /prompt | [client_id] | prompt_id | 同步 |

### 4. comfyui 例外（客观事实，非主观选择）
comfyui 是**本地工作流（端口直连）**：/prompt 提交任意工作流 JSON，能力完全由导入的工作流定义，
协议层**无法静态声明**「支持 text-to-image 还是 text-to-video」。硬填伪能力会误导 HasCapability
过滤（把不支持的 mode 放进来或把支持的过滤掉）。⇒ **不填**，判据 4 口径 = **8/9**，理由文档化。

## 决策记录

| 编号 | 主题 | 选择 | 理由 |
|---|---|---|---|
| D-001 | 能力键枚举 | 沿用 061 三键枚举 | 同源原则（064 教训：词表必须与调用方同源） |
| D-002 | param_mapping | **省略**（无实测依据的字段名不写） | 061 证据分级精神：param_mapping 需要探测/官方文档依据；grsai/jimeng/minimax 是 mock 遗留模板，无实测 ⇒ 写了就是猜。缺失不影响能力校验与默认透传 |
| D-003 | comfyui | **例外不填** | 工作流自定义，协议层无法静态声明；判据 4 口径 8/9，PR 验收时请 Owner 确认 |
| D-004 | response_extract | 从注册表 response_params 派生 | 有依据（注册表定义是既有事实） |

## 范围

### 本期
1. **迁移 066**：UPDATE 5 个模板 capabilities（grsai→text-chat；jimeng_image→text-to-image,image-to-image；jimeng_video→text-to-video,image-to-video；minimax_text→text-chat；minimax_video→text-to-video,image-to-video），含 method/request_path/required_params/response_extract（注册表派生）；注释含 6 模板裁定表 + comfyui 例外理由 + 判据 4 口径说明
2. **真库验证**：迁移应用后 9 模板 8 个有能力声明（comfyui 例外）；能力键与 061 枚举一致断言
3. **契约一致性检查**：capabilities 键与 openapi/bff.yaml 的 supported_modes 派生口径一致（只读核对，若发现不一致只记录不改契约——契约改动属另一张卡）

### 非范围
- ❌ 不为 comfyui 填伪能力
- ❌ 不改执行器（HasCapability/映射引擎语义不动）
- ❌ 不改注册表代码（capabilities 由 DB 行持有，MergeTemplates DB 优先）
- ❌ 不动 MODEL-006 判据 7（价格，依赖 Owner 数据）

## 验收标准

1. **迁移 066 合规**：号段 060-069 内（066）；UPDATE 幂等；未改任何已执行迁移；注释含 6 模板裁定表
2. **5 个模板能力声明生效**：真库 `SELECT id, jsonb_object_keys(capabilities) FROM protocol_templates WHERE id IN (5 个)` 键值与设计一致
3. **能力键同源**：新键 ∈ {text-chat, text-to-image, image-to-image, text-to-video, image-to-video}（与 061 一致）
4. **comfyui 例外留痕**：迁移注释 + PR body 说明（判据 4 口径 8/9）
5. **真库验证**：迁移应用后 `SELECT count(*) FILTER (WHERE capabilities<>'{}'::jsonb)||'/'||count(*)` → 8/9
6. **门禁全绿**：production build/test -race/vet/gofmt；check-file-size；台账三方一致

## 测试命令

```bash
cd services/production && go build ./... && go test ./... -race && go vet ./...
bash scripts/check-file-size.sh
bash .github/scripts/check-task-ledger.sh
docker exec shotdesigner-postgres-1 psql -U shotdesigner -d production -c "SELECT ..."
```
