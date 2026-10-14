package relay

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"strconv"
)

// Env 读取环境变量，未设置或为空时回退 fallback。
// 装配配置读取收敛在本包（cmd 只调用），测试同包锁定行为。
func Env(k, fallback string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return fallback
}

// EnvInt 读取正整数环境变量；未设置/非数字/≤0 时回退 fallback。
func EnvInt(k string, fallback int) int {
	if v, err := strconv.Atoi(os.Getenv(k)); err == nil && v > 0 {
		return v
	}
	return fallback
}

// backoffSeconds 计算重试退避：平方退避，夹在 [2, 300] 秒之间。
//
// 为什么抽成【纯函数】：这段夹取逻辑原先内联在 fail() 里，而 fail() 需要数据库
// ⇒ 300 秒上限与 2 秒下限**从未被任何测试验证过**（该服务覆盖率仅 14.6%）。
// 抽出来之后边界可被直接锁定，fail() 的行为不变。
func backoffSeconds(attempts int) int {
	backoff := attempts * attempts
	if backoff < 2 {
		backoff = 2
	}
	if backoff > 300 {
		backoff = 300
	}
	return backoff
}

// id 生成 worker 唯一标识（New 在未提供 WorkerID 时使用）。
func id() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return "relay_" + hex.EncodeToString(b[:])
}
