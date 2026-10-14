package audit

import (
	"context"

	"fmt"
)

// Log 网关调用审计日志记录

// ShotID/Feature 业务归因（T1，迁移 013）：回答"钱花在哪个分镜/功能"。
// 缺失一律置空容忍，不报错、不阻塞主流程（§3.7 协议）。

// comic/canvas/create

// text-chat/text-to-image/image-to-image/...

// success/failed/rate_limited/cancelled/timeout

// CostUnit 记录本次调用成本的计费单位（per_call/per_second/per_mtok_input/per_mtok_output）。
// T0 价格校准新增：来源 = 命中模型的 model_catalog.cost_unit（迁移 012 新增列）。
// 空 = 该模型无校准价（成本为 0 的"预估"口径，T2 报表据此区分已校准/预估）。

// Store 审计日志存储

// Insert 插入一条审计日志（同步写入，不异步丢失）

// D5a：L0 脱敏在【写库入口】做 —— 唯一收口，任何调用方都不可能忘记。

// UpdateResult 更新审计日志的结果（异步任务完成后调用）

// UpdateResultByJobID 按 job_id 把任务终态写回审计日志（D2）。
//
// 为什么按 job_id 而不是 request_id：
//
//	job.Job（job/store.go:36-58）与 jobs 表都【没有 request_id】，
//	而 gateway_audit_logs 已有 job_id 列，且提交路径对异步任务已写入该列
//	（httpapi/handler.go 的 writeAudit("queued", …, j.ID, "")）。
//	⇒ 按 job_id 定位无需任何 schema 变更。
//
// costUnit（第 11 参数，T0 新增）：异步终态把命中模型的计费单位一并回写；
// 空 = 不覆盖既有值（提交时已写）或保持无校准口径。COALESCE(NULLIF(…)) 语义：
// 空串不动原值，非空才覆盖 —— 避免"同步提交写了 unit、异步回写又把 unit 清空"。
//
// 返回受影响行数：0 表示该 job【没有提交时的审计行】（例如经 /internal/v1/tasks 提交的任务）。
// 调用方必须把这个 0 打出来 —— 静默的空更新会重现"审计看起来有、其实没更新"的问题。

// D5a：同一个收口点，异步终态也走 L0 脱敏

// channel_id/provider_model（T1）：submit-time 行提交时未知，终态由 worker 补齐
// （供给单元 = 渠道×模型，T2 报表聚合依赖；空串不覆盖既有值，与 cost_unit 同语义）。

// Purge 删除超出保留期的审计行，返回删除行数（D6）。
//
// 为什么必须"事务 + SET LOCAL"：
//
//	迁移 011 的 trg_audit_logs_guard 默认【拒绝 DELETE】，
//	只认 `SET LOCAL app.allow_audit_purge = 'on'`；而 SET LOCAL 仅在事务内有效。
//	⇒ 清理只能以这种方式进行，**"顺手删一条"仍然做不到**（这是刻意的双保险）。
//
// 两个窗口（调用方传入，<=0 表示该类不清理）：
//
//	success 行保留 successDays 天（合规留痕与成本归因的周期更长）
//	非 success 行保留 failureDays 天（故障定位的时效更短）

// 两个窗口都关闭 ⇒ 什么也不做（绝不在默认状态下删数据）

// Spend 返回某 workspace 的**当日/当月**累计花费（用于成本上限判定）。
// 依赖 (workspace_id, created_at) 索引（见迁移 009）。

// ListByWorkspace 按租户查询审计日志
// SystemWorkspace 是"系统自身动作"（而非某个租户调用）的审计归属（D6）。
//
// 为什么用哨兵值而不是挑一个真实 workspace：
//
//	清理是【全库】动作，不属于任何租户。若挂到某个真实 workspace 下，
//	那个租户的列表/聚合里就会凭空多出"删除了 N 行"——是误归因。
//	用哨兵值则天然隔离：列表与聚合都按 workspace_id 过滤，永不会带出它。

// Filter 是审计查询的筛选条件（D7a）。零值表示不筛该项。

// 任务卡 §2.1「合规留痕」要求「按**人/项目**/时间的操作清单」
// ⇒ 这两项必须能服务端筛（此前前端只能在【当前页】上做文本过滤，
//   于是用户看到筛过的列表、而 total/stats 仍是全集 —— 是误导）。

// created_at >= Since
// created_at <= Until

// whereClause 生成筛选条件（参数从 $2 起，$1 固定为 workspace_id）。

// ListByWorkspace 返回一页审计日志与【筛选后的总数】（D7a）。
//
// 改动原因（判据）：此前签名没有筛选，返回也没有总数，而 handler 用 len(logs) 当 total
// ⇒ 「total」实际是【当前页条数】；且查询无法按 status/model/channel/时间筛选，
// 尽管表上为 status/model/project 建过索引（索引在场却没有查询使用）。
//
// total 用 COUNT(*) OVER() 在【同一条查询】里取，避免第二次往返；
// 注意：offset 之后 total 仍是筛选后的全集条数（窗口函数在 LIMIT 之前计算）。

// ExportAll 返回筛选后的审计行（导出用），最多 maxRows 行。
//
// 为什么单独一个方法而不是复用 ListByWorkspace：
//
//	导出的语义是"给我筛选后的这一批"，不是"第 N 页"；用同一个方法会让
//	limit/offset 的分页语义混进导出，容易误用（例如 offset 被当成"跳过多少行再导出"）。
//	maxRows 是防爆护栏：导出必须有上界，否则一次请求就能把整表拉进内存。

// AggregateResult 是【筛选后全集】的聚合结果（D7a + ④ §2.3 的耗时百分位）。
//
// 用结构体而不是多返回值：聚合维度会增加，多返回值很快就会变成"位置参数猜谜"。

// P50/P95：任务卡 §2.3「故障定位」明确要求「P50/P95 耗时」（此前只有平均值）。

// TopErrors：任务卡 §2.3 的「按错误文本聚类」。

// TokensByModel / TokensByChannel：任务卡 §2.2「成本归因」的 SUM 维度
// （按渠道/模型/项目/时间的 SUM）。见 TokenUsage 上关于"为什么先做 token 而不是金额"的说明。

// TokenUsage 是按某个维度聚合的 token 用量。
//
// **为什么先做 token、而不是金额 SUM**：`cost_amount` 目前**恒为 0** ——
// 计费单位尚未确定（D4b），金额 SUM 现在做出来只会显示 0，**反而误导**；
// 而 token 是 D4a/D4c 已经落地的**真实数据**（判据：开发库 mod_aaa… 有 in=35/out=38）。
// 等 D4b 定下单位后，同一套按维度聚合的写法可直接加上金额列。

// Key 维度取值；未标注时统一显示为 (未标注)

// tokenDimensionWhitelist：维度名来自调用方，**绝不能**直接拼进 SQL。
// 白名单是这里唯一的防线，所以它必须是显式的 map，而不是字符串前缀判断。

// TokenUsageBy 按白名单维度聚合 token 用量（同一筛选口径与租户）。
// 只统计**有 token 的行**：全 0 的行（校验失败等）没有用量可言，混进来只会稀释平均数。
func (s Store) TokenUsageBy(ctx context.Context, workspaceID string, f Filter, dimension string, limit int) ([]TokenUsage, error) {
	col, ok := tokenDimensionWhitelist[dimension]
	if !ok {
		return nil, fmt.Errorf("unsupported token dimension %q (allowed: model|channel)", dimension)
	}
	if limit <= 0 || limit > 50 {
		limit = 5
	}
	rows, err := s.Pool.Query(ctx, `
		SELECT COALESCE(NULLIF(`+col+`, ''), '(未标注)') AS key,
		       COALESCE(sum(token_input), 0)::bigint,
		       COALESCE(sum(token_output), 0)::bigint,
		       COALESCE(sum(token_cached), 0)::bigint,
		       count(*)::bigint
		FROM gateway_audit_logs
		WHERE workspace_id = $1 AND (token_input > 0 OR token_output > 0 OR token_cached > 0)`+f.whereClause()+`
		GROUP BY key
		ORDER BY (COALESCE(sum(token_input), 0) + COALESCE(sum(token_output), 0)) DESC,
		         COALESCE(NULLIF(`+col+`, ''), '(未标注)') COLLATE "C" ASC
		LIMIT $9`,
		workspaceID, f.Status, f.ModelID, f.ChannelID, f.Since, f.Until, f.UserID, f.ProjectID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]TokenUsage, 0, limit)
	for rows.Next() {
		var u TokenUsage
		if err := rows.Scan(&u.Key, &u.Input, &u.Output, &u.Cached, &u.Calls); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// ErrorCluster 是一簇错误文本。
//
// 库里**没有错误码列**（判据：gateway_audit_logs 只有 error_message text），但实测形状很稳定：
// **稳定前缀 + ':' + 变量尾部**，例如
//
//	"required parameter missing: messages" / "required parameter missing: model"
//	"catalog unavailable: catalog: Get \"http://…\": dial tcp …"
//
// 且**大小写不一致**（"model not found in directory" vs "invalid generate request JSON"）。
// ⇒ 最小忠实的"聚类"= 取**第一个冒号之前**的部分、trim、**转小写**作为簇键。
// **不引入相似度算法**：那会让"同一簇"变成说不清的东西，而这里要的是**可解释**的归类。

// Key 规范化后的簇键（小写、去变量尾部）——用于分组/去重

// Sample 该簇里字典序最小的原始前缀（保留原大小写，供人阅读）

// ★ 这三个 tag 是必需的：没有它们，JSON 会发成 Key/Sample/Count（首字母大写），
//   而前端类型读的是 key/sample/count ⇒ 界面会显示 undefined。本项目真实踩到过
//   （错误分布那块界面），是靠"在真实实例上核对 wire 格式"发现的。

// topErrorsLimit：界面一屏能看几条。刻意取小 —— 聚合用来看"形状"，
// 不是用来导出的（导出走 CSV，含全部原始 error_message）。

// Aggregate 返回【筛选后全集】的按状态计数、平均耗时与耗时百分位（D7a）。
//
// 为什么要服务端算：前端此前在【当前页】（limit:100）上算成功率与平均耗时
// ⇒ 翻页/筛选后"统计"会变，是【假统计】。
//
// ★ 零耗时的处理（与既有平均值保持一致，不是新决定）：
//
//	`latency_ms` 是 NOT NULL DEFAULT 0，0 表示"没有测量到"而不是"瞬时完成"。
//	下面算平均值时本来就跳过了 avg=0 的状态组；百分位因此同样用 `latency_ms > 0` 排除零 ——
//	否则 2 行未测量的数据会把 P50 直接拉到 0，把"耗时分布"变成假象。

// 耗时百分位：在同一次筛选条件、同一个 workspace 上算（语义与 byStatus 一致：filtered_total）。
// percentile_cont 是连续插值；空集返回 NULL ⇒ COALESCE 归 0。

// ④ §2.3「按错误文本聚类」。与上面**同一套筛选条件与同一租户**（口径一致）。
//   key    = 第一个冒号之前、trim、转小写（分组用）
//   sample = 同簇里"最小"的原始前缀（展示用）
//
// ★ 两处显式 COLLATE "C"：text 的 min()/ORDER BY 结果依赖**数据库排序规则** ——
//   字节序（C）下 'M'(0x4D) < 'm'(0x6D)，而 UTF-8/ICU 排序会得出相反结果。
//   实测：本机（C）取到 "Model Not Found…"，CI 取到 "model not found…"。
//   显式指定 C 后，同一份数据的返回**在任何环境都相同**（可复现），
//   而不是"取决于这台机器怎么排序"。

// §2.2 成本归因的 SUM 维度（按模型 / 按渠道）。两个维度各一次聚合；
// 若将来维度变多，可换成单条 `GROUP BY GROUPING SETS` 查询（这里先保持可读）。

// AggregateRecentCosts 聚合最近 7 天成功调用的实际成本（按 model_id 分组，T0 对账用）。
//
// 语义：actual = 审计回写的权威成本（sync/async 路径均已接权威价）；
// 返回 reconcile.ActualCost 供对账纯函数直接消费（同 unit 内聚合，避免跨单位相加）。
// limit 限制返回的模型行数（按总成本降序），防止目录膨胀时对账集失控。

// ===== T2 运营报表聚合（维度排行 + 时间序列） =====

// StatsDimensions：报表维度白名单（handler 校验 + store SQL 防注入共用）。
// 维度名来自调用方，绝不能直接拼进 SQL —— 白名单是唯一的防线，必须是显式 map。

// Granularities：趋势粒度白名单（date_trunc 的单位）。

// DimensionStat 是按某维度聚合的一行排行结果。
//
// 双口径（与 T0 语义一致）：cost_amount>0 且有 cost_unit 的行 = 已校准（cost_calibrated，
// 可进入预算拦截）；cost_amount<=0 或 unit 空 = 预估（cost_estimated_calls 计数，不
// 进入已校准合计 —— 防止"精确地算错账"）。

// 0-100，handler 计算

// TrendPoint 是时间序列的一个桶（日/周/月粒度）。

// DimensionStatsBy 按白名单维度聚合审计日志（排行，topN）。
//
// feature 是归因过滤（T1 迁移 013 列）：空 = 不过滤。不并入 Filter 结构体，
// 是为了不动 whereClause 的 $ 序号（列表/导出/Aggregate 共用同一 whereClause）。
// 排序：成本降序 → 调用量降序 → key 字节序 —— 确定性次序，前端可直接渲染。
func (s Store) DimensionStatsBy(ctx context.Context, workspaceID string, f Filter, feature, dimension string, limit int) ([]DimensionStat, error) {
	col, ok := StatsDimensions[dimension]
	if !ok {
		return nil, fmt.Errorf("unsupported stats dimension %q (allowed: channel|model|project|member)", dimension)
	}
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	rows, err := s.Pool.Query(ctx, `
		SELECT COALESCE(NULLIF(`+col+`, ''), '(未标注)') AS key,
		       count(*)::bigint AS calls,
		       count(*) FILTER (WHERE status = 'success' OR status = 'succeeded')::bigint AS success_calls,
		       count(*) FILTER (WHERE status <> 'success' AND status <> 'succeeded')::bigint AS failed_calls,
		       percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)
		         FILTER (WHERE status = 'success' OR status = 'succeeded') AS p95,
		       COALESCE(sum(cost_amount) FILTER (WHERE cost_amount > 0 AND COALESCE(cost_unit, '') <> ''), 0) AS cost_calibrated,
		       count(*) FILTER (WHERE cost_amount <= 0 OR COALESCE(cost_unit, '') = '')::bigint AS cost_estimated_calls
		FROM gateway_audit_logs
		WHERE workspace_id = $1`+f.whereClause()+`
		  AND ($9 = '' OR feature = $9)
		-- GROUP BY / ORDER BY 用【完整表达式】而非位置序号：PG 在单组查询里会把
		-- ORDER BY 的裸数字当成整数常量（报 collations not supported by type integer），
		-- 位置引用不可靠；别名又会被解析为列名（key/calls 不是表列）⇒ 重复表达式最稳。
		GROUP BY COALESCE(NULLIF(`+col+`, ''), '(未标注)')
		ORDER BY COALESCE(sum(cost_amount) FILTER (WHERE cost_amount > 0 AND COALESCE(cost_unit, '') <> ''), 0) DESC,
		         count(*) DESC,
		         COALESCE(NULLIF(`+col+`, ''), '(未标注)') COLLATE "C" ASC
		LIMIT $10`,
		workspaceID, f.Status, f.ModelID, f.ChannelID, f.Since, f.Until, f.UserID, f.ProjectID, feature, limit)
	if err != nil {
		return nil, fmt.Errorf("audit stats by %s: %w", dimension, err)
	}
	defer rows.Close()
	var out []DimensionStat
	for rows.Next() {
		var d DimensionStat
		var p95 *float64 // 该维度下无成功行时 p95 为 NULL
		if err := rows.Scan(&d.Key, &d.Calls, &d.SuccessCalls, &d.FailedCalls, &p95, &d.CostCalibrated, &d.CostEstimatedCalls); err != nil {
			return nil, fmt.Errorf("audit stats by %s: %w", dimension, err)
		}
		if p95 != nil {
			d.P95LatencyMs = int64(*p95)
		}
		out = append(out, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("audit stats by %s: %w", dimension, err)
	}
	return out, nil
}

// Trend 按日/周/月粒度聚合时间序列（可选按单一维度值下钻）。
// dimension/dimensionValue 均为可选：dimension 空 = 全量趋势。
func (s Store) Trend(ctx context.Context, workspaceID string, f Filter, feature, granularity, dimension, dimensionValue string) ([]TrendPoint, error) {
	unit, ok := Granularities[granularity]
	if !ok {
		return nil, fmt.Errorf("unsupported trend granularity %q (allowed: day|week|month)", granularity)
	}
	dimCol := ""
	drilldown := ""
	if dimension != "" {
		c, ok := StatsDimensions[dimension]
		if !ok {
			return nil, fmt.Errorf("unsupported stats dimension %q (allowed: channel|model|project|member)", dimension)
		}
		dimCol = c
		// 下钻条件只在 dimension 非空时拼接 —— 空列名会生成 `OR  = $11` 语法错误。
		drilldown = " AND ($11 = '' OR " + dimCol + " = $11)"
	}
	rows, err := s.Pool.Query(ctx, `
		SELECT date_trunc($10::text, created_at) AS bucket,
		       count(*)::bigint,
		       count(*) FILTER (WHERE status = 'success' OR status = 'succeeded')::bigint,
		       percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)
		         FILTER (WHERE status = 'success' OR status = 'succeeded') AS p95,
		       COALESCE(sum(cost_amount) FILTER (WHERE cost_amount > 0 AND COALESCE(cost_unit, '') <> ''), 0) AS cost_calibrated,
		       count(*) FILTER (WHERE cost_amount <= 0 OR COALESCE(cost_unit, '') = '')::bigint
		FROM gateway_audit_logs
		WHERE workspace_id = $1`+f.whereClause()+`
		  AND ($9 = '' OR feature = $9)`+drilldown+`
		GROUP BY date_trunc($10::text, created_at)
		ORDER BY date_trunc($10::text, created_at)`,
		func() []any {
			args := []any{workspaceID, f.Status, f.ModelID, f.ChannelID, f.Since, f.Until, f.UserID, f.ProjectID, feature, unit}
			if drilldown != "" {
				args = append(args, dimensionValue)
			}
			return args
		}()...)
	if err != nil {
		return nil, fmt.Errorf("audit trend: %w", err)
	}
	defer rows.Close()
	var out []TrendPoint
	for rows.Next() {
		var t TrendPoint
		var p95 *float64
		if err := rows.Scan(&t.Bucket, &t.Calls, &t.SuccessCalls, &p95, &t.CostCalibrated, &t.CostEstimatedCalls); err != nil {
			return nil, fmt.Errorf("audit trend: %w", err)
		}
		if p95 != nil {
			t.P95LatencyMs = int64(*p95)
		}
		out = append(out, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("audit trend: %w", err)
	}
	return out, nil
}
