---
id: TASK-MARKET-M7
title: 模型价格展示链路打通（独立价格列映射）
status: 已验收
priority: P1
depends_on:
  - TASK-MARKET-M6
---
# TASK-MARKET-M7 模型价格展示链路打通

**需求**：价格必须可溯源到录入/上游原始报价，广场卡片与详情抽屉显示真实价格（而非「—」兜底）。

**探查结论**（2026-10-18）：
- 上游拉价对 PearAPI 不可行：`/v1/models` 83 个模型全不带 pricing 字段；`/v1/pricing` 偶发返回 JSON（`{success,data:[{model_name,…}]}`）随后稳定返回 HTML（防爬/需会话态）。`sync_pricing_path` 自动拉价能力保留（供支持价格接口的中转站）。
- **录入链路已存在**：CurationPanel 已有 priceAmount/priceUnit 输入（留空=未定价）→ `curateRequest` 组载荷 → `api.curateModel` → curation.go `PriceAmount` → 落 `model_catalog.price_amount/price_unit/price_source=manual`。
- **后端返回已带价**：postgres.go 目录查询已返回 priceAmount/priceUnit/priceSource；BFF 类型 client.ts 已声明。
- **断点唯一（前端展示）**：`CatalogModel` 类型无 priceAmount/priceUnit/priceSource；`serverModelToLocal` 未映射；`modelPrice.ts` 只读 `capability.billing`（DB billing 空）→ 录了价也显示「—」。

**范围**（收敛，不越界）：前端三处——CatalogModel 类型补字段、serverModelToLocal 映射、modelPrice.ts 优先读独立价格列（回退 billing）+ 详情抽屉 price_source 溯源展示。不动同步/策展/试跑。
