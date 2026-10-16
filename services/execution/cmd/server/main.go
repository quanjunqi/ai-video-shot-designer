package main

import (
	"context"
	"log/slog"
	"os"
	"time"

	"shotdesigner/services/execution/internal/worker"
)

// main 只做装配（BE-LAYER-002）：读 env → 构造 → 启动。
//
// 收敛位置（TASK-PROC-006）：
//   - 任务执行、审计终态、重试/死信、保留期清理 → internal/worker
//   - 依赖构造与**装配校验** → internal/New（本文件因此 ≤50 行）
//
// 行为不变：环境变量名、默认值、启动顺序、日志文案、os.Exit 语义逐条照搬；
// 失败日志仍由 New 按原文案打出，本文件只负责退出。
func main() {
	cfg := ConfigFromEnv()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	a, err := New(ctx, cfg, os.Getenv)
	if err != nil {
		os.Exit(1)
	}
	defer a.Close()

	a.Start()
	if err := a.ListenAndServe(); err != nil {
		worker.Logger.Error("execution server stopped", slog.Any("err", err))
		os.Exit(1)
	}
}
