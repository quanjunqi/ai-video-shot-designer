// Package budget 实现「预算防超支」：请求前校验（预算规则 vs 累计已用）+ 异步任务
// 预扣/结算状态机（dev-plan v1.3 §3.6 / T3）。
//
// 为什么需要它（ADR-004 实测成本差 33 倍）：治理层「日/月成本上限字段存在但=0」
// ——成本治理是"假的"。T0 完成后权威价可作拦截依据；本包把"看得见"推进到"拦得住"。
//
// 核心语义：
//   - 校验（Check）：读【生效】预算规则（租户级/工作区级 × 日/月）→ 累计已用
//     （审计实际花费 + 未结算预扣）vs 上限 → 超限 block 拦截 / 达阈值告警。
//   - 预扣/结算（Hold/Settle/Release）：异步任务提交时按模型权威价【预扣估算上限】
//     （预扣即封顶，防并发超支）；成功按实际结算退差额；失败/取消全部退扣。
//   - 原子更新：预扣/结算一律原子 UPDATE（禁读改写，BE-CONC-002）。
//   - fail-open：预算系统（读规则/查累计/写预扣）故障 → 放行 + fail_open 标记 +
//     调用方写审计"预算未校验"（禁 fail-closed 误伤全部请求）。
package budget

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
)

// Rule 是 execution 侧读到的生效预算规则（workspace 投影，字段与 store.BudgetRule 对齐）。
type Rule struct {
	Scope       string  // tenant | workspace
	Period      string  // day | month
	LimitAmount float64 // CNY
	Action      string  // warn | block
	WarnAt      float64 // 0-1 告警阈值
}

// RulesProvider 提供某工作区的【生效】预算规则。规则来自 workspace 服务（唯一事实源），
// 本接口允许注入 HTTP 客户端或测试 fake。
type RulesProvider interface {
	EffectiveRules(ctx context.Context, workspace string) ([]Rule, error)
}

// SpendProvider 提供某工作区的当日/当月累计【已花费】（审计聚合口径）。
type SpendProvider interface {
	Spend(ctx context.Context, workspace string) (day float64, month float64, err error)
}

// Decision 是一次预算校验的结论。
type Decision struct {
	Allowed bool
	// Reason 人类可读原因（用于响应与审计）。
	Reason string
	// Status 审计状态标记：budget_blocked / budget_warn / budget_ok / budget_unchecked。
	Status string
	// WarnLevel 达阈值时的告警级别（"" 不告警；"warn" 常规；"critical" 严重 95%）。
	WarnLevel string
	// FailOpen 本次校验是否因系统故障放行（true = 未校验/未预扣）。
	FailOpen bool
}

// ErrBudgetSystem 表示预算系统故障（读规则/查累计失败）。调用方应 fail-open 放行并告警。
var ErrBudgetSystem = errors.New("budget system unavailable")

// Checker 是请求前预算校验器。它不持有跨请求状态（规则每次现读，立即生效）。
type Checker struct {
	rules  RulesProvider
	spend  SpendProvider
	logger *slog.Logger
}

func NewChecker(rules RulesProvider, spend SpendProvider, logger *slog.Logger) *Checker {
	return &Checker{rules: rules, spend: spend, logger: logger}
}

// Check 做请求前预算校验：读生效规则 → 计算已用（实际花费 + 未结算预扣由调用方经
// UsedProvider 提供）→ 返回决策。规则/累计故障时 fail-open（Allowed + FailOpen）。
//
// used 入参：调用方负责把【预扣封顶金额】叠加进已用（本包不直接查 holds，
// 由调用方注入，保持本文件无 DB 依赖、可单测）。
func (c *Checker) Check(ctx context.Context, workspace string, used Used) Decision {
	rules, err := c.rules.EffectiveRules(ctx, workspace)
	if err != nil {
		c.logger.Warn("budget: rules unavailable, fail-open", "workspace", workspace, "error", err)
		return Decision{Allowed: true, Status: "budget_unchecked", FailOpen: true, Reason: "budget rules unavailable"}
	}
	day, month, err := c.spend.Spend(ctx, workspace)
	if err != nil {
		c.logger.Warn("budget: spend aggregation unavailable, fail-open", "workspace", workspace, "error", err)
		return Decision{Allowed: true, Status: "budget_unchecked", FailOpen: true, Reason: "budget spend unavailable"}
	}
	// 无生效规则 → 默认放行（未配置规则不拦截）。
	if len(rules) == 0 {
		return Decision{Allowed: true, Status: "budget_ok"}
	}
	// 同周期只取一条：工作区级覆盖租户级（后列者覆盖前列；调用方返回顺序保证
	// workspace 在前或经本函数去重）。已用 = 审计实际花费 + 未结算预扣（预扣即封顶）。
	usedDay := day + used.Day
	usedMonth := month + used.Month
	byPeriod := map[string]Rule{}
	for _, r := range rules {
		if r.Action != "block" && r.Action != "warn" {
			continue
		}
		byPeriod[r.Period] = r // 同周期后者覆盖（租户在前、工作区在后）
	}
	for _, r := range byPeriod {
		var current float64
		if r.Period == "day" {
			current = usedDay
		} else {
			current = usedMonth
		}
		ratio := 0.0
		if r.LimitAmount > 0 {
			ratio = current / r.LimitAmount
		}
		// 顺序敏感：block 动作且已超限 → 先拦截（阈值告警在"已超限"之后无意义）；
		// warn 动作永不拦截，超限仍放行但告警（阈值告警含超限场景）。
		if ratio >= 1 && r.Action == "block" {
			return Decision{
				Allowed: false,
				Reason:  fmt.Sprintf("已达%s预算上限（%.2f / %.2f），请调整预算或稍后重试", r.Period, current, r.LimitAmount),
				Status:  "budget_blocked",
			}
		}
		// 阈值告警：0.95 严重告警；>=warn_at 常规告警。
		if ratio >= 0.95 {
			return Decision{
				Allowed: true,
				Reason:  fmt.Sprintf("已达预算严重告警线（%.0f%%），%s 周期上限 %.2f / 已用 %.2f", ratio*100, r.Period, r.LimitAmount, current),
				Status:  "budget_warn_critical", WarnLevel: "critical",
			}
		}
		if ratio >= r.WarnAt && r.WarnAt > 0 {
			return Decision{
				Allowed: true,
				Reason:  fmt.Sprintf("已达预算告警线（%.0f%%），%s 周期上限 %.2f / 已用 %.2f", ratio*100, r.Period, r.LimitAmount, current),
				Status:  "budget_warn", WarnLevel: "warn",
			}
		}
	}
	return Decision{Allowed: true, Status: "budget_ok"}
}

// Used 是已用金额的叠加视图：调用方把【预扣封顶】并入（未结算 holds 的周期合计）。
type Used struct {
	Day   float64
	Month float64
}

// 三态状态机常量（与迁移 016 的 CHECK 约束一致）。
const (
	StatusPending  = "pending"
	StatusSettled  = "settled"
	StatusReleased = "released"
)

// HoldRecord 是预扣行投影。
type HoldRecord struct {
	ID           string
	JobID        string
	WorkspaceID  string
	Period       string
	Status       string
	HoldAmount   float64
	ActualAmount float64
	RefundAmount float64
	FailOpen     bool
}

// HoldsStore 是预扣/结算状态机的存储接口（pgx 实现 + 测试 fake）。
// 所有写操作必须是原子 UPDATE/INSERT（BE-CONC-002：禁读改写）。
type HoldsStore interface {
	// Hold 写入一个预扣行（pending）。job 维度唯一（UNIQUE(job_id)）；
	// 重复 Hold 幂等返回已有行。
	Hold(ctx context.Context, h HoldRecord) (HoldRecord, error)
	// Settle 结算：仅当 status=pending 时原子更新为 settled，
	// 退还 预扣-实际 差额。返回是否发生更新。
	Settle(ctx context.Context, id string, actual float64) (bool, error)
	// Release 退扣：仅当 status=pending 时原子更新为 released（全部退还）。返回是否发生更新。
	Release(ctx context.Context, id string) (bool, error)
	// Outstanding 返回某工作区【未结算预扣】的日/月合计（预扣即封顶，供校验叠加）。
	Outstanding(ctx context.Context, workspace string) (day float64, month float64, err error)
}
