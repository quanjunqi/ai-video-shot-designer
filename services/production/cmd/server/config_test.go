package main

import "testing"

// TASK-PROC-006 判据 7：装配的**默认值**分支（production）。
// 监听地址默认 127.0.0.1:8081 —— 注意与 execution 的 0.0.0.0:8085 不同，
// production 默认只绑本地（它是内网 API，由 BFF 调用）。
func TestConfigFromEnvDefaults(t *testing.T) {
	for _, k := range []string{
		"PRODUCTION_LISTEN_ADDR", "PRODUCTION_DATABASE_URL", "PRODUCTION_INTERNAL_TOKEN",
		"PRODUCTION_WORKSPACE_URL", "PRODUCTION_WORKSPACE_TOKEN",
	} {
		t.Setenv(k, "")
	}
	cfg := ConfigFromEnv()
	if cfg.Addr != "127.0.0.1:8081" {
		t.Fatalf("Addr 默认值应为 127.0.0.1:8081，得到 %q", cfg.Addr)
	}
	if cfg.DatabaseURL != "" || cfg.Token != "" {
		t.Fatal("未配置时 DatabaseURL/Token 应为空（由 New 负责校验并退出）")
	}
}

func TestConfigFromEnvHonorsExplicitValues(t *testing.T) {
	t.Setenv("PRODUCTION_LISTEN_ADDR", "0.0.0.0:1234")
	t.Setenv("PRODUCTION_DATABASE_URL", "postgres://x")
	t.Setenv("PRODUCTION_INTERNAL_TOKEN", "tok")
	cfg := ConfigFromEnv()
	if cfg.Addr != "0.0.0.0:1234" || cfg.DatabaseURL != "postgres://x" || cfg.Token != "tok" {
		t.Fatalf("显式配置未被采用：%+v", cfg)
	}
}
