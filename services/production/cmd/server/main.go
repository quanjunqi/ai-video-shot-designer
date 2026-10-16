package main

import (
	"context"
	"log/slog"
	"os"
	"time"

	"shotdesigner/services/production/internal/app"
	"shotdesigner/shared/observability"
)

// main 只做装配（BE-LAYER-002）：读 env → 构造 → 启动。
//
// 收敛位置（TASK-PROC-006）：依赖构造与**装配校验** → internal/app.New
// （本文件因此 ≤50 行）；业务全在 internal/<pkg>。
//
// 行为不变：环境变量名、默认值、启动顺序、日志文案、os.Exit 语义逐条照搬；
// 失败日志仍由 app.New 按原文案打出，本文件只负责退出。
func main() {
	logger := observability.NewJSONLogger("production")
	cfg := app.ConfigFromEnv()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	a, err := app.New(ctx, logger, cfg)
	if err != nil {
		os.Exit(1)
	}
	defer a.Close()

	if err := a.ListenAndServe(); err != nil {
		logger.Error("production server stopped", slog.Any("err", err))
		os.Exit(1)
	}
}
