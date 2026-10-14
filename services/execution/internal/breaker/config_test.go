package breaker

import (
	"testing"
	"time"
)

// 默认档位：allowed_fails 3 → cooldown 60s → health_check 30s（LiteLLM 参照）
func TestDefaultConfig(t *testing.T) {
	cfg := DefaultConfig()
	if !cfg.Enabled() {
		t.Fatal("默认应启用熔断")
	}
	if cfg.AllowedFails != 3 {
		t.Fatalf("默认 AllowedFails 应为 3，实际 %d", cfg.AllowedFails)
	}
	if cfg.Cooldown != 60*time.Second {
		t.Fatalf("默认 Cooldown 应为 60s，实际 %v", cfg.Cooldown)
	}
	if cfg.HealthCheck != 30*time.Second {
		t.Fatalf("默认 HealthCheck 应为 30s，实际 %v", cfg.HealthCheck)
	}
	if cfg.ProbeOwner == "" {
		t.Fatal("默认 ProbeOwner 不应为空")
	}
}

// 运营开关：EXECUTION_CIRCUIT_BREAKER=off ⇒ 熔断关闭（误伤可一键关）
func TestFromEnvDisable(t *testing.T) {
	cfg := FromEnv(func(k string) string {
		if k == "EXECUTION_CIRCUIT_BREAKER" {
			return "off"
		}
		return ""
	})
	if cfg.Enabled() {
		t.Fatal("EXECUTION_CIRCUIT_BREAKER=off 应关闭熔断")
	}
}

// 参数覆盖：allowed_fails / cooldown / health_check 均可配置
func TestFromEnvOverrides(t *testing.T) {
	cfg := FromEnv(func(k string) string {
		switch k {
		case "EXECUTION_CIRCUIT_BREAKER_ALLOWED_FAILS":
			return "5"
		case "EXECUTION_CIRCUIT_BREAKER_COOLDOWN":
			return "10s"
		case "EXECUTION_CIRCUIT_BREAKER_HEALTH_CHECK":
			return "15s"
		}
		return ""
	})
	if !cfg.Enabled() {
		t.Fatal("未显式关闭时默认启用")
	}
	if cfg.AllowedFails != 5 {
		t.Fatalf("AllowedFails 应为 5，实际 %d", cfg.AllowedFails)
	}
	if cfg.Cooldown != 10*time.Second {
		t.Fatalf("Cooldown 应为 10s，实际 %v", cfg.Cooldown)
	}
	if cfg.HealthCheck != 15*time.Second {
		t.Fatalf("HealthCheck 应为 15s，实际 %v", cfg.HealthCheck)
	}
}

// 非法值回退默认
func TestFromEnvInvalidFallsBack(t *testing.T) {
	cfg := FromEnv(func(k string) string {
		switch k {
		case "EXECUTION_CIRCUIT_BREAKER_ALLOWED_FAILS":
			return "-1" // 非法：应回退默认 3
		case "EXECUTION_CIRCUIT_BREAKER_COOLDOWN":
			return "not-a-duration"
		}
		return ""
	})
	if cfg.AllowedFails != 3 {
		t.Fatalf("非法 AllowedFails 应回退 3，实际 %d", cfg.AllowedFails)
	}
	if cfg.Cooldown != 60*time.Second {
		t.Fatalf("非法 Cooldown 应回退 60s，实际 %v", cfg.Cooldown)
	}
}
