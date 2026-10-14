package breaker

import (
	"os"
	"strconv"
	"time"
)

// Config 是熔断运行参数（LiteLLM 三件套档位：allowed_fails 3 → cooldown 60s → health_check 30s）。
type Config struct {
	// Disabled 是运营开关：熔断参数误伤可一键关闭。关闭后 FilterHealthy 恒放行、
	// RecordFailure 不计数（保持"盲试"行为）。默认 false（熔断启用）。
	Disabled bool
	// AllowedFails 是连续失败计数阈值：达到即进入冷却。默认 3。
	AllowedFails int
	// Cooldown 是冷却时长。默认 60s。
	Cooldown time.Duration
	// HealthCheck 是半开探活频率下限：同一冷却单元两次探活的最小间隔。默认 30s。
	HealthCheck time.Duration
	// ProbeOwner 是本实例的探活占位标识（多副本时用于区分"谁在探活"）。
	ProbeOwner string
}

// DefaultConfig 是 LiteLLM 档位的默认值。
func DefaultConfig() Config {
	owner := "unknown"
	if host, err := os.Hostname(); err == nil {
		owner = host
	}
	return Config{
		Disabled:     false,
		AllowedFails: 3,
		Cooldown:     60 * time.Second,
		HealthCheck:  30 * time.Second,
		ProbeOwner:   owner,
	}
}

// FromEnv 从环境变量装配熔断配置（BE-CFG：配置收敛在 cmd 装配，默认值兜底）。
//
//   - EXECUTION_CIRCUIT_BREAKER=off|false|0  ⇒ 关闭熔断（运营开关）
//   - EXECUTION_CIRCUIT_BREAKER_ALLOWED_FAILS   连续失败阈值（默认 3）
//   - EXECUTION_CIRCUIT_BREAKER_COOLDOWN        冷却时长（Go duration，默认 60s）
//   - EXECUTION_CIRCUIT_BREAKER_HEALTH_CHECK    半开探活频率下限（默认 30s）
//   - EXECUTION_CIRCUIT_BREAKER_PROBE_OWNER     本实例探活占位标识（默认 hostname@pid）
func FromEnv(get func(string) string) Config {
	cfg := DefaultConfig()
	if get == nil {
		return cfg
	}
	if v := get("EXECUTION_CIRCUIT_BREAKER"); v == "off" || v == "false" || v == "0" {
		cfg.Disabled = true
	}
	if v := get("EXECUTION_CIRCUIT_BREAKER_ALLOWED_FAILS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.AllowedFails = n
		}
	}
	if v := get("EXECUTION_CIRCUIT_BREAKER_COOLDOWN"); v != "" {
		if d, err := time.ParseDuration(v); err == nil && d > 0 {
			cfg.Cooldown = d
		}
	}
	if v := get("EXECUTION_CIRCUIT_BREAKER_HEALTH_CHECK"); v != "" {
		if d, err := time.ParseDuration(v); err == nil && d > 0 {
			cfg.HealthCheck = d
		}
	}
	if v := get("EXECUTION_CIRCUIT_BREAKER_PROBE_OWNER"); v != "" {
		cfg.ProbeOwner = v
	} else if host, err := os.Hostname(); err == nil {
		cfg.ProbeOwner = host
	} else {
		cfg.ProbeOwner = "unknown"
	}
	return cfg
}

// Enabled 返回熔断是否启用（fail-open 的总开关：关闭时一切熔断语义不生效）。
func (c Config) Enabled() bool { return !c.Disabled }
