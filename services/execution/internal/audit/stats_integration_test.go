package audit

import (
	"context"
	"fmt"
	"testing"
	"time"
)

// T2-1 真库集成测试：四维聚合 / 趋势 / 双口径 / 租户隔离 / SLO。
// 与 aggregate_integration_test.go 共用 testStore 脚手架与 seedSeq。

// seedStat 造一行带完整归因与成本口径的审计日志。
// calibrated=true 表示已校准（cost_amount>0 且有 cost_unit）；false 表示预估（cost=0 或 unit 空）。
func seedStat(t *testing.T, s Store, ws, channel, model, project, user, status string, latency int, cost float64, costUnit, createdAt string) {
	t.Helper()
	id := fmt.Sprintf("req_st_%s_%d", ws, seedSeq.Add(1))
	if _, err := s.Pool.Exec(context.Background(), `
		INSERT INTO gateway_audit_logs (request_id, workspace_id, project_id, user_id, product, model_id, channel_id,
			mode, status, latency_ms, token_input, token_output, token_cached, cost_amount, cost_currency, cost_unit, created_at)
		VALUES ($1,$2,$3,$4,'comic',$5,$6,'text-chat',$7,$8,0,0,0,$9,'CNY',$10,$11::timestamptz)`,
		id, ws, project, user, model, channel, status, latency, cost, costUnit, createdAt); err != nil {
		t.Fatal(err)
	}
}

// 四维排行聚合正确：渠道维度下 calls/成功/失败/p95/成本 与手写语义一致。
func TestIntegrationStatsByChannel(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	// chan_a：3 条成功（latency 全 100 → p95 精确 100），2 条已校准成本
	seedStat(t, s, "ws_st", "chan_a", "m_a", "p1", "alice", "success", 100, 1.0, "per_call", "2026-10-10T10:00:00Z")
	seedStat(t, s, "ws_st", "chan_a", "m_a", "p1", "alice", "success", 100, 0.5, "per_call", "2026-10-10T11:00:00Z")
	seedStat(t, s, "ws_st", "chan_a", "m_a", "p2", "bob", "success", 100, 0, "", "2026-10-10T12:00:00Z") // 预估（无 unit）
	// chan_b：1 条失败，已校准成本
	seedStat(t, s, "ws_st", "chan_b", "m_b", "p2", "bob", "failed", 50, 0.2, "per_call", "2026-10-10T13:00:00Z")
	// 另一租户：绝不能混入
	seedStat(t, s, "ws_other", "chan_a", "m_a", "p1", "alice", "success", 100, 9.9, "per_call", "2026-10-10T14:00:00Z")

	got, err := s.DimensionStatsBy(ctx, "ws_st", Filter{}, "", "channel", 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("应有 2 个渠道，实际 %+v", got)
	}
	// 排序：cost_calibrated 降序 → chan_a(1.5) > chan_b(0.2)
	if got[0].Key != "chan_a" || got[1].Key != "chan_b" {
		t.Fatalf("排序应为 chan_a > chan_b（按成本），实际 %+v", got)
	}
	a := got[0]
	if a.Calls != 3 || a.SuccessCalls != 3 || a.FailedCalls != 0 {
		t.Fatalf("chan_a 应为 3 成功，实际 %+v", a)
	}
	if a.P95LatencyMs != 100 {
		t.Fatalf("chan_a 成功行全 100ms → P95 应为 100，实际 %d", a.P95LatencyMs)
	}
	// 双口径：chan_a 已校准 = 1.0+0.5=1.5；预估 1 条（无 unit 的那条）
	if a.CostCalibrated != 1.5 {
		t.Fatalf("chan_a 已校准成本应为 1.5，实际 %v", a.CostCalibrated)
	}
	if a.CostEstimatedCalls != 1 {
		t.Fatalf("chan_a 预估调用应为 1（无 unit 行），实际 %d", a.CostEstimatedCalls)
	}
	b := got[1]
	if b.Calls != 1 || b.SuccessCalls != 0 || b.FailedCalls != 1 {
		t.Fatalf("chan_b 应为 1 失败，实际 %+v", b)
	}
	if b.P95LatencyMs != 0 {
		t.Fatalf("chan_b 无成功行 → P95 应为 0，实际 %d", b.P95LatencyMs)
	}
}

// 四维排行：model/project/member 维度分组正确（同一 SQL 白名单，换列即可）。
func TestIntegrationStatsByModelProjectMember(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	seedStat(t, s, "ws_m", "chan_x", "m1", "p1", "alice", "success", 10, 1.0, "per_call", "2026-10-10T10:00:00Z")
	seedStat(t, s, "ws_m", "chan_y", "m1", "p1", "alice", "success", 10, 1.0, "per_call", "2026-10-10T11:00:00Z")
	seedStat(t, s, "ws_m", "chan_y", "m2", "p2", "bob", "failed", 10, 0.5, "per_call", "2026-10-10T12:00:00Z")

	byModel, err := s.DimensionStatsBy(ctx, "ws_m", Filter{}, "", "model", 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(byModel) != 2 || byModel[0].Key != "m1" || byModel[0].Calls != 2 || byModel[0].CostCalibrated != 2.0 {
		t.Fatalf("model 聚合错误：%+v", byModel)
	}
	byProject, err := s.DimensionStatsBy(ctx, "ws_m", Filter{}, "", "project", 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(byProject) != 2 || byProject[0].Key != "p1" || byProject[0].Calls != 2 {
		t.Fatalf("project 聚合错误：%+v", byProject)
	}
	byMember, err := s.DimensionStatsBy(ctx, "ws_m", Filter{}, "", "member", 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(byMember) != 2 || byMember[0].Key != "alice" || byMember[0].Calls != 2 || byMember[1].Key != "bob" {
		t.Fatalf("member 聚合错误：%+v", byMember)
	}
}

// 筛选（status/feature）对排行生效。
func TestIntegrationStatsRespectsFilters(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	seedStat(t, s, "ws_f", "chan_f", "m1", "p1", "alice", "success", 10, 1.0, "per_call", "2026-10-10T10:00:00Z")
	seedStat(t, s, "ws_f", "chan_f", "m1", "p1", "alice", "failed", 10, 0.5, "per_call", "2026-10-10T11:00:00Z")

	// 按 status=failed 过滤：只 1 条
	got, err := s.DimensionStatsBy(ctx, "ws_f", Filter{Status: "failed"}, "", "channel", 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Calls != 1 || got[0].SuccessCalls != 0 || got[0].CostCalibrated != 0.5 {
		t.Fatalf("status 筛选未生效：%+v", got)
	}
	// 按 feature 过滤：0 命中（未造 feature 行）→ 空列表不报错
	got2, err := s.DimensionStatsBy(ctx, "ws_f", Filter{}, "storyboard", "channel", 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(got2) != 0 {
		t.Fatalf("feature 过滤应为空，实际 %+v", got2)
	}
}

// 租户隔离：另一 workspace 的数据绝不混入排行。
func TestIntegrationStatsWorkspaceIsolation(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	seedStat(t, s, "ws_a", "chan_a", "m1", "p1", "alice", "success", 10, 1.0, "per_call", "2026-10-10T10:00:00Z")
	seedStat(t, s, "ws_b", "chan_a", "m1", "p1", "alice", "success", 10, 99.0, "per_call", "2026-10-10T10:00:00Z")

	got, err := s.DimensionStatsBy(ctx, "ws_a", Filter{}, "", "channel", 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].CostCalibrated != 1.0 {
		t.Fatalf("ws_a 只应看到自己的 1.0，实际 %+v", got)
	}
}

// 日/周粒度：跨 3 天造数 → day 3 桶；同一周 → week 1 桶（桶边界对齐）。
func TestIntegrationTrendGranularity(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	seedStat(t, s, "ws_t", "chan_t", "m1", "p1", "alice", "success", 10, 1.0, "per_call", "2026-10-06T10:00:00Z") // 周二
	seedStat(t, s, "ws_t", "chan_t", "m1", "p1", "alice", "success", 10, 2.0, "per_call", "2026-10-07T10:00:00Z") // 周三
	seedStat(t, s, "ws_t", "chan_t", "m1", "p1", "alice", "failed", 10, 0.5, "per_call", "2026-10-09T10:00:00Z")  // 周五

	day, err := s.Trend(ctx, "ws_t", Filter{}, "", "day", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(day) != 3 {
		t.Fatalf("day 粒度应有 3 桶，实际 %d：%+v", len(day), day)
	}
	// 桶升序：第 0 桶 = 10-06，成本 1.0
	if day[0].Bucket.UTC().Format("2006-01-02") != "2026-10-06" || day[0].CostCalibrated != 1.0 || day[0].Calls != 1 {
		t.Fatalf("第 1 桶错误：%+v", day[0])
	}
	if day[2].Bucket.UTC().Format("2006-01-02") != "2026-10-09" || day[2].CostCalibrated != 0.5 || day[2].SuccessCalls != 0 {
		t.Fatalf("第 3 桶错误：%+v", day[2])
	}

	week, err := s.Trend(ctx, "ws_t", Filter{}, "", "week", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(week) != 1 {
		t.Fatalf("同一周应有 1 桶，实际 %d：%+v", len(week), week)
	}
	if week[0].Calls != 3 || week[0].CostCalibrated != 3.5 {
		t.Fatalf("周桶应聚合 3 条 / 成本 3.5，实际 %+v", week[0])
	}
}

// 趋势下钻：dimension+dimension_value 只统计该维度值。
func TestIntegrationTrendDrilldown(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	seedStat(t, s, "ws_d", "chan_a", "m1", "p1", "alice", "success", 10, 1.0, "per_call", "2026-10-10T10:00:00Z")
	seedStat(t, s, "ws_d", "chan_b", "m1", "p1", "alice", "success", 10, 8.0, "per_call", "2026-10-10T11:00:00Z")

	got, err := s.Trend(ctx, "ws_d", Filter{}, "", "day", "channel", "chan_a")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Calls != 1 || got[0].CostCalibrated != 1.0 {
		t.Fatalf("下钻 chan_a 应只有 1 条 / 成本 1.0，实际 %+v", got)
	}
}

// 维度/粒度白名单拒绝（SQL 注入防线）。
func TestIntegrationStatsRejectsUnknownDimensionAndGranularity(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.DimensionStatsBy(ctx, "ws_x", Filter{}, "", "channel_id; DROP TABLE gateway_audit_logs", 5); err == nil {
		t.Fatal("非法维度必须被拒绝")
	}
	if _, err := s.Trend(ctx, "ws_x", Filter{}, "", "hour", "", ""); err == nil {
		t.Fatal("非法粒度必须被拒绝")
	}
	if _, err := s.Trend(ctx, "ws_x", Filter{}, "", "day", "member; DROP TABLE x", "x"); err == nil {
		t.Fatal("非法下钻维度必须被拒绝")
	}
}

// SLO：>5 万行造数，报表查询 P95 < 2s。
// 判据：这是本地一次性断言（testStore 无 EXECUTION_TEST_DATABASE_URL 时自动 Skip，
// CI 不设该 env，故不进 CI 常驻）；造数用单条多 VALUES 语句降低往返。
func TestIntegrationStatsSLO(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	const rows = 50000
	// 分块插入（单语句 5 万 VALUES 会超 PG 参数上限）
	perBatch := 5000
	for i := 0; i < rows; i += perBatch {
		n := perBatch
		if i+n > rows {
			n = rows - i
		}
		// 手工拼 VALUES（值全部来自本测试的受控常量，无用户输入）
		sql := "INSERT INTO gateway_audit_logs (request_id, workspace_id, user_id, product, model_id, channel_id, mode, status, latency_ms, cost_amount, cost_currency, cost_unit, created_at) VALUES "
		for j := 0; j < n; j++ {
			if j > 0 {
				sql += ","
			}
			sql += fmt.Sprintf("('req_slo_%d','ws_slo','u','comic','m_slo','chan_slo','text-chat','success',50,0.01,'CNY','per_call', now() - interval '%d minutes')", i+j, n-j)
		}
		if _, err := s.Pool.Exec(ctx, sql); err != nil {
			t.Fatal(err)
		}
	}
	start := time.Now()
	got, err := s.DimensionStatsBy(ctx, "ws_slo", Filter{}, "", "channel", 20)
	if err != nil {
		t.Fatal(err)
	}
	elapsed := time.Since(start)
	if len(got) != 1 || got[0].Calls != rows {
		t.Fatalf("应聚合 %d 条到 chan_slo，实际 %+v", rows, got)
	}
	if elapsed > 2*time.Second {
		t.Fatalf("SLO 未达标：报表查询耗时 %v（>2s）", elapsed)
	}
}
