# 中转站语义关键发现（new-api fork，实测，2026-10-16）

> 来源：只读探测 `api.pearapi.ai`（多端点无需密钥即返回）+ 对照 QuantumNous/new-api 源码与公开文档。
> **状态：中途速报**（完整 Q1–Q6 分析待补）。以下每条都影响实现，标注置信度。

## 0. 它**不是** vanilla new-api，而是 **fork**

| fork 专属标记 | 证据 |
|---|---|
| 每模型字段 **`price_tiers`** | 上游 QuantumNous/new-api 源码中**完全不存在**该字段 |
| 响应体/头 **`api_source: "官方API网:https://api.pearapi.ai"`** | 上游无此字段 |
| **`pricing_version` = `bc0dff9a…`** | 上游 main 返回硬编码 `a42d372c…` |
| `/v1/models` 多出 `model` / `model_type` / `channel_type` | 上游无 |
| 前面还有一层 **Laravel 风格边缘网关** | `Cache-Control: no-cache, private`、`X-RateLimit-Limit: 1800`、405 响应体是 Laravel 形状 ⇒ `/v1/*` 表面**不是纯 new-api** |

**置信度：高。** ⇒ 影响：**不能假定上游文档 100% 适用**；以实测为准。

## 1. 🔴 计费陷阱：10 个模型的真实价格**只在 `price_tiers` 里**

| 事实 | 说明 |
|---|---|
| 这 10 个模型 `quota_type=0, model_ratio=0, model_price=0` | `claude-haiku-5-5`、`gemini-2.5-pro`、`gemini-3.1-pro-preview`、`gpt-5.5`、`gpt-5.6-luna/sol/terra`、`gpt-6-astra`、`gpt-6-sol`、`gpt-6.1-sol` |
| 真实价格**只在** `price_tiers` | `[{up_to, input_price, output_price, cache_read_price, cache_creation_price, call_price?}]`；`up_to=null` = 最后一档/无上限；**单位 USD / 1M tokens** |

**⇒ 直接后果（必须防）**：加价功能若只读 `model_ratio` / `model_price` 算原价，
这 10 个模型的原价会被算成 **$0** ⇒ **售价 $0 ⇒ 你把 GPT-6 白送出去**。
**置信度：高。**

## 2. `/api/pricing` 是**按用户/分组**裁剪的，不可全局缓存

| 事实 | 说明 |
|---|---|
| `group_ratio` 按登录用户重写（`group_group_ratio`） | 同一模型对不同用户价格不同 |
| `data[]` 只含**调用者可用的分组** | 匿名视图 ≠ 带 key 视图 ≠ 不同 key 视图 |

**⇒ 后果**：同步**必须用指定的 key**（不能匿名），且**不能把一份快照当全局真相**。
**置信度：高。**

## 3. 视频端点**不是** `/v1/video/generations`（POST）

| 路由 | 方法 | 状态 |
|---|---|---|
| `/v1/videos` | POST | ✅ 已注册（无 key 返回 401） |
| `/v1/videos/generations` | POST | ✅ 已注册 |
| `/v1/videos/{id}` | GET | ✅ |
| `/v1/videos/{id}/content` | GET/HEAD | ✅ |
| `/v1/video/generations/{task_id}` | **仅 GET** | ✅（POST 会返回 SPA HTML ⇒ 路由不存在） |
| 中转站自己的 `supported_endpoint` 广告 | —— | `openai-video → POST /v1/videos/generations` |

**14 个视频模型全部 `quota_type=1`（按次）**，基础价：`seedance-2-5`=**0.6**、`veo-3.1`=**1.25**、`hailuo-2.3`=**0.06**（USD/次）。
**置信度：高。**

## 4. 🔴 请求体**不透传**：顶层未知字段被静默丢弃

| 事实 | 说明 |
|---|---|
| 常规中转路径 | 解码进**有类型的 DTO 再重新序列化** ⇒ **未知字段被丢弃** |
| 例外 | 全局 `PassThroughRequestEnabled` 或按渠道 `PassThroughBodyEnabled` 打开时除外 |
| 视频/图像任务插件 | **能拿到完整解码后的 JSON body** |
| **但每个厂商插件会重建上游请求体** | 豆包/Seedance 插件：`Object.assign({model, content:[]}, metadata)` |

**⇒ 结论（回答 Owner「全能参考怎么传」）**：

```
metadata.content = [
  { type: "image_url", ... },   // 参考图
  { type: "video_url", ... },   // 参考视频
  { type: "audio_url", ... }    // 参考音频
]
```

**必须放在 `metadata` 内**，**不能放顶层**——放顶层会被静默丢弃，且**不会报错**（最危险的一类失败）。
**置信度：中高**（基于上游源码的插件实现；建议实测确认一次）。

## 5. 三个模型数量的差异已查明

| 数字 | 含义 |
|---|---|
| **83**（我实测匿名 `/v1/models`） | **按分组裁剪 + 排除音频模型**（48 chat / 21 image / 14 video） |
| **95**（早先实测） | 同上，随分组/时间不同 |
| **105**（`/api/pricing`） | **含全部分组**；与 `/v1/models` 差 22 条 = 19 条未在该分组启用 + 3 条音频 |
| **217**（控制台） | **管理端模型目录**（模型元数据表 + 渠道配置名，**含隐藏/未配置**）——**不是消费者能看到的** |

**⇒ 后果**：**同步应以带 key 的 `/api/pricing` + `/v1/models` 为准**，控制台的 217 **不构成"我们漏了 122 个模型"**。
**置信度：中高。**

## 6. 待完整版回答的问题

Q1 渠道语义（load balancing 细节）· Q2 分组与免费的完整语义 · Q3 计费公式（含 `group_ratio`、quota 单位换算）·
Q4 视频端点完整契约 · Q6 限流/重试/错误语义/动态计费。

---

# 完整版 Q1–Q6（源码 + 官方文档 + 实测）

> 方法：QuantumNous/new-api main 源码（tree 45fbb14）+ docs.newapi.ai + 对 api.pearapi.ai 只读探测。

## Q1 渠道
- **渠道 = 中转站自己的一个上游服务商账号**（base URL + key + 模型清单 + 分组 + 优先级 + 权重）。
- 每个 **(channel × model × group)** 落成 `abilities` 表一行 ⇒ **「3渠道」= 该模型有 3 个渠道绑定**；**一个模型确实可被多渠道同时服务**。
- 选择算法：取 (group,model) 的 enabled abilities → **保留最高优先级档** → **档内按权重随机**（DB 路径 weight+10；全 0 则等权；avg<10 时 ×100 平滑）。**重试 N 次会逐档向下**。
- 徽章数据源 = 管理端 `/api/models` 的 `configured_channel_count`（**含已禁用渠道**）+ `bound_channels[]`；**公开 `/api/pricing` 不含渠道数**（105 条实测均无）。
- **⇒ 影响：「N渠道」= 故障转移 + 负载分散，绝不等于容量或行为一致；绝不 pin 某个渠道。**

## Q2 分组
- 分组是**管理员自由命名的计费桶**；代码层面**没有任何东西给「免费」特殊类型**。
- `group_ratio` **乘整笔账单**。`quota_type` 0=按量(token 路径)，1=按次(model_price 路径)。
- **实测：匿名状态下 8 个 group_ratio 全 = 1** ⇒ 该站的"免费"必来自**按用户的 `group_group_ratio` 覆盖** 和/或**只在免费分组启用的 8 个 ratio=0 模型**。
- **⇒ 影响：必须在运行时按 key 解析 group+ratio；绝不缓存一份全局快照。**

## Q3 计费公式（**关键**）
- **基础单位**：`QuotaPerUnit` 默认 **500,000 quota = $1** ⇒ **`model_ratio` 1 = $2 / 1M tokens**。
- **(a) 按量**：`ratio = model_ratio × group_ratio`；`quota = (base + cache_read×cache_ratio + image×image_ratio + cache_create×create_cache_ratio(+1h 档 ×1.6) + completion×completion_ratio) × ratio + gemini_audio_input + tool_surcharge`，再乘 other_ratios；**ratio≠0 时最小 1 quota**。
- **(b) 按次**：**`quota = model_price × QuotaPerUnit × group_ratio × Π(other_ratios)`**
- **(c) 阶梯表达式**：token 叶子 `= exprUSD/1e6 × QuotaPerUnit × group_ratio`；task 叶子 `= exprUSD × QuotaPerUnit × group_ratio`（**不除 1e6**）
- **`price_tiers` = fork 专属、无上游文档与历史**：`[{up_to, input_price, output_price, cache_read_price, cache_creation_price, call_price?}]`；`up_to=null` = 最后一档；**USD / 1M tokens**；**档位按输入上下文长度选择**（gemini-2.5-pro 档位 1.875/15 → 3.75/22.5 = 正好 1.5× Google 的 ≤200K/above）
- ⚠️ **10 个模型 $0 陷阱确认**（同 §1）
- 🔴 **`pricing_version` 上游是硬编码常量（不是内容 hash）⇒ 绝不能当缓存/差分键**；必须自算内容 hash

## Q4 视频/图像与参考图（**决定怎么调用**）
- 上游端点：`POST /v1/video/generations` → `{task_id, status:"queued"}`；`GET /v1/video/generations/{task_id}`；`POST /v1/videos`（multipart, Sora 形状）、`GET /v1/videos/{id}`、`GET|HEAD /v1/videos/{id}/content`、`POST /v1/videos/{id}/remix`；通用 `POST /v1/tasks/{pluginKey}`
- **本站在线实测**：**`POST /v1/video/generations` 无路由**（返回 SPA HTML）；可用的是 **`POST /v1/videos/generations`**（也正是它 `supported_endpoint` 广告的 `openai-video` 路径）
- **无 webhook**：客户端**轮询**；`GET` 返回的是 new-api **自己的 DB 状态**，由**后台轮询器每 15 秒**刷新（TASK_QUERY_LIMIT=1000/轮，TASK_TIMEOUT_MINUTES=1440 ⇒ **24h 清扫**）
- **透传不保证**：常规路径解码进有类型 DTO 再序列化 ⇒ **未知字段丢弃**（除非 `PassThroughRequestEnabled` / 按渠道 `PassThroughBodyEnabled`）
- **豆包/Seedance 视频插件**：`Object.assign({model, content:[]}, metadata)` ⇒ **只有 `metadata` 存活**：
  ```js
  metadata.content = [{type:"image_url"|"video_url"|"audio_url"}, ...]
  metadata.duration / metadata.resolution / metadata.generate_audio
  ```
  `images[]` / `prompt` / `seconds` 被**显式映射**；**其余顶层字段静默丢弃**
- ⚠️ **但豆包的图像路径反而透传未知字段 ⇒ 各插件策略不同**（不能一概而论）

## Q5 三个数字（机制查明）
- `/v1/models` = **按 KEY**：token 所属分组内**至少 1 个启用渠道**的模型 − **无计费配置的模型**（除非 self-use / 用户开 `AcceptUnsetRatioModel`）− token 模型白名单限制
- `/api/pricing` = 所有**有启用渠道且 metadata.status==1** 的模型，按调用者可用分组过滤；**不分页**
- 控制台 **217 = 管理端模型目录**（models 元数据表 ∪ 各渠道配置的所有模型名，**含已禁用渠道**，含隐藏/不可用状态）
- 实测：`/api/pricing`=105；**无 key 的 `/v1/models`=83**（48 chat/21 image/14 video）；22 条差异 = **19 条未在解析到的分组启用**（8 条在「免费」且 ratio=0 ⇒ 无计费配置；11 条在「特价/特价福利」）+ **3 条音频**（该 fork 的 `/v1/models` 省略 openai-audio；`model_type` 只有 chat|image|video）
- 复现管理端总数：`GET /api/models?include_channel_models=true&page_size=1` → `total`（需管理员会话）
- **⇒ 影响：同步要用 `/api/pricing`（定价）+ 按 key 的 `/v1/models`（可调用性）；差分要用自算 hash。**

## Q6 其他（运维必须知道）
1. `/v1/models` 上游需 Bearer；**本站匿名也返 200**；坏 key → `{"error":"无效的AI令牌"}`（one-api 血统字符串，上游 main 无）
2. **限流**：429 + `Retry-After`；边缘广告 `X-RateLimit-Limit: 1800`
3. **重试**：上游 `RetryTimes` **默认 0 ⇒ 无跨渠道重试**；每次重试**降到下一优先级档**；401 会**自动禁用渠道**（阈值 5，默认关）
4. **配额预扣后结算**（失败退款）；`group_ratio≠0` 时零成本计算**会被兜底为 1 quota**
5. 稳定错误码：`insufficient_user_quota`、`model_price_error`、`channel:no_available_key`、`bad_response_status_code`、`model_not_found`
6. **「动态计费」在上游代码与文档中 0 命中** ⇒ 该站的"动态计费"就是它的 `price_tiers`（置信度中）
7. **14 个视频模型全为 `quota_type=1` 按次**，有基础 `model_price`（seedance-2-5=0.6 / veo-3.1=1.25 / hailuo-2.3=0.06 USD）
8. 🔴 **时长/分辨率对视频价格的缩放发生在中转站内部（插件 billing_ratios 或 `u("seconds")` 表达式），无法从 `/api/pricing` 推导** ⇒ **只能实测差分**（跑 5s vs 10s 对比消耗）
9. **端点路径管理员可覆盖** ⇒ 客户端应**从 `supported_endpoint` 构建**（本站：`/v1/videos/generations`、`/v1/audio/generations`）

## 官方文档未覆盖的（必须实测）
`price_tiers` 的单位与阈值 · 「N渠道」徽章算法与「动态计费」标签（fork UI 专有）· 视频基础价如何按时长/分辨率缩放 · **该站边缘网关的错误/响应头契约（不是 new-api 的）**
