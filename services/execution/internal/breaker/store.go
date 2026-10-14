package breaker

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Unit 是一个供给单元（渠道×模型），熔断粒度。
type Unit struct {
	ChannelID     string
	ProviderModel string
}

// String 返回单元的日志/错误可读标识。
func (u Unit) String() string { return u.ChannelID + "/" + u.ProviderModel }

// Store 是 channel_health 的访问层（多副本共享事实源）。
//
// 不变式：
//   - 计数/冷却/探活占位一律**原子 UPDATE**（无读改写竞态；BE-CONC-002 禁本地内存跨实例计数）
//   - 熔断系统故障 **fail-open**：DB 不可用时 FilterHealthy 放行全部候选 + 日志告警，
//     不误伤正常请求（access-design §3.4）
//   - 半开探活单飞：占位条件 cooldown_until <= now AND probe_owner IS NULL，
//     同一冷却单元同时只允许一个实例探活
type Store struct {
	Pool *pgxpool.Pool
	Cfg  Config
	Log  *slog.Logger
}

// New 构造熔断 Store。Log 为 nil 时用默认 logger。
func New(pool *pgxpool.Pool, cfg Config, log *slog.Logger) *Store {
	if log == nil {
		log = slog.Default()
	}
	return &Store{Pool: pool, Cfg: cfg, Log: log}
}

// Health 返回某单元的健康状态（冷却是否进行中）。
// 返回 (cooling bool, coolingUntil *time.Time, err)。
// DB 故障时 fail-open：返回 (false, nil, err)，调用方按"放行"处理。
func (s *Store) Health(ctx context.Context, u Unit) (bool, *time.Time, error) {
	if s == nil || s.Pool == nil {
		return false, nil, nil // fail-open：未装配视为健康
	}
	var until *time.Time
	err := s.Pool.QueryRow(ctx,
		`SELECT cooldown_until FROM channel_health WHERE channel_id=$1 AND provider_model=$2`,
		u.ChannelID, u.ProviderModel,
	).Scan(&until)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil, nil // 无记录 = 健康
	}
	if err != nil {
		s.Log.Warn("breaker: channel_health query failed, fail-open", "unit", u.String(), "err", err)
		return false, nil, err
	}
	if until == nil {
		return false, nil, nil
	}
	return until.After(time.Now()), until, nil
}

// FilterHealthy 从候选序列中剔除冷却中的单元（不消耗尝试次数）。
//
// 语义：候选序列顺序保持（routePriority 升序不变）；冷却中的单元被剔除；
// 全部冷却时返回 ErrUnitCooling（调用方据此返回显式失败，不静默放行）；
// DB 故障 fail-open：原样返回候选 + 告警日志。
func (s *Store) FilterHealthy(ctx context.Context, cands []Unit) ([]Unit, error) {
	if s == nil || s.Pool == nil || !s.Cfg.Enabled() {
		return cands, nil
	}
	out := make([]Unit, 0, len(cands))
	var coolingErr error
	for _, u := range cands {
		cooling, _, err := s.Health(ctx, u)
		if err != nil {
			coolingErr = err
			continue // fail-open：该单元放行
		}
		if !cooling {
			out = append(out, u)
		}
	}
	if len(out) == 0 && len(cands) > 0 && coolingErr == nil {
		return nil, ErrUnitCooling
	}
	return out, coolingErr
}

// RecordFailure 记录一次失败（软 4xx / 5xx / 超时 / 网络层），原子计数。
//
// 达阈值 ⇒ 进入冷却（cooldown_until = now + Cooldown）。
// 熔断关闭 / DB 故障：仅日志，不阻断主流程（fail-open）。
func (s *Store) RecordFailure(ctx context.Context, u Unit) {
	if s == nil || s.Pool == nil || !s.Cfg.Enabled() {
		return
	}
	_, err := s.Pool.Exec(ctx, `
		INSERT INTO channel_health (channel_id, provider_model, fail_count, cooldown_until, last_failure_at, updated_at)
		VALUES ($1, $2, 1, NULL, now(), now())
		ON CONFLICT (channel_id, provider_model) DO UPDATE SET
			fail_count = channel_health.fail_count + 1,
			last_failure_at = now(),
			updated_at = now(),
			cooldown_until = CASE
				WHEN channel_health.fail_count + 1 >= $3 THEN now() + make_interval(secs => $4)
				ELSE channel_health.cooldown_until
			END
	`, u.ChannelID, u.ProviderModel, s.Cfg.AllowedFails, s.Cfg.Cooldown.Seconds())
	if err != nil {
		s.Log.Warn("breaker: RecordFailure failed (fail-open)", "unit", u.String(), "err", err)
	}
}

// RecordSuccess 记录一次成功：重置计数、清冷却（恢复）。
// 熔断关闭 / DB 故障：仅日志，不阻断主流程。
func (s *Store) RecordSuccess(ctx context.Context, u Unit) {
	if s == nil || s.Pool == nil || !s.Cfg.Enabled() {
		return
	}
	_, err := s.Pool.Exec(ctx, `
		INSERT INTO channel_health (channel_id, provider_model, fail_count, cooldown_until, last_success_at, updated_at)
		VALUES ($1, $2, 0, NULL, now(), now())
		ON CONFLICT (channel_id, provider_model) DO UPDATE SET
			fail_count = 0,
			cooldown_until = NULL,
			probe_owner = NULL,
			last_success_at = now(),
			updated_at = now()
	`, u.ChannelID, u.ProviderModel)
	if err != nil {
		s.Log.Warn("breaker: RecordSuccess failed (fail-open)", "unit", u.String(), "err", err)
	}
}

// TryAcquireProbe 尝试原子占位半开探活（单飞）。
//
// 占位条件：cooldown_until <= now（冷却到期）AND (probe_owner IS NULL OR 自己)；
// 返回 true 表示本实例拿到探活权（后续探活请求不计入失败计数）。
// 未到冷却期 / 已被其他实例占位 ⇒ 返回 false（不阻塞，继续盲试）。
func (s *Store) TryAcquireProbe(ctx context.Context, u Unit) bool {
	if s == nil || s.Pool == nil || !s.Cfg.Enabled() {
		return false
	}
	tag, err := s.Pool.Exec(ctx, `
		UPDATE channel_health SET
			probe_owner = $3,
			probe_at = now(),
			updated_at = now()
		WHERE channel_id = $1 AND provider_model = $2
			AND cooldown_until IS NOT NULL
			AND cooldown_until <= now()
			AND (probe_owner IS NULL OR probe_owner = $3)
	`, u.ChannelID, u.ProviderModel, s.Cfg.ProbeOwner)
	if err != nil {
		s.Log.Warn("breaker: TryAcquireProbe failed (fail-open)", "unit", u.String(), "err", err)
		return false
	}
	return tag.RowsAffected() == 1
}

// FormatUnit 生成审计/日志用的单元描述（避免散落的拼接）。
func FormatUnit(channelID, providerModel string) string {
	return Unit{ChannelID: channelID, ProviderModel: providerModel}.String()
}
