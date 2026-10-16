package main

import (
	"testing"
	"time"
)

// execution 的 cmd/server 此前覆盖率 0.0% —— 而 **D2/D2b/D4c/D6 的核心逻辑都在这里**
// （worker 终态写回审计、重试终态、用量回填、保留期清理的启动开关）。
// 其中大部分需要数据库，但下面两类不该依赖数据库，且都承载着真实不变量。
// 注：worker 侧测试（audit 终态/词汇/哨兵）随业务迁至 internal/worker/audit_test.go。

// ── 不变量一：保留期配置【只认正数】 ────────────────────────────────
// D6 的「默认关闭」fail-safe 正建立在这条上：
// 环境变量留空 / 填 0 / 填负数 / 填非法值 ⇒ 一律回退默认值（0）⇒ **清理不会启动**。
// 若有人把这里改成"负数也接受"，保留期清理就可能在意料之外被打开 —— 那是删数据的事。

func TestEnvIntOnlyAcceptsPositive(t *testing.T) {
	cases := []struct {
		name string
		set  string
		def  int
		want int
	}{
		{"未设置 ⇒ 默认", "", 0, 0},
		{"空串 ⇒ 默认", "", 10, 10},
		{"非数字 ⇒ 默认", "abc", 0, 0},
		{"0 ⇒ 默认（0 表示不启用，不能被当成「已配置」）", "0", 7, 7},
		{"负数 ⇒ 默认（同上）", "-5", 7, 7},
		{"小数 ⇒ 默认（Atoi 不接受）", "1.5", 7, 7},
		{"带空白 ⇒ 默认", " 7 ", 0, 0},
		{"正数 ⇒ 采用", "180", 0, 180},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Setenv("EXEC_TEST_INT", c.set)
			if got := envInt("EXEC_TEST_INT", c.def); got != c.want {
				t.Fatalf("期望 %d，得到 %d", c.want, got)
			}
		})
	}
}

func TestEnvDurationOnlyAcceptsPositiveDurations(t *testing.T) {
	cases := []struct {
		name string
		set  string
		def  time.Duration
		want time.Duration
	}{
		{"未设置 ⇒ 默认", "", 24 * time.Hour, 24 * time.Hour},
		{"非法 ⇒ 默认", "abc", 24 * time.Hour, 24 * time.Hour},
		{"0s ⇒ 默认（d > 0 不成立）", "0s", 24 * time.Hour, 24 * time.Hour},
		{"负数 ⇒ 默认", "-1h", 24 * time.Hour, 24 * time.Hour},
		{"纯数字（无单位）⇒ 默认", "60", 24 * time.Hour, 24 * time.Hour},
		{"30m ⇒ 采用", "30m", 24 * time.Hour, 30 * time.Minute},
		{"复合时长 ⇒ 采用", "1h30m", time.Second, 90 * time.Minute},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Setenv("EXEC_TEST_DUR", c.set)
			if got := envDuration("EXEC_TEST_DUR", c.def); got != c.want {
				t.Fatalf("期望 %v，得到 %v", c.want, got)
			}
		})
	}
}
