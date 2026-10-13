// Package reconcile 实现 T0 权威价格校准的【对账】逻辑：
// 审计实际成本（gateway_audit_logs.cost_amount，来自命中模型权威价回写）
// vs 目录账单价（model_catalog.cost_amount，经目录投影）—— 两者应一致；
// 差异 > 阈值（默认 20%）说明账单价被覆盖/上游调价未同步/回写链路漂移，
// 记为 alert 并写入 price_calibration_logs（迁移 012）。
//
// 本包刻意只含**纯函数**（无 IO），可被一次性触发端点与后续周期调度复用。
package reconcile

import (
	"math"
)

// DefaultThresholdPct 默认告警阈值：差异超过 20% 即 alert（dev-plan T0 验收口径）。
const DefaultThresholdPct = 20.0

// ActualCost 一条真实调用的实际成本（审计侧事实）。
type ActualCost struct {
	ModelID       string
	ChannelID     string
	ProviderModel string
	Amount        float64 // 该模型聚合后的实际成本（单位由 CostUnit 决定，同 unit 内比较）
	CostUnit      string
}

// LedgerCost 目录账单价（model_catalog.cost_amount 权威值）。
type LedgerCost struct {
	ModelID string
	Amount  float64
}

// Alert 一条对账告警。
type Alert struct {
	ModelID       string  `json:"modelId"`
	ChannelID     string  `json:"channelId,omitempty"`
	ProviderModel string  `json:"providerModel,omitempty"`
	Actual        float64 `json:"actual"`
	Ledger        float64 `json:"ledger"`
	DiffPct       float64 `json:"diffPct"`
	Status        string  `json:"status"` // alert
	Note          string  `json:"note,omitempty"`
}

// DiffPct 计算两个成本之间的差异百分比（相对账单价）：
//
//	diff = (actual - ledger) / ledger * 100
//
// 边界：
//   - ledger == 0：账单价为 0（免费/未校准）时，只要 actual > 0 即视为 100%+ 差异
//     （记为正无穷语义 → 返回 actual>0 时为一个大数 999.99，由调用方按 >阈值 判 alert）；
//     actual==0 且 ledger==0 时返回 0（两者一致，无告警）。
//   - actual == 0 且 ledger > 0：实际零成本 vs 目录正价 —— 回写链路可能断裂，差异 100%。
func DiffPct(actual, ledger float64) float64 {
	if ledger == 0 {
		if actual == 0 {
			return 0
		}
		return 999.99
	}
	return (actual - ledger) / ledger * 100
}

// Reconcile 把实际成本与账单价对齐，返回超过阈值的告警列表（按 diff 降序）。
// 账单价缺失的模型（ledger 无记录）不产生告警 —— 那属于"未校准"，由 T2 报表
// 按 price_source 口径展示，不是对账错误。
func Reconcile(actuals []ActualCost, ledgerByModel map[string]float64, thresholdPct float64) []Alert {
	// 同一模型的实际成本先聚合（调用方也可能已聚合，这里幂等）
	agg := make(map[string]*ActualCost, len(actuals))
	order := make([]string, 0, len(actuals))
	for _, a := range actuals {
		if _, ok := agg[a.ModelID]; !ok {
			agg[a.ModelID] = &ActualCost{ModelID: a.ModelID, ChannelID: a.ChannelID, ProviderModel: a.ProviderModel, CostUnit: a.CostUnit}
			order = append(order, a.ModelID)
		}
		agg[a.ModelID].Amount += a.Amount
	}

	alerts := make([]Alert, 0)
	for _, id := range order {
		a := agg[id]
		ledger, ok := ledgerByModel[id]
		if !ok {
			continue // 未校准模型：非对账错误，跳过
		}
		diff := DiffPct(a.Amount, ledger)
		// 差异按【绝对值】判：实际高于目录 20% 或实际为零而目录有价（-100%）
		// 都是漂移信号；阈值比较用 abs(diff)（DiffPct 恒返回相对目录的偏移量）。
		if math.Abs(diff) > thresholdPct {
			alerts = append(alerts, Alert{
				ModelID:       a.ModelID,
				ChannelID:     a.ChannelID,
				ProviderModel: a.ProviderModel,
				Actual:        round2(a.Amount),
				Ledger:        round2(ledger),
				DiffPct:       round2(diff),
				Status:        "alert",
				Note:          "actual cost deviates from ledger beyond threshold",
			})
		}
	}
	// 降序稳定排序（diff 绝对值大的在前）
	for i := 1; i < len(alerts); i++ {
		for j := i; j > 0 && math.Abs(alerts[j-1].DiffPct) < math.Abs(alerts[j].DiffPct); j-- {
			alerts[j-1], alerts[j] = alerts[j], alerts[j-1]
		}
	}
	return alerts
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}
