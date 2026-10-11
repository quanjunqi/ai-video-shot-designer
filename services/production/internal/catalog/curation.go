package catalog

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"time"
)

// ADR-004 §4 的中间两步（**永远是人**）：列出未策展的供给 → 人工绑定进 model_catalog。
//
// 边界（ADR-004 §9 第 4 项）：
//   - `channel_models` 不被任何前端或执行路径读取；**本文件的 ListSupply 是"人工策展"这条
//     管理路径**，它读供给池是为了让人做决定。
//   - 对外可见性只发生在 `Curate` 写进 `model_catalog` 之后。
//   - ADR §3.1 的约束在这里落地：供给池存**上游原样**标签（可能多出 audio 等），
//     而 `model_catalog.type` 只允许 text|image|video ⇒ **策展这一步必须拦住它**。
//
// 一处 ADR 未规定、由我定并写明的约定（**不是**从文档抄的）：
//   供给池的 `pricing` 是上游原样 jsonb，形状各家不同 ⇒ 本文件只认一种窄约定
//   `{"amount": <number>, "unit": "<per_call|per_second|per_mtok_input|per_mtok_output>"}`；
//   认不出就**不猜**，交回给人工填。

// SupplyItem 是供给池里的一行，供人工策展时查看。
type SupplyItem struct {
	ChannelID       string          `json:"channelId"`
	ProviderModel   string          `json:"providerModel"`
	DisplayName     string          `json:"displayName"`
	UpstreamType    string          `json:"upstreamType"` // 上游原样标签（可能无法映射到 text|image|video）
	Tags            string          `json:"tags"`
	EndpointTypes   json.RawMessage `json:"endpointTypes"`
	Pricing         json.RawMessage `json:"pricing"`
	PricingAmount   *float64        `json:"pricingAmount"` // 按上面的窄约定解析；认不出则 nil
	PricingUnit     string          `json:"pricingUnit"`
	LastSeenAt      time.Time       `json:"lastSeenAt"`
	MissingSince    *time.Time      `json:"missingSince"` // 非 NULL = 已下架（仍保留行）
	PriceIsEstimate bool            `json:"priceIsEstimate"`
}

// ErrSupplyNotFound：供给池里没有这条（channel + provider_model）。
// 单独一个领域错误，是为了让 HTTP 层不必 import 驱动包就能把 ErrNoRows 映射成 404。
var ErrSupplyNotFound = errors.New("catalog: supply row not found (sync the channel first)")

// ListSupply 列出某个渠道的供给。includeMissing=true 时连已下架的也列出来。
// ListSupply 返回**某个工作区视角**的供给池（ADR-009 Phase B2）：
// 平台共享行 + 该工作区自己的行，键相同（(channel_id, provider_model)）时工作区行覆盖平台行。
func (store PostgresStore) ListSupply(ctx context.Context, workspaceID, channelID string, includeMissing bool) ([]SupplyItem, error) {
	rows, err := store.Pool.Query(ctx, `
		SELECT channel_id, provider_model, COALESCE(display_name,''), COALESCE(model_type,''),
		       COALESCE(tags,''), endpoint_types, pricing, last_seen_at, missing_since, workspace_id
		  FROM channel_models
		 WHERE (workspace_id = '' OR workspace_id = $2)
		   AND ($1 = '' OR channel_id = $1)
		   AND ($3 OR missing_since IS NULL)
		 ORDER BY channel_id, provider_model`, channelID, workspaceID, includeMissing)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// 同键覆盖：同一 (channel_id, provider_model) 上，工作区行覆盖平台行。
	// ★ 价格解析必须在这里做 —— 旧实现在 scan 循环里调 parsePricing，改写时漏掉会让
	//   策展读到的价格凭空消失（这是"重构顺手丢逻辑"，比崩溃更难发现）。
	type supplyRow struct {
		item SupplyItem
		ws   string
	}
	var collected []supplyRow
	overridden := map[string]bool{}
	for rows.Next() {
		var it SupplyItem
		var ws string
		if err := rows.Scan(&it.ChannelID, &it.ProviderModel, &it.DisplayName, &it.UpstreamType,
			&it.Tags, &it.EndpointTypes, &it.Pricing, &it.LastSeenAt, &it.MissingSince, &ws); err != nil {
			return nil, err
		}
		if amt, unit, ok := parsePricing(it.Pricing); ok {
			it.PricingAmount, it.PricingUnit = &amt, unit
		}
		collected = append(collected, supplyRow{item: it, ws: ws})
		if ws != "" {
			overridden[it.ChannelID+"\x00"+it.ProviderModel] = true
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]SupplyItem, 0, len(collected))
	for _, r := range collected {
		if r.ws == "" && overridden[r.item.ChannelID+"\x00"+r.item.ProviderModel] {
			continue
		}
		out = append(out, r.item)
	}
	return out, nil
}

// parsePricing 只认一种窄约定；认不出就返回 false（**不猜**）。
func parsePricing(raw json.RawMessage) (float64, string, bool) {
	if len(raw) == 0 {
		return 0, "", false
	}
	var p struct {
		Amount *float64 `json:"amount"`
		Unit   string   `json:"unit"`
	}
	if err := json.Unmarshal(raw, &p); err != nil || p.Amount == nil || p.Unit == "" {
		return 0, "", false
	}
	return *p.Amount, p.Unit, true
}

// CuratedModel 是策展结果。**刻意不复用产品面的 Model**：
// 后者是目录接口的响应契约，策展字段（logical_model_id / route_priority / cost_* / price_*）
// 属于管理路径；混在一起会悄悄改变对外 JSON 形状。
type CuratedModel struct {
	// ★ 必须有 JSON 标签：这个结构是**接口响应**，没有标签会输出 Go 风格字段名（ID/ChannelID…），
	//   前端按驼峰读会全部拿到 undefined —— 而且不会报错（我第一次真机验证时正是如此）。
	ID                 string   `json:"id"`
	ChannelID          string   `json:"channelId"`
	Family             string   `json:"family"`
	Name               string   `json:"name"`
	ProviderModel      string   `json:"providerModel"`
	Type               string   `json:"type"`
	Status             string   `json:"status"`
	Sort               int      `json:"sort"`
	Note               string   `json:"note"`
	ProtocolTemplateID string   `json:"protocolTemplateId"`
	LogicalModelID     string   `json:"logicalModelId"`
	RoutePriority      int      `json:"routePriority"`
	CostAmount         *float64 `json:"costAmount"`
	CostUnit           string   `json:"costUnit"`
	PriceAmount        *float64 `json:"priceAmount"`
	PriceUnit          string   `json:"priceUnit"`
	PriceSource        string   `json:"priceSource"`
	Version            int      `json:"version"`
}

// CurateInput 是人工策展时给出的决定。凡"来自供给池"的字段都不在这里 ——
// 它们由 Curate 从供给池行读取，避免人工誊抄出错。
type CurateInput struct {
	ID                 string // 产品面模型 id
	Family             string
	Name               string
	Type               string // text | image | video（与上游标签无关，由此处施加约束）
	ChannelID          string
	ProviderModel      string
	LogicalModelID     string
	ProtocolTemplateID string
	RoutePriority      int
	Note               string
	// 人工成本（我们付出）。留空表示"未定价"，不是 0。
	CostAmount *float64
	CostUnit   string
	// 售价：若留空且供给池能解析出价格，则取供给池的（price_source=synced）；
	// 否则保持人工值（price_source=manual）。
	PriceAmount *float64
	PriceUnit   string
}

// Curate 把一条供给策展成产品面的模型。**只有走到这里，模型才可能对外可见。**
func (store PostgresStore) Curate(ctx context.Context, workspaceID, actor string, in CurateInput) (CuratedModel, error) {
	var out CuratedModel
	if in.ID == "" || in.Family == "" || in.Name == "" || in.ChannelID == "" || in.ProviderModel == "" {
		return out, errors.New("id, family, name, channel_id and provider_model are required")
	}
	switch in.Type {
	case "text", "image", "video":
	default:
		// ADR §3.1 的约束在这里落地：上游可以有任意标签，但产品面只有这三类。
		return out, fmt.Errorf("unsupported model type %q: model_catalog only allows text|image|video", in.Type)
	}

	// 从供给池取上游价格（窄约定；认不出就不猜）
	var rawPricing json.RawMessage
	// 供给价：平台共享行 + 该工作区自己的行 ⇒ **工作区行优先**（ORDER BY 把平台排后）
	err := store.Pool.QueryRow(ctx,
		`SELECT pricing FROM channel_models
		  WHERE channel_id=$1 AND provider_model=$2 AND (workspace_id = '' OR workspace_id = $3)
		  ORDER BY (workspace_id = '') ASC
		  LIMIT 1`,
		in.ChannelID, in.ProviderModel, workspaceID).Scan(&rawPricing)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return out, ErrSupplyNotFound
		}
		return out, fmt.Errorf("supply row %s/%s: %w", in.ChannelID, in.ProviderModel, err)
	}

	priceAmount, priceUnit, priceSource := in.PriceAmount, in.PriceUnit, "manual"
	if priceAmount == nil {
		if amt, unit, ok := parsePricing(rawPricing); ok {
			priceAmount, priceUnit, priceSource = &amt, unit, "synced"
		}
	}

	err = store.Pool.QueryRow(ctx, `
		INSERT INTO model_catalog (id, channel_id, family, name, provider_model, type, status, sort,
			note, protocol_template_id, logical_model_id, route_priority,
			cost_amount, cost_unit, price_amount, price_unit, price_source, price_synced_at, created_by,
			workspace_id)
		VALUES ($1,$2,$3,$4,$5,$6,'enabled',100,$7,NULLIF($8,''),NULLIF($9,''),$10,
			$11,NULLIF($12,''),$13,NULLIF($14,''),$15,
			CASE WHEN $15 = 'synced' THEN now() ELSE NULL END, $16, $17)
		-- 038 后唯一键为 (workspace_id, family, channel_id)：理由同 pool.go（42P10）。
		ON CONFLICT (workspace_id, family, channel_id) DO UPDATE SET
			name = EXCLUDED.name, provider_model = EXCLUDED.provider_model, type = EXCLUDED.type,
			note = EXCLUDED.note, protocol_template_id = EXCLUDED.protocol_template_id,
			logical_model_id = EXCLUDED.logical_model_id, route_priority = EXCLUDED.route_priority,
			cost_amount = EXCLUDED.cost_amount, cost_unit = EXCLUDED.cost_unit,
			price_amount = EXCLUDED.price_amount, price_unit = EXCLUDED.price_unit,
			price_source = EXCLUDED.price_source, price_synced_at = EXCLUDED.price_synced_at,
			version = model_catalog.version + 1, updated_at = now()
		RETURNING id, channel_id, family, name, COALESCE(provider_model,''), type, status, sort,
			note, COALESCE(protocol_template_id,''), COALESCE(logical_model_id,''), route_priority,
			cost_amount, COALESCE(cost_unit,''), price_amount, COALESCE(price_unit,''), price_source, version`,
		in.ID, in.ChannelID, in.Family, in.Name, in.ProviderModel, in.Type, in.Note,
		in.ProtocolTemplateID, in.LogicalModelID, in.RoutePriority,
		in.CostAmount, in.CostUnit, priceAmount, priceUnit, priceSource, actor, workspaceID).
		Scan(&out.ID, &out.ChannelID, &out.Family, &out.Name, &out.ProviderModel, &out.Type, &out.Status,
			&out.Sort, &out.Note, &out.ProtocolTemplateID, &out.LogicalModelID, &out.RoutePriority,
			&out.CostAmount, &out.CostUnit, &out.PriceAmount, &out.PriceUnit, &out.PriceSource, &out.Version)
	return out, err
}
