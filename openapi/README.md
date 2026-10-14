# `openapi/` — API 契约目录

> 本目录是**字段级契约**的唯一场所。图（`docs/architecture/`）讲结构与流转，这里讲字段、
> 状态码、错误码与方法约束。

| 文件 | 内容 |
|---|---|
| `bff.yaml` | OpenAPI 3.1：web-bff 对外契约（`/api/v1/*`，外加 `/live`、`/ready` 运维端点） |
| `README.md` | 本文件：定位、校验方式、破坏性变更规则、待确认清单 |

---

## 1. 定位与覆盖范围

### 1.1 已覆盖：`/api/v1/*` 是前端唯一入口契约

`/api/v1/*` 是**浏览器/前端唯一允许调用的契约**（`AGENTS.md`「关键 gotchas」：BFF 是前端唯一入口）。
所有前端 API 方法都在 `apps/web/src/lib/api/client.ts`（53 个方法），每个方法都必须能在
`bff.yaml` 中找到对应 operation。

当前 `bff.yaml` 的覆盖量：

| 指标 | 数量 |
|---|---|
| path 总数（含 `/live`、`/ready`） | 38 |
| operation 总数 | 57 |
| `/api/v1/*` path | 36 |
| `/api/v1/*` operation | 55 |
| `apps/web/src/lib/api/client.ts` 方法（路径字面量） | 53，已 100% 覆盖 |
| BFF `main.go` 注册的路由模式（含前缀处理器） | 21，已 100% 覆盖 |

覆核命令见 §2；`bff.yaml` 中每个 operation 都带 `x-upstream`
（`{service, method, path}`），标明它转发到哪个领域服务的哪个内部路径。

### 1.2 未覆盖：`/internal/v1/*` 是服务间契约，列为后续任务

`/internal/v1/*`（以及 execution 的 `/v1/generate`）是**服务间契约**，由 BFF 携带
`Bearer <SERVICE>_INTERNAL_TOKEN` 调用，浏览器不可访问。**本目录当前不覆盖它。**

后续任务（建议按此顺序拆分）：

1. 由各领域服务产出 `/internal/v1/*` 规范（或从 `Routes()` 生成），与 BFF 规范做引用校验，
   让「BFF 声明的上游」与「上游真实路由」在 CI 中自动对齐。
2. 在 CI 增加一条校验：不得存在「BFF 转发但上游没有」或「上游有但 BFF 从未转发」的路径。
3. 前端生成类型（`openapi-typescript` 等），替换 `client.ts` 中手写的 `Server*` 类型，
   消除「TS 类型与 Go struct 漂移」。

### 1.3 也明确不在范围内

静态资源、前端路由、`/runtime/*` 等第三方 CDN 前缀、`deploy/` 运维脚本。

---

## 2. 如何校验（本地、离线）

`bff.yaml` 必须始终是**可解析**且 **`$ref` 全部可解析**的。下面这段脚本只依赖 Python 标准库
加 `PyYAML`（本机已安装 6.0.3；`python3 -c "import yaml" ` 能通过即可），**不需要联网、
不需要安装任何 OpenAPI 工具**：

```bash
python3 - <<'PY'
import yaml, sys, re
doc = yaml.safe_load(open('openapi/bff.yaml', encoding='utf-8'))
errs = []
for k in ("openapi", "info", "paths", "components"):
    if k not in doc:
        errs.append(f"missing top-level {k}")
if not str(doc.get("openapi", "")).startswith("3.1"):
    errs.append("openapi must be 3.1.x")
if not doc["info"].get("title") or not doc["info"].get("version"):
    errs.append("info.title / info.version required")

# 1) 所有 $ref 必须能在文档内解析到真实存在的键
def walk(node, path="$"):
    if isinstance(node, dict):
        for k, v in node.items():
            yield from ([(path, v)] if k == "$ref" else walk(v, f"{path}.{k}"))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk(v, f"{path}[{i}]")

refs = set()
for path, ref in walk(doc):
    refs.add(ref)
    if not ref.startswith("#/"):
        errs.append(f"{path}: external $ref not allowed: {ref}")
        continue
    cur = doc
    for part in ref[2:].split("/"):
        part = part.replace("~1", "/").replace("~0", "~")
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            errs.append(f"{path}: UNRESOLVED $ref {ref} (at '{part}')")
            break
print(f"$ref: {len(refs)} distinct")

# 2) 每个 operation 必须有 operationId / summary / tags，且 operationId 唯一
methods = {"get", "put", "post", "delete", "options", "head", "patch", "trace"}
ops, ids = 0, []
for pth, item in doc["paths"].items():
    if not pth.startswith("/"):
        errs.append(f"path not absolute: {pth}")
    for m, op in item.items():
        if m in ("parameters", "summary", "description", "servers", "$ref"):
            continue
        if m not in methods:
            errs.append(f"{pth}: unknown key '{m}'")
            continue
        ops += 1
        for req in ("operationId", "summary", "tags"):
            if not op.get(req):
                errs.append(f"{pth} {m}: missing {req}")
        if op.get("operationId") in ids:
            errs.append(f"{pth} {m}: duplicate operationId {op.get('operationId')}")
        ids.append(op.get("operationId"))
        for code in op.get("responses", {}):
            if not re.fullmatch(r"[1-5][0-9X]{2}|default", str(code)):
                errs.append(f"{pth} {m}: bad status code {code}")

# 3) 路径参数必须在 parameters 中声明（支持 $ref）
for pth, item in doc["paths"].items():
    declared = set()
    for q in list(item.get("parameters", [])) + [q for m, o in item.items()
                                                 if m in methods for q in o.get("parameters", [])]:
        if "name" in q:
            declared.add(q["name"])
        elif "$ref" in q:
            key = q["$ref"].split("/")[-1]
            declared.add(doc["components"]["parameters"].get(key, {}).get("name"))
    for name in re.findall(r"\{([^}]+)\}", pth):
        if name not in declared:
            errs.append(f"{pth}: path param {{{name}}} not declared")

print(f"paths: {len(doc['paths'])} | operations: {ops}")
print(f"api/v1 paths: {len([p for p in doc['paths'] if p.startswith('/api/v1/')])}")
if errs:
    print("FAILED:")
    [print("  -", e) for e in errs]
    sys.exit(1)
print("OK: bff.yaml parses, all $refs resolve, all operations well-formed")
PY
```

本文件最近一次校验结果（2026-10-10）：

```
$ref: 84 distinct
paths: 38 | operations: 57
api/v1 paths: 36
OK: bff.yaml parses, all $refs resolve, all operations well-formed
```

### 2.1 覆核「前端方法 ↔ 契约」是否对齐

改 `client.ts` 或 `bff.yaml` 时，建议同时跑一次路径比对：把 `client.ts` 中
`request<T>('...')` 的路径字面量（把 `${...}` 视作 `{param}`）与 `bff.yaml` 的 path 做集合对比，
差集必须为空（这是 review 时的最低要求，尚未进 CI）。任何新增前端方法**必须**同 PR 补 `bff.yaml`。

### 2.2 可选：更严格的校验

本地如有 Docker 或已缓存的 `@redocly/cli` / `swagger-cli`，可额外跑
`redocly lint openapi/bff.yaml` 或 `npx --offline @redocly/cli lint openapi/bff.yaml`。
这属于加分项：**CI 与离线环境不得依赖它**，§2 的脚本是权威门禁。

---

## 3. 破坏性变更规则

以「浏览器客户端（`apps/web`）能否在**不改代码**的前提下继续正常工作」为判据。

### 3.1 破坏性变更（必须标 BREAKING、必须同 PR 同步前端）

| 类别 | 例子 |
|---|---|
| 删除/重命名字段 | 从 `ServerProject` 去掉 `style_version`；`poll_url` 改名为 `pollUrl` |
| 收紧取值 | `aspect_ratio` 从 `['16:9','9:16','1:1']` 去掉 `'1:1'`；`Task.status` 去掉 `cancelled` |
| 新增必填请求字段 | `CreateProjectRequest` 新增必填 `summary` |
| 改必填 | 原来可选的 `episode_id` 变成必填 |
| 删除/改名 operation 或 path | 删除 `POST /api/v1/tasks/run`；`/api/v1/comic-projects` 改 `/api/v1/projects` |
| 改变方法允许集合 | `POST /api/v1/tasks/{taskId}/cancel` 改成 `PATCH` |
| 改变状态码语义 | 创建从 `201` 改成 `200`（且未同时保留幂等语义）；删除从 `204` 改成 `200` |
| 改变响应包装 | `{items: [...]}` 改成裸数组；`Error` 从 `{code,message}` 改成其它形状 |
| 删除错误码 | 移除 `MODEL_NOT_FOUND`（客户端已有分支处理） |
| 接入鉴权 | 给 `/api/v1/*` 加 OIDC/JWT 要求（当前 `security: []`），会让既有客户端全部 401 |
| 改变字段语义/单位 | `progress` 从 0–100 改成 0–1；时间字段从秒改成毫秒 |

流程要求：

1. `bff.yaml` 的 `info.version` 递增主版本（当前 `0.1.0` → `1.0.0`/`0.2.0` 视严重度）；
2. PR 标题/描述标 **BREAKING**，PR 模板中列出受影响的前端调用点（文件 + 方法名）；
3. **同一个 PR** 内改 `apps/web` 调用代码与 `client.ts` 类型；
4. 在 PR 描述中给出迁移说明（旧值 → 新值）。

### 3.2 非破坏性变更（可选，但仍需同 PR 更新 `bff.yaml`）

- 新增可选请求字段；
- 新增响应字段（客户端必须容忍未知字段——见下）；
- 新增 operation / 新 path；
- 放宽取值（枚举加值）；
- 新增错误码（客户端必须容忍未知 `code`）。

> **前向兼容约束**：`Error.code` 的枚举是「当前代码实际出现过的全集」，不是闭集。
> 客户端**必须**按「未知 code 当通用错误处理并展示 `message`」实现，禁止用穷尽 switch
> 导致未知 code 崩溃。同理，客户端反序列化应忽略未知字段。

### 3.3 变更审阅清单（改 `/api/v1` 的 PR 必过）

- [ ] `bff.yaml` 是否同步？新增/删除字段是否与 Go handler 实际读写一致？
- [ ] `client.ts` 是否同步（类型 + 调用）？
- [ ] 是否属于 §3.1 的破坏性变更？若是：`info.version` 是否递增、PR 是否标 BREAKING？
- [ ] `x-upstream` 是否仍然正确（`main.go` 的转发目标是否改了）？
- [ ] 错误码是否新增/删除？新增是否已进 `Error.code` 枚举与 description？
- [ ] §2 的校验脚本是否通过？§2.1 的路径比对差集是否为空？

---

## 4. 与 `docs/architecture/` 的关系

| 文档 | 回答的问题 | 变化频率 |
|---|---|---|
| `docs/architecture/c4-context-container.md` | 有哪些容器/服务、谁调用谁、信任模型与已知缺口 | 低（架构变更时） |
| `docs/architecture/key-sequences.md` | 一次生成/提交/轮询的**调用顺序**与落库点 | 中 |
| `docs/architecture/data-model.md`、`state-machines.md` | 表结构、状态迁移 | 中 |
| **`openapi/bff.yaml`（本目录）** | **字段名、类型、必填性、状态码、错误码、方法约束** | 高（每个接口改动） |

分工原则：**图讲结构与流转，本目录讲字段级契约。** 两者冲突时，以**代码**为准，
并同时修文档与契约：

- 若只是字段/状态码变化 → 只改本目录（+必要时 `key-sequences.md` 的顺序）；
- 若服务边界、端口、调用方向变化 → 先改 `docs/architecture/`，再改本目录；
- 已知的一处文档/代码不一致：`key-sequences.md` 写 `POST /internal/v1/generate`，
  而 `services/web-bff/cmd/server/main.go` 实际转发到 `POST /v1/generate`
  （本规范以代码为准，见 §5 第 3 条）。

---

## 5. 待确认清单

以下几项在核对代码时发现「契约无法确定」或「代码/文档不一致」，**未编造**，逐条列出待人类确认。

### 5.1 需要决策的接口缺口

1. **`GET /api/v1/generation-intents`（集合）实际不可用。**
   BFF 的前缀处理器 `generationIntents` 允许 GET/POST 打到 `/api/v1/generation-intents[...]`，
   但 production 只注册了 `POST /internal/v1/generation-intents` 与
   `GET /internal/v1/generation-intents/{id}`，**没有集合 GET**，因此浏览器调用集合 GET 得到
   `405`。处置选项：(a) 在 BFF 收窄为「集合只允许 POST、详情只允许 GET」；
   (b) 在 production 补集合查询接口（带分页/过滤）。前端当前未使用，故本规范**未**给出该
   operation，只在 `POST /api/v1/generation-intents` 的 description 中记录。

2. **异步生成的 `poll_url` 指向内部路径。**
   `services/execution/internal/httpapi/handler.go` 在异步分支返回
   `poll_url: "/internal/v1/tasks/" + j.ID`，BFF 原样透传、**未重写**为 `/api/v1/tasks/{id}`。
   前端若直接 `fetch(poll_url)` 会打到非 BFF 路径（部署网关下大概率 404）。
   本规范在 `GenerateAsyncAccepted.poll_url` 中注明了该问题；建议在 execution 或 BFF 修正前缀。

3. **文档与代码不一致：`POST /v1/generate` vs `POST /internal/v1/generate`。**
   `docs/architecture/key-sequences.md` 写的是 `/internal/v1/generate`；
   代码（`main.go` 的 `generate`）转发到 execution `/v1/generate`，execution 也只在
   `/v1/generate` 注册。本规范以代码为准，建议同步修正时序图。

4. **固定开发身份默认值不一致。** `.env.example` 中 `BFF_DEV_ACTOR_ID=actor_local`，
   而 `main.go` 的兜底默认是 `user_dev`；`BFF_DEV_WORKSPACE_ID` 两处均为 `ws_dev`。
   不影响契约结构（浏览器不发送身份），但影响本地联调时 workspace 的成员授权结果，需确认权威值。

### 5.2 结构不确定、已用宽松 schema 标注「以服务端为准」的字段

以下字段在代码中透传/以 JSONB 或 `map[string]any` 存储，**本次无法从代码确定完整字段集**，
在 `bff.yaml` 中一律用 `type: object` + `additionalProperties: true` 并在 description 注明
「字段以服务端为准，契约待补」。补齐方式是：由服务端提供 struct 或示例响应后追加为显式 schema。

| 位置 | 未确定的字段 |
|---|---|
| `Episode` | `counts`、`interpretation`、`execution_target`、`stage_models`、`performance`、`scene_variants`、`directing`、`executable_units`、`production`；`stage`/`status` 的取值集合 |
| `EpisodeAsset` | `versions[].status` 取值；`episode_variant` 的键集合；`variant_image_status` 取值；`versions[].created_at` 是 `number`（疑似时间戳）还是时间字符串 |
| `Task` | `progress` 的量纲（0–1 或 0–100）；`intent_payload` 服务端可能返回对象/JSON 字符串/null（已用 `oneOf`）；`kind` 中 `audio`/`canvas_export` 是否真被 execution 接受 |
| `CreateTaskRequest` | `payload` 与上游 `intent_payload` 的对应关系（BFF 不重命名，仅透传，字段名差异需确认） |
| `GenerateRequest` | `mode` 的合法取值（由协议模板 `capabilities` 动态声明，无法静态枚举）；`input`/`parameters` 的具体键 |
| `CatalogModel.capability` / `ProtocolTemplate.capabilities` | `capabilities` JSONB 的键集合（各 mode 声明） |
| `Project` | `status` 的取值集合；`default_text_model` 是否真会出现（前端标可选） |
| `ProjectCharacter` | `image_status` 取值集合；`image_generated_at` 的类型（前端声明 `number`） |
| `AuditLog` | `status`（success/failed/queued?）、`product` 的取值集合 |
| `RuleTemplate` | `config` 的结构（拆分/提示词两类模板各自的键） |
| `Asset` / `AssetUploadSession` | `status` 的取值集合 |
| `CredentialStatus` | `authType` 的取值集合（代码里探测分支有 `bearer`/`apikey`/`sign`，目录侧枚举是 `bearer`/`none`） |

### 5.3 已文档化但前端未使用的 BFF 接口（确认是否保留）

| 接口 | 说明 |
|---|---|
| `GET /api/v1/generation-intents/{intentId}` | BFF 暴露、production 有路由，但 `client.ts` 无对应方法 |
| `GET /api/v1/catalog/models/{modelId}/capabilities` | 同上；返回模型能力声明与 `supported_modes` |

若确认不需要对外暴露，应在 BFF 收窄（属破坏性变更，见 §3.1）；若保留，应补前端调用点或
在 `client.ts` 注释中标注为「预留」。

### 5.4 其它细节待确认

- **错误码重名**：`INVALID_CHANNEL` 在 BFF（探测缺 baseUrl）、production（目录渠道校验）、
  workspace（渠道名称缺失）三处含义不同；`NOT_FOUND` 含义也不同（项目/剧集/资产/任务/凭据）。
  客户端无法仅凭 `code` 判断来源。是否给 code 加来源前缀（如 `PRODUCTION_INVALID_CHANNEL`）待决——
  改名属破坏性变更。
- **`/live`、`/ready` 的响应体不一致**：`/ready` 失败返回 `text/plain`（`http.Error`），
  而全站错误体是 JSON `{code,message}`。二者不属于 `/api/v1/*` 契约，本规范附带记录；
  是否统一错误体待决。
- **上传内容类型白名单**：`PUT /api/v1/assets/uploads/{uploadId}/content` 的 `Content-Type`
  由前端按文件类型设置并被 BFF 原样转发，规范用 `*/*`。asset 服务内部的媒体校验白名单
  未在本任务范围内核实，建议确认后在 operation description 中列出允许的 MIME 集合。
- **`POST` 无请求体的三个接口**（`commitAssetUpload`、`cancelTask`、`retryTask`）：规范未声明
  `requestBody`。若服务端要求 `Content-Length: 0` 或拒绝带体请求，需补说明。

---

## 6. 维护约定

- `bff.yaml` 中的 `operationId` 用 camelCase，且与 `client.ts` 的方法名语义对齐
  （如 `createComicProject` ↔ `createProject`；项目资源沿用服务端术语 `comic-project`）。
- 每个 operation 必须有中文 `summary`、`tags` 与 `x-upstream`（BFF 边缘实现的接口除外，
  如 `/api/v1/channels/{channelId}/probe`）。
- 描述里出现「字段以服务端为准，契约待补」的字段，补齐后应删除该措辞并改为显式 schema；
  §5.2 表格同步删除对应行。
- 本目录的文件改动**只允许**在 `openapi/` 内；转发逻辑/路由以 `services/web-bff` 为准，
  发现契约与代码不一致时，改契约（或按 §5 提出待确认项），不要凭契约去改代码。
