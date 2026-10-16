# 协议接入 SOP（Protocol Onboarding）

> 适用：接入新渠道/新上游协议时，如何**确定性**地得到协议模板定义，而不是手写臆测。
> 对应工具：`services/production/cmd/protocol-gen`（TASK-PROTOCOL-003）。
> 原则：**协议定义可追溯到上游文档**；无依据不填（061/064 教训）。

## 背景：为什么需要生成器

本仓 9 个 builtin 协议模板历史上全部**手写**（`protocol_registry.go` + DB 行）。手写的风险：

1. **臆测**：mock 时代的占位协议（grsai/jimeng/minimax）字段名无实测依据（061 证据分级：无依据不填）；
2. **漂移**：`pt_builtin_openai_video` **只在 DB、不在注册表 Go 代码**（2026-10-16 实测 grep -c=0，
   DB 行 061 实证 pollPath=/v1/videos/{id}）——协议定义来源不统一，改一处忘一处；
3. **不可验证**：手写定义没有上游权威来源，无法自动核对。

生成器把「手写」变成「**生成 + 审查**」：输入 = 上游 OpenAPI 3.x 规范（官方权威来源），
输出 = 协议定义（method / request_path / params / required / response_extract 确定性提取）。

## 已确立的验证事实（TASK-PROTOCOL-003）

用 OpenAI 官方 OpenAPI 3.1（GitHub `openai/openai-openapi`，2026-10-16 拉取）独立验证：

- `pt_builtin_openai` 的 14 个手写 params 键**全部在官方 `CreateChatCompletionRequest` 字段内**（零臆测）；
- `pt_builtin_openai_img` 的 model/prompt/n/size/quality/response_format **全部在官方 `CreateImageRequest` 字段内**。

⇒ 既有手写定义（openai 三兄弟）经官方文档独立核验正确；生成器断言即这一验证的自动化形态。

## 接入流程（五步）

```text
1. 获取上游规范    → OpenAPI 3.x JSON（上游提供时直接用；不提供时用「端点只读探测 + 官方文档核读」
                     整理成规范描述——探测先例见 061 openai_video param_mapping、029 pollPath 401 证据）
2. 生成定义        → protocol-gen -spec <openapi.json> -id <id> -label <label> [-base-path <path>] [-path <端点>]
3. 审查            → 人审：capabilities（mode 语义，参考 061 能力键枚举）、param_mapping（需真实渠道实测）、
                     Type（text/image/video 按输出模态）、response_extract 语义键（生成器只推导结构路径）
4. 落库            → builtin：新增迁移（UPDATE protocol_templates，号段按服务认领，只增不改）；
                     tenant 自定义：走既有契约 API
5. 回归验证        → 真库 SELECT capabilities 键值；执行器 HasCapability 过滤冒烟；契约 supported_modes 一致
```

## 生成器能力边界（确定性规则）

| 项 | 生成 | 说明 |
|---|---|---|
| method / request_path | ✅ | basePath 从 servers[0].url 提取；可 -base-path 覆盖（OpenAI 官方 paths 无 /v1） |
| params / required | ✅ | requestBody schema + parameters[]；$ref（文件内）/ allOf 合并 / oneOf 取首含 properties 分支 |
| response_extract | ✅ 部分 | 顶层属性 k→k；数组一层 items → k.0.x；更深不推导（待审查） |
| capabilities | ❌ | mode 语义需业务判断（参考 061 枚举），生成器不猜 |
| param_mapping | ❌ | 需真实渠道实测/官方文档核读后补（无依据不填） |

## 注意事项

- **跨文件 $ref 不支持**（报错不静默）：上游规范若拆分多文件，先合并成单文件再喂生成器。
- **属性顺序按字母序**（确定性）：Go map 遍历随机；生成器对 properties 排序保证同输入同输出。
- **同输入同输出**：生成器是纯函数；接入时可把生成结果纳入 CI 快照对比，防协议定义漂移。
- **上游规范版本留痕**：fixture/接入记录必须写来源（仓库 URL + 版本 + 拉取日期），可追溯。
- **漂移治理（遗留）**：注册表代码 ↔ DB 行 ↔ 契约三方一致性自检尚未落地（pt_builtin_openai_video
  只在 DB 的漂移证据见上）——属后续工程卡，接入新协议时顺手核对。
