package main

import (
	"testing"
	"time"
)

// TASK-PROC-006 判据 7：装配的**默认值**分支。
//
// 为什么这些默认值值得锁：它们决定"没配时会怎样"——保留期清理默认关闭、
// 并发上限默认 8、监听地址默认 8085。任何一条被无意改动都会改变线上行为，
// 而"改配置默认值"在 diff 里看起来无关紧要。
//
// 注：`New` 的**必填缺失/部分配置**分支需要真实 DB（pgxpool.New + Ping），
// 属集成测试范畴，本文件只覆盖纯函数面（ConfigFromEnv 与两个 env 工具）。
func TestConfigFromEnvDefaults(t *testing.T) {
	// 清空全部相关变量，验证"什么都不配"时的默认值。
	for _, k := range []string{
		"EXECUTION_LISTEN_ADDR", "EXECUTION_MAX_CONCURRENT_JOBS",
		"EXECUTION_AUDIT_RETENTION_DAYS", "EXECUTION_AUDIT_FAILURE_RETENTION_DAYS",
		"EXECUTION_AUDIT_PURGE_INTERVAL", "EXECUTION_DATABASE_URL", "EXECUTION_INTERNAL_TOKEN",
		"ASSET_BASE_URL", "ASSET_INTERNAL_TOKEN",
	} {
		t.Setenv(k, "")
	}
	cfg := ConfigFromEnv()

	if cfg.Addr != "0.0.0.0:8085" {
		t.Fatalf("Addr 默认值应为 0.0.0.0:8085，得到 %q", cfg.Addr)
	}
	if cfg.MaxConcurrent != 8 {
		t.Fatalf("MaxConcurrent 默认值应为 8，得到 %d", cfg.MaxConcurrent)
	}
	// ★ 保留期默认必须为 0（= 清理不启动）。这条与 app_test.go 的
	// 「只认正数」不变量互为表里：D6 的 fail-safe 建立在两者之上。
	if cfg.AuditSuccess != 0 || cfg.AuditFailure != 0 {
		t.Fatalf("保留期默认应为 0（清理不启动），得到 success=%d failure=%d", cfg.AuditSuccess, cfg.AuditFailure)
	}
	if cfg.PurgeInterval != 24*time.Hour {
		t.Fatalf("清理间隔默认应为 24h，得到 %v", cfg.PurgeInterval)
	}
	if cfg.DSN != "" || cfg.Token != "" {
		t.Fatal("未配置时 DSN/Token 应为空（由 New 负责校验并退出）")
	}
}

// 配了就用配的（默认值不得覆盖显式配置）。
func TestConfigFromEnvHonorsExplicitValues(t *testing.T) {
	t.Setenv("EXECUTION_LISTEN_ADDR", "127.0.0.1:9999")
	t.Setenv("EXECUTION_MAX_CONCURRENT_JOBS", "3")
	t.Setenv("EXECUTION_AUDIT_RETENTION_DAYS", "30")
	t.Setenv("EXECUTION_AUDIT_PURGE_INTERVAL", "1h")

	cfg := ConfigFromEnv()
	if cfg.Addr != "127.0.0.1:9999" || cfg.MaxConcurrent != 3 ||
		cfg.AuditSuccess != 30 || cfg.PurgeInterval != time.Hour {
		t.Fatalf("显式配置未被采用：%+v", cfg)
	}
}
