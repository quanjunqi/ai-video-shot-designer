# ADR-004：中转站接入与「供给池」设计

- **状态**：已确认（Owner 2026-10-10，见 §9）
- **日期**：2026-10-10
- **相关**：ADR-003（路由层）、`docs/archive/routing-seed-proposal.md`、`docs/development/backlog.md`

---

## 1. 背景

实测确认 PearAPI（`api.pearapi.ai`）是**AI 模型中转站**，且：

| 事实 | 证据来源 |
|---|---|
| OpenAI 兼容；鉴权 `Authorization: Bearer <KEY>` | 文档截图（我方已有 `bearer` 支持，**零代码改动**） |
| 供给 **90+ 个模型**（文本/图片/视频/音频），远超我们目录的 16 行 | `GET /v1/models`（无需鉴权） |
| 提供**价格表 + 端点映射表 + 厂商清单** | `GET /api/pricing`（无需鉴权） |
| 提交 `POST /v1/videos/generations`；查询 `GET /v1/video/generations/{id}`（**单复数不对称**） | 端点映射表 + 无鉴权探测（401 = 路径存在） |
| 我们已有的 3 个协议模板路径与 PearAPI **精确吻合** | 模板 `request_path` 与端点映射表逐条对照 |

**中转站与直连的本质差异**（这决定了设计）：

| | 直连 | 中转站 |
|---|---|---|
| 模型来源 | 我主动接入 N 个 | **它有什么我就有什么**（动态、持续变化） |
| 定价 | 厂商价 | **中转站给的价，且随时变** |
| 可用性 | 我选的 SLA | 背后可能是官方/逆向/共享号池，**不可控** |
| 凭据 | 每厂商一把 | **一把 token 通天**（泄漏影响面 = 整个模型市场） |

**实测的一个严重数据问题**：我们目录里手写的 `billing` **不可信** ——
`nano-banana-2-lite` 我们写 ¥2，中转站实价 **¥0.06（差 33 倍）**；
`doubao-seedream-5-0-260128` 我们写 ¥0，实价 ¥0.099。
而阶段 1 实现的成本上限正是基于这个字段 ⇒ **没有成本价的权威来源，成本治理是假的**。

---

## 2. 决策

### D1：三层分离 —— 供给池 / 产品面 / 执行候选

```
① 供给层  channel_models      「它有什么」—— 同步来的原始清单，默认不对外
② 产品层  logical_models      「我们卖什么」—— 克制、被策展的能力型标识
③ 执行层  model_catalog       「怎么调、按什么顺序调」—— 候选行 + 优先级
```

**为什么必须分离**：把 90+ 模型直接铺到前端，用户看到的是 90 个模型名 ——
那就**又退回到「列渠道」**，ADR-003 的逻辑模型抽象就白做了。
**供给丰富 ≠ 产品面丰富**（LibTV 亦是 20 项精选能力，而非 500 个模型）。

### D2：供给池独立成表，同步**只写供给池**

`channel_models` 与 `model_catalog` 分开，理由：

1. 同步任务可**全量刷新**该表而不触碰生产配置（安全）
2. 「默认不对外」在结构上天然成立（供给表本就不被任何执行路径读取）
3. 避免 `model_catalog`（同时是执行快照来源）被 90+ 行污染
4. 差异检测（新增/消失/涨价）在两张职责单一的表之间对比更清晰

**同步规则（硬性）**：

| 规则 | 理由 |
|---|---|
| **upsert，绝不 delete** | 上游下架若删行，引用它的任务/画布/资产**直接断链**。改为 `missing_since` 标记 |
| 本次未出现 → `missing_since = now()`；重新出现 → 置回 NULL | 可逆、可审计 |
| **绝不自动写 `model_catalog`** | 策展是**人的动作**（等价性无法自动判定，见 ADR-003 §3.1.1） |
| 同步失败**不得清空**已有供给池 | 一次网络抖动不能抹掉数据 |
| 记录每次同步的 added/updated/missing/price_changed + diff | 中转站随时改名/下架/调价，必须可追溯 |
| **同步请求必须走 SSRF 防护（`netguard`）** | 目标是管理员/用户配置的 `base_url` ⇒ **用户可控 URL**，与模型调用同等风险 |
| 幂等 | 唯一键 `(channel_id, provider_model)`；同一时刻重复同步结果一致 |
| 上游原始记录存 `raw`/`pricing` 原文 | 便于回溯与以后新增字段，不急于解析 |

### D3：成本与售价**分离**，并标记价格来源

- `cost_*` = 付给渠道的成本（**同步来**）
- `price_*` = 对外售价（**我们定**，含毛利）
- `price_source` = `manual | synced` + `price_synced_at`

**理由**：即使当前只自用，「渠道成本」与「我们的定价」也是两个概念；
混为一谈会使配额上限、路由成本排序、后续定价全部失去依据。

### D4：直连与中转**并存**，由候选机制统一

| 模型类型 | 策略 |
|---|---|
| 关键/高频（角色立绘、主力视频） | **官方直连为主**（priority 10）、中转站为备（20） |
| 长尾/试验（veo-3.1、grok-imagine、ltx-digitalhuman…） | **只用中转站** |

**理由**：不把命脉交给单一中转站，同时保住广度。这正是 ADR-003 D3「平台兜底」的用武之地。

### D5：中转站信任模型 —— 显式记录，不假装可控

- 渠道新增 `trust_note`：记录来源与合规备注（**人工填写**）
- 特定渠道可标记为**仅限长尾/试验**（通过 `route_priority` + 策展策略体现）
- 候选绑定**强制人工审核**（ADR-003 已定）
- 审计**必须记录实际命中渠道**（阶段 1 已实现 `gateway_audit_logs.channel_id`）
- ⚠️ **法律责任不在技术范围内**：我们能做的是"记录来源 + 审计 + 可切换"，
  合规审查是 Owner 的决策（§9）

### D6：生成产物**落盘**从中转站接入起成为必需

中转站的结果 URL **普遍**短期有效（非 AutoDL 特例）。
不落盘 ⇒ 画布/资产引用的是必然失效的地址（BACKLOG #4）。

---

## 3. 数据模型

### 3.1 供给池（新增）

```sql
channel_models(
  channel_id        text NOT NULL REFERENCES model_channels(id) ON DELETE CASCADE,
  provider_model    text NOT NULL,          -- 上游模型标识（如 doubao-seedance-2-0-260128）
  display_name      text,
  model_type        text,                   -- 上游**原样**标签（chat/image/video/audio）
  tags              text,
  endpoint_types    jsonb NOT NULL DEFAULT '[]',
  vendor            text,
  raw               jsonb NOT NULL DEFAULT '{}',
  pricing           jsonb NOT NULL DEFAULT '{}',
  remote_created_at timestamptz,
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  missing_since     timestamptz,
  PRIMARY KEY (channel_id, provider_model)
)
```

> `model_type` **刻意不加 CHECK**：供给表存**上游原样**，约束在策展进
> `model_catalog` 时施加。否则上游多一个 `audio` 标签就会让同步整批失败。

### 3.2 同步记录（新增）

```sql
channel_model_syncs(
  id bigserial PRIMARY KEY,
  channel_id text NOT NULL REFERENCES model_channels(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',   -- running | succeeded | failed
  raw_count int, added int, updated int, missing int, price_changed int,
  endpoints jsonb,     -- 上游端点映射表（如 PearAPI 提供的）
  diff jsonb,
  error text
)
```

### 3.3 渠道同步配置（`model_channels` 增列）

```sql
sync_kind         text NOT NULL DEFAULT 'none',   -- none | openai_compatible
sync_models_path  text,      -- 如 /v1/models      （**可配，不硬编码**）
sync_pricing_path text,      -- 如 /api/pricing
last_sync_at      timestamptz,
trust_note        text
```

> 路径**必须可配**（`AGENTS.md` §3.2：禁止硬编码）。不同中转站的清单/价格接口路径不同。

### 3.4 成本与售价（`model_catalog` 增列）

```sql
cost_amount     numeric(12,6),
cost_unit       text,        -- per_call | per_second | per_mtok_input | per_mtok_output
price_amount    numeric(12,6),
price_unit      text,
price_source    text NOT NULL DEFAULT 'manual',  -- manual | synced
price_synced_at timestamptz
```

---

## 4. 策展流程（供给 → 产品）

```
同步（自动）    channel_models  ← /v1/models + /api/pricing
        ↓
列表（人工）    在产品面列出「未策展的供给」，含价格与端点类型
        ↓
绑定（人工）    选定 logical_model_id + protocol_template + params
               + route_priority + price  →  写 model_catalog
        ↓
路由（自动）    ADR-003 的候选解析与失败切换
```

**关键**：中游两步**永远是人**。系统只提供信息与校验，不做等价性推断。

---

## 5. 风险与对策

| 风险 | 严重度 | 对策 |
|---|---|---|
| 同一模型名背后可能是官方/逆向/共享号池 → 产出质量与合规不可控 | **高** | `trust_note` + 强制人工策展 + 审计实际渠道 + 关键模型以直连为主 |
| 一把 token 通天，泄漏影响面 = 整个模型市场 | **高** | 凭据加密（已有）+ 审计（已有）+ 配额（已有）+ **渠道级预算上限（缺，后续）** |
| 突然下架/改名/涨价 | 中 | `missing_since` 标记 + 每次同步的 diff + 涨价告警 |
| 共享号池 → 限流/超时频繁 | 中 | 阶段 1 的退避重试 + 并发闸门 + 死信；后续加**渠道级熔断** |
| 结果 URL 短期有效 | 中 | D6 落盘（BACKLOG #4，建议提前做） |
| 同步接口是用户可控 URL → SSRF | 中 | **同步必须走 `netguard`** |
| 上游价格单位不统一（按次/按秒/按 token） | 中 | `cost_unit` 显式化；成本排序只在**同 unit** 内比较 |
| 合规/法律 | **需 Owner 决策** | 技术无法解决 |

---

## 6. 迁移规划（production 027–030，按 `AGENTS.md` §12.3 号段）

| 文件 | 内容 |
|---|---|
| `027_channel_models.sql` | 供给池表 + 索引 |
| `028_channel_model_syncs.sql` | 同步记录表 |
| `029_channel_sync_config.sql` | `model_channels` 增 4 列 |
| `030_model_cost_price.sql` | `model_catalog` 增 6 列 + `price_source` CHECK |

均为**只增不改**；已有 16 行不受影响（新列可空或带默认值）。

---

## 7. 非目标

- ❌ **不自动策展/不自动启用** —— 等价性判断必须由人做
- ❌ 不把供给池直接暴露给前端或执行路径
- ❌ 不做定价策略引擎（分时/分级/促销）—— 先做到「成本与售价分离且可追溯」
- ❌ 不做多币种（当前审计表为 CNY）
- ❌ 不做渠道级熔断（列为后续，见 ADR-003 §5）
- ❌ 不同步用户级渠道（`user_channels` 在 workspace 侧，供给同步先只做平台渠道）

---

## 8. 验证计划（实现时）

1. **幂等**：连续同步两次，`channel_models` 行数与内容不变
2. **差异**：构造上游少一个模型 → 断言 `missing_since` 被置位且**行未被删除**；
   再出现 → 置回 NULL
3. **不越界**：同步**绝不**写入 `model_catalog`（断言行数不变）
4. **失败隔离**：模拟上游 500 → 断言 `channel_model_syncs.status='failed'` 且
   **已有供给池数据完好**
5. **SSRF**：把 `sync_models_path` 指到内网地址 → 断言被 `netguard` 拦截
6. **价格来源**：同步价写入 `cost_*`，人工价写 `price_*`，`price_source` 正确
7. **真实渠道**：对 PearAPI 跑一次真实同步，断言 90+ 模型入库、端点映射表被记录

---

## 9. 已确认的决策（Owner 2026-10-10）

| # | 决策 | 对设计的影响 |
|---|---|---|
| 1 | **字段保留**：`cost_*` 与 `price_*` 分离的字段**保留** | 当前可只填 `cost_*`；`price_*` 留待需要对外售卖时启用。分离本身无额外成本，先建好结构比事后加列安全 |
| 2 | **保留官方直连** | 落实 D4：关键/高频模型以**官方直连为主**（`route_priority` 10）、中转站为备（20）；长尾/试验模型只用中转 |
| 3 | **法律判断由 Owner 负责**；AI 只做技术侧 | 技术侧的边界明确为三件事：**记录来源**（`trust_note`）+ **审计实际命中渠道** + **可切换**。ADR 不再把合规审查列为技术待办 |

**关于第 4 项（同步来的模型默认不对外）**：Owner 未提出异议，按我的强烈建议执行 ——
即供给池 `channel_models` **不被任何前端或执行路径读取**，只有经人工策展写入
`model_catalog` 后才可能对外。如与此意图不符请提出，此项是结构性的（改起来是 D1/D2 层面的调整）。

### 对实施顺序的影响

决策 2（保留直连）不改变实施顺序，但**明确了 `route_priority` 的取值约定**：

| 场景 | 直连渠道 | 中转站渠道 |
|---|---|---|
| 关键/高频模型 | 10（主） | 20（备） |
| 长尾/试验模型 | —（不接） | 10 |

决策 1 使迁移 `030_model_cost_price.sql` **必须**包含 `price_*` 四列（不可省），
即使当前不填。
