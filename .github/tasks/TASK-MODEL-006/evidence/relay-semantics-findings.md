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
