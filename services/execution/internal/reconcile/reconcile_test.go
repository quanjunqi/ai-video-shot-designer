package reconcile

import (
	"math"
	"testing"
)

// DiffPct 边界：账单价为 0 的特殊语义
func TestDiffPctBoundaries(t *testing.T) {
	cases := []struct {
		name   string
		actual float64
		ledger float64
		want   float64
	}{
		{"一致", 1.0, 1.0, 0},
		{"实际高 20%", 1.2, 1.0, 20},
		{"实际低 50%", 0.5, 1.0, -50},
		{"实际高 33 倍（ADR-004 实测场景）", 2.0, 0.06, (2.0 - 0.06) / 0.06 * 100},
		{"双零一致", 0, 0, 0},
		{"目录零价、实际有成本", 0.5, 0, 999.99},
		{"目录零价、实际零成本", 0, 0, 0},
	}
	for _, c := range cases {
		got := DiffPct(c.actual, c.ledger)
		if math.Abs(got-c.want) > 0.001 {
			t.Fatalf("%s: DiffPct(%v,%v)=%v want %v", c.name, c.actual, c.ledger, got, c.want)
		}
	}
}

// 验收：差异 15% 不告警、21% 告警（dev-plan T0 验收 #4）
func TestReconcileThreshold(t *testing.T) {
	ledger := map[string]float64{
		"mod_a": 1.0, // 实际 1.15 → diff +15% → 不告警
		"mod_b": 1.0, // 实际 1.21 → diff +21% → 告警
	}
	actuals := []ActualCost{
		{ModelID: "mod_a", ChannelID: "ch1", Amount: 1.15},
		{ModelID: "mod_b", ChannelID: "ch2", Amount: 1.21},
	}
	alerts := Reconcile(actuals, ledger, DefaultThresholdPct)
	if len(alerts) != 1 {
		t.Fatalf("应只告警 mod_b，实际 %d 条：%+v", len(alerts), alerts)
	}
	if alerts[0].ModelID != "mod_b" {
		t.Fatalf("告警应为 mod_b，实际 %s", alerts[0].ModelID)
	}
	if math.Abs(alerts[0].DiffPct-21) > 0.01 {
		t.Fatalf("diff 应为 21，实际 %v", alerts[0].DiffPct)
	}
	if alerts[0].Status != "alert" {
		t.Fatalf("status 应为 alert，实际 %s", alerts[0].Status)
	}
}

// 未校准模型（账单价缺失）不产生告警
func TestReconcileSkipsUncalibrated(t *testing.T) {
	actuals := []ActualCost{
		{ModelID: "mod_new", Amount: 5.0}, // 目录里没有账单价
	}
	alerts := Reconcile(actuals, map[string]float64{}, DefaultThresholdPct)
	if len(alerts) != 0 {
		t.Fatalf("未校准模型不应告警，实际 %+v", alerts)
	}
}

// 同一模型多条实际成本先聚合再比对
func TestReconcileAggregates(t *testing.T) {
	ledger := map[string]float64{"mod_x": 1.0}
	actuals := []ActualCost{
		{ModelID: "mod_x", ChannelID: "ch", Amount: 0.4},
		{ModelID: "mod_x", ChannelID: "ch", Amount: 0.3},
		{ModelID: "mod_x", ChannelID: "ch", Amount: 0.5}, // 合计 1.2 → +20% → 恰好=阈值，不告警（> 才告警）
	}
	alerts := Reconcile(actuals, ledger, DefaultThresholdPct)
	if len(alerts) != 0 {
		t.Fatalf("恰好 20%% 不应告警（> 阈值才告警），实际 %+v", alerts)
	}
	// 再加 0.02 → 1.22 → +22% → 告警
	actuals = append(actuals, ActualCost{ModelID: "mod_x", ChannelID: "ch", Amount: 0.02})
	alerts = Reconcile(actuals, ledger, DefaultThresholdPct)
	if len(alerts) != 1 || alerts[0].ModelID != "mod_x" {
		t.Fatalf("聚合后 22%% 应告警，实际 %+v", alerts)
	}
	if math.Abs(alerts[0].Actual-1.22) > 0.001 {
		t.Fatalf("聚合实际成本应为 1.22，实际 %v", alerts[0].Actual)
	}
}

// 降序：diff 绝对值大的排前面
func TestReconcileSortsByAbsDiff(t *testing.T) {
	ledger := map[string]float64{
		"mod_small": 1.0, // +25%
		"mod_big":   1.0, // +80%
	}
	actuals := []ActualCost{
		{ModelID: "mod_small", Amount: 1.25},
		{ModelID: "mod_big", Amount: 1.8},
	}
	alerts := Reconcile(actuals, ledger, DefaultThresholdPct)
	if len(alerts) != 2 {
		t.Fatalf("应有 2 条告警，实际 %d", len(alerts))
	}
	if alerts[0].ModelID != "mod_big" {
		t.Fatalf("大差异应排前，实际 %+v", alerts)
	}
}

// 零成本回写链路断裂：actual=0、ledger>0 → -100% → 告警
func TestReconcileZeroActualAlerts(t *testing.T) {
	ledger := map[string]float64{"mod_z": 0.5}
	actuals := []ActualCost{{ModelID: "mod_z", Amount: 0}}
	alerts := Reconcile(actuals, ledger, DefaultThresholdPct)
	if len(alerts) != 1 {
		t.Fatalf("零成本 vs 正价目录应告警，实际 %+v", alerts)
	}
	if math.Abs(alerts[0].DiffPct+100) > 0.01 {
		t.Fatalf("diff 应为 -100，实际 %v", alerts[0].DiffPct)
	}
}
