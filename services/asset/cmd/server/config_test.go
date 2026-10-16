package main

import "testing"

// TASK-PROC-006 判据 7：装配的**默认值**分支（asset）。
// 关键默认：endpoint=minio:9000、bucket=assets、addr=0.0.0.0:8084、max=100MiB。
func TestConfigFromEnvDefaults(t *testing.T) {
	for _, k := range []string{
		"ASSET_LISTEN_ADDR", "ASSET_S3_ENDPOINT", "ASSET_S3_BUCKET",
		"ASSET_MAX_BYTES", "ASSET_DATABASE_URL", "ASSET_INTERNAL_TOKEN",
	} {
		t.Setenv(k, "")
	}
	cfg := ConfigFromEnv()
	if cfg.Endpoint != "minio:9000" {
		t.Fatalf("Endpoint 默认值应为 minio:9000，得到 %q", cfg.Endpoint)
	}
	if cfg.Bucket != "assets" {
		t.Fatalf("Bucket 默认值应为 assets，得到 %q", cfg.Bucket)
	}
	if cfg.Addr != "0.0.0.0:8084" {
		t.Fatalf("Addr 默认值应为 0.0.0.0:8084，得到 %q", cfg.Addr)
	}
	if cfg.MaxBytes != 100*1024*1024 {
		t.Fatalf("MaxBytes 默认值应为 100MiB，得到 %d", cfg.MaxBytes)
	}
}

// MAX_BYTES 的解析规则：**只认正数**（与 execution 的保留期同一条口径）——
// 0 / 负数 / 非法值一律回退默认，避免"配了 0 就把上传上限关掉"。
func TestConfigMaxBytesOnlyAcceptsPositive(t *testing.T) {
	for _, c := range []struct {
		set  string
		want int64
	}{
		{"", 100 * 1024 * 1024},
		{"0", 100 * 1024 * 1024},
		{"-5", 100 * 1024 * 1024},
		{"abc", 100 * 1024 * 1024},
		{"1024", 1024},
	} {
		t.Setenv("ASSET_MAX_BYTES", c.set)
		if got := ConfigFromEnv().MaxBytes; got != c.want {
			t.Fatalf("ASSET_MAX_BYTES=%q 期望 %d，得到 %d", c.set, c.want, got)
		}
	}
}
