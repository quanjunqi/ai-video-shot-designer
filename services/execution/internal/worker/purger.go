package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"shotdesigner/services/execution/internal/audit"
)

// RunAuditPurger 按保留期定期清理审计（D6）。由 cmd 以 goroutine 启动。
//
// 为什么删除本身要写审计（审计的审计）：
//
//	审计系统必须能回答"谁在什么时候删掉了什么"。否则一旦有人打开开关，
//	历史就会【无声消失】——那正是审计最不该发生的事。
//	记录挂在 audit.SystemWorkspace 哨兵值下，不会污染任何租户的列表与聚合。
//
// 为什么清理失败不影响主流程：清理是后台维护动作，失败只记录并等下一轮；
// 绝不能因为它让服务不可用。
func RunAuditPurger(as *audit.Store, successDays, failureDays int, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		n, err := as.Purge(ctx, successDays, failureDays)
		if err != nil {
			Logger.Warn("审计清理失败（等下一轮）", slog.Any("err", err))
			cancel()
			continue
		}
		if n > 0 {
			rec := audit.Log{
				RequestID: fmt.Sprintf("req_purge_%d", time.Now().UnixNano()),
				// 清理是后台维护动作，**刻意**挂在哨兵值下（见本函数上方的设计说明）：
				// 它不是任何租户的行为，挂到某个工作区会污染那个租户的列表与聚合。
				WorkspaceID: audit.SystemWorkspace,
				UserID:      "system",
				Product:     "system",
				Mode:        "audit_purge",
				Status:      "success",
				ResponsePayload: json.RawMessage(fmt.Sprintf(
					`{"deleted":%d,"successDays":%d,"failureDays":%d}`, n, successDays, failureDays)),
			}
			if err := as.Insert(ctx, rec); err != nil {
				Logger.Warn("清理记录写入审计失败", slog.Any("err", err))
			}
		}
		Logger.Info("审计清理完成", "deleted", n, "success_days", successDays, "failure_days", failureDays)
		cancel()
	}
}
