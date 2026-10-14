package httpserver

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"time"
)

// Env 读取环境变量，未设置或为空时回退 fallback。
// 装配配置读取收敛在本包（cmd 只调用），测试同包锁定行为。
func Env(k, fallback string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return fallback
}

// withTimeout 给所有 API 响应加全局禁缓存头，并向下游传递可取消的 context。
func withTimeout(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 全局禁用缓存：所有API响应都不允许浏览器/代理缓存，确保轮询任务始终拿到最新数据
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		// 与 httpClient(300s) 对齐：tasks 同步测试会真实等待上游文本/图片生成（可达 120s+）
		ctx, cancel := context.WithTimeout(r.Context(), 300*time.Second)
		defer cancel()
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// copyHeaders 透传上游的关键响应头（Content-Type/Location/Content-Disposition）。
func copyHeaders(dst, src http.Header) {
	if v := src.Get("Content-Type"); v != "" {
		dst.Set("Content-Type", v)
	}
	if v := src.Get("Location"); v != "" {
		dst.Set("Location", v)
	}
	// 导出类响应需要它：否则浏览器拿不到文件名（D8b 实测：缺此条时 CSV 仍能下载，
	// 但文件名退化为 URL 末段）。
	if v := src.Get("Content-Disposition"); v != "" {
		dst.Set("Content-Disposition", v)
	}
}

// writeError 输出统一 JSON 错误体 {code, message}。
func writeError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"code": code, "message": message})
}

// writeJSON 输出 JSON 响应。
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// newKey 生成幂等键（bff_ 前缀 + 16 字节 hex）。
func newKey() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return "bff_" + hex.EncodeToString(b[:])
}
