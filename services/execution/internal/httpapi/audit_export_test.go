package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"shotdesigner/services/execution/internal/audit"
)

// audit_export.go 此前覆盖率 0.0% —— 其中 auditFilterFrom 是**纯函数**却从未被执行过。
// 它决定导出的筛选口径（与列表共用），是 ④ "查询与聚合 / 导出"的入口。
//
// 本文件不依赖数据库：触及 Store.AuditStore 的路径全部停在守卫之前。
// 注意：同包已有 executionRequest / probeFixture / fakeStore，本文件不重复声明。

func exportURL(query string) string { return "/internal/v1/audit/export" + query }

func exportReq(query string) *http.Request {
	return httptest.NewRequest(http.MethodGet, exportURL(query), nil)
}

func TestAuditFilterFromParsesEveryParam(t *testing.T) {
	since := "2026-10-10T00:00:00Z"
	// ★ 注意：URL 查询串里的 "+" 表示【空格】⇒ 带时区偏移的 RFC3339 必须把 "+" 编码为 %2B。
	//   下面这条用未编码的 "+"，服务端会（正确地）返回 INVALID_UNTIL —— 见拒绝表。
	untilRaw := "2026-10-11T12:30:00+08:00" // 用于解析比较
	until := "2026-10-11T12:30:00%2B08:00"  // 用于 URL（+ 必须编码为 %2B）
	r := exportReq("?status=failed&model_id=mod_1&channel_id=chan_1&since=" + since + "&until=" + until)
	f, code := auditFilterFrom(r)
	if code != "" {
		t.Fatalf("应解析成功，得到错误码 %q", code)
	}
	if f.Status != "failed" || f.ModelID != "mod_1" || f.ChannelID != "chan_1" {
		t.Fatalf("等值筛选未生效：%+v", f)
	}
	if f.Since == nil || !f.Since.Equal(mustTime(t, since)) {
		t.Fatalf("since 解析不一致：%v", f.Since)
	}
	if f.Until == nil || !f.Until.Equal(mustTime(t, untilRaw)) {
		t.Fatalf("until 解析不一致：%v", f.Until)
	}
}

func TestAuditFilterFromEmptyQueryIsZeroFilter(t *testing.T) {
	f, code := auditFilterFrom(exportReq(""))
	if code != "" {
		t.Fatalf("空查询应成功，得到 %q", code)
	}
	if f.Status != "" || f.ModelID != "" || f.ChannelID != "" || f.Since != nil || f.Until != nil {
		t.Fatalf("空查询应产生零值 Filter（表示不筛），得到 %+v", f)
	}
}

func TestAuditFilterFromRejectsBadTimestamps(t *testing.T) {
	cases := []struct{ name, query, wantCode string }{
		{"since 非法", "?since=notatime", "INVALID_SINCE"},
		{"until 非法", "?until=notatime", "INVALID_UNTIL"},
		{"since 仅空白（非空字符串 ⇒ 会尝试解析）", "?since=%20", "INVALID_SINCE"},
		{"since 合法但 until 非法", "?since=2026-10-10T00:00:00Z&until=nope", "INVALID_UNTIL"},
		{"只给日期不给时间（RFC3339 要求完整）", "?since=2026-10-10", "INVALID_SINCE"},
		// ★ 集成陷阱：查询串里的 "+" 会被解码成空格 ⇒ 带 +08:00 偏移的时间必须编码为 %2B08:00。
		//   服务端返回 INVALID_UNTIL 是【正确】行为（宁可 400 也不要静默用错时间）。
		{"时区偏移的 + 未百分号编码（+ 被当作空格）", "?until=2026-10-11T12:30:00+08:00", "INVALID_UNTIL"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, code := auditFilterFrom(exportReq(c.query))
			if code != c.wantCode {
				t.Fatalf("期望错误码 %q，得到 %q", c.wantCode, code)
			}
		})
	}
}

// 守卫链：auth(401) → ctxOf(400) → AuditStore==nil(503) → auditFilterFrom(400) → ExportAll
// 最后一步触及数据库，故本文件的用例**全部停在它之前**。
func TestExportAuditLogsGuards(t *testing.T) {
	const token = "test-secret"
	withCtx := func(r *http.Request) *http.Request {
		r.Header.Set("X-Workspace-Id", "ws_dev")
		r.Header.Set("X-Actor-Id", "user_dev")
		return r
	}
	auth := func(r *http.Request) *http.Request {
		r.Header.Set("Authorization", "Bearer "+token)
		return r
	}

	cases := []struct {
		name     string
		h        Handler
		build    func() *http.Request
		wantCode int
		wantBody string
	}{
		{
			name: "未鉴权 ⇒ 401",
			h:    Handler{Token: token},
			build: func() *http.Request {
				return exportReq("")
			},
			wantCode: http.StatusUnauthorized, wantBody: "UNAUTHENTICATED",
		},
		{
			name: "有鉴权但缺 workspace/actor ⇒ 400",
			h:    Handler{Token: token},
			build: func() *http.Request {
				return auth(exportReq(""))
			},
			wantCode: http.StatusBadRequest, wantBody: "INVALID_CONTEXT",
		},
		{
			name: "审计库未配置 ⇒ 503（不假装能导出）",
			h:    Handler{Token: token},
			build: func() *http.Request {
				return withCtx(auth(exportReq("")))
			},
			wantCode: http.StatusServiceUnavailable, wantBody: "AUDIT_UNAVAILABLE",
		},
		{
			name: "since 非法 ⇒ 400（在触及数据库之前返回）",
			// AuditStore 非 nil 但 Pool 为空：只要守卫顺序正确就不会走到 ExportAll
			h: Handler{Token: token, AuditStore: &audit.Store{}},
			build: func() *http.Request {
				return withCtx(auth(exportReq("?since=notatime")))
			},
			wantCode: http.StatusBadRequest, wantBody: "INVALID_SINCE",
		},
		{
			name: "until 非法 ⇒ 400",
			h:    Handler{Token: token, AuditStore: &audit.Store{}},
			build: func() *http.Request {
				return withCtx(auth(exportReq("?until=notatime")))
			},
			wantCode: http.StatusBadRequest, wantBody: "INVALID_UNTIL",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			c.h.exportAuditLogs(rec, c.build())
			if rec.Code != c.wantCode {
				t.Fatalf("期望 %d，得到 %d（body=%s）", c.wantCode, rec.Code, rec.Body.String())
			}
			if !contains(rec.Body.String(), c.wantBody) {
				t.Fatalf("响应体应含 %q，得到 %s", c.wantBody, rec.Body.String())
			}
		})
	}
}

func mustTime(t *testing.T, s string) time.Time {
	t.Helper()
	ts, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t.Fatalf("测试自身的时间字面量非法：%v", err)
	}
	return ts
}

func contains(haystack, needle string) bool {
	return len(needle) == 0 || (len(haystack) >= len(needle) && indexOf(haystack, needle) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
