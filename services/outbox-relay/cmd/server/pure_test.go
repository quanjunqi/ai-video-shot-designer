package main

import (
	"encoding/hex"
	"strings"
	"testing"
)

// outbox-relay 此前覆盖率 14.6%（下限 14，余量仅 0.6）。
// 未覆盖的部分大多需要数据库（main/runOnce/claim/ack），
// 但其中夹着【纯逻辑】，本文件把它们锁住。
// 注意：同包已有 main_test.go，本文件不与之重名。

func TestIDShapeAndUniqueness(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 200; i++ {
		got := id()
		if !strings.HasPrefix(got, "relay_") {
			t.Fatalf("id 应以 relay_ 开头，得到 %q", got)
		}
		body := strings.TrimPrefix(got, "relay_")
		if len(body) != 16 {
			t.Fatalf("8 字节 hex 应为 16 字符，得到 %d：%q", len(body), got)
		}
		if _, err := hex.DecodeString(body); err != nil {
			t.Fatalf("id 主体不是合法 hex：%q（%v）", got, err)
		}
		if seen[got] {
			t.Fatalf("id 出现重复：%q（200 次内不应碰撞）", got)
		}
		seen[got] = true
	}
}

func TestEnvFallsBackOnUnsetAndEmpty(t *testing.T) {
	cases := []struct {
		name string
		set  *string
		want string
	}{
		{"未设置 ⇒ 回退", nil, "fallback"},
		{"设置为空串 ⇒ 回退（与未设置等价）", strptr(""), "fallback"},
		{"设置有值 ⇒ 用该值", strptr("value"), "value"},
		{"设置含空白 ⇒ 原样返回（不 TrimSpace）", strptr("  x  "), "  x  "},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Setenv("RELAY_TEST_KEY", "")
			if c.set != nil {
				t.Setenv("RELAY_TEST_KEY", *c.set)
			}
			if got := env("RELAY_TEST_KEY", "fallback"); got != c.want {
				t.Fatalf("期望 %q，得到 %q", c.want, got)
			}
		})
	}
}

func TestEnvIntOnlyAcceptsPositiveNumbers(t *testing.T) {
	cases := []struct {
		name string
		set  string
		want int
	}{
		{"未设置 ⇒ 回退", "", 7},
		{"非数字 ⇒ 回退", "abc", 7},
		{"零 ⇒ 回退（必须为正）", "0", 7},
		{"负数 ⇒ 回退（必须为正）", "-5", 7},
		{"小数 ⇒ 回退（Atoi 不收）", "1.5", 7},
		{"正数 ⇒ 采用", "42", 42},
		{"带空白 ⇒ 回退（Atoi 不收）", " 42 ", 7},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Setenv("RELAY_TEST_INT", c.set)
			if got := envInt("RELAY_TEST_INT", 7); got != c.want {
				t.Fatalf("期望 %d，得到 %d", c.want, got)
			}
		})
	}
}

// ★ 本片的核心：退避夹取此前只在需要数据库的 fail() 内部，边界从未被验证。
func TestBackoffSecondsClamping(t *testing.T) {
	cases := []struct {
		attempts, want int
		why            string
	}{
		{0, 2, "0² = 0 ⇒ 抬到下限 2（首次失败也要有退避）"},
		{1, 2, "1² = 1 ⇒ 抬到下限 2"},
		{2, 4, "平方退避正常段"},
		{5, 25, ""},
		{17, 289, "17² = 289，仍在上限内"},
		{18, 300, "18² = 324 ⇒ 夹到上限 300"},
		{100, 300, "远超上限 ⇒ 300（防止退避爆炸到不可用）"},
		{-1, 2, "负数平方为 1 ⇒ 仍抬到下限 2"},
		{-20, 300, "负数平方 400 ⇒ 夹到上限（不会因为符号而变小）"},
	}
	for _, c := range cases {
		if got := backoffSeconds(c.attempts); got != c.want {
			t.Fatalf("backoffSeconds(%d) = %d，期望 %d %s", c.attempts, got, c.want, c.why)
		}
	}
}

func strptr(s string) *string { return &s }
