package creds

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// Reveal 必须把 workspace 侧的数据驱动字段（authHeader/authPrefix）带进
// engine.Credentials；workspace 的 reveal 端点把 NULL 摊平成 ""。
func TestRevealParsesAuthHeaderAndPrefix(t *testing.T) {
	cases := []struct {
		name         string
		body         string
		wantHeader   string
		wantPrefix   string
		wantAuthType string
	}{
		{
			name:       "data-driven bare token",
			body:       `{"channelId":"autodl","baseUrl":"https://api.autodl.com","authType":"token","authHeader":"Authorization","authPrefix":"","apiKey":"sk-bare"}`,
			wantHeader: "Authorization", wantPrefix: "", wantAuthType: "token",
		},
		{
			name:       "data-driven custom header with prefix",
			body:       `{"channelId":"ch","baseUrl":"https://x","authType":"bearer","authHeader":"X-Api-Key","authPrefix":"Token ","apiKey":"sk-1"}`,
			wantHeader: "X-Api-Key", wantPrefix: "Token ", wantAuthType: "bearer",
		},
		{
			name:       "legacy row without knobs keeps auth_type fallback",
			body:       `{"channelId":"ch","baseUrl":"https://x","authType":"bearer","authHeader":"","authPrefix":"","apiKey":"sk-2"}`,
			wantHeader: "", wantPrefix: "", wantAuthType: "bearer",
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if got := r.Header.Get("Authorization"); got != "Bearer internal-token" {
					t.Errorf("internal auth header = %q", got)
				}
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(c.body))
			}))
			defer server.Close()

			client := NewClient(server.URL, "internal-token")
			got, err := client.Reveal(context.Background(), "ws_dev", "ch")
			if err != nil {
				t.Fatalf("reveal: %v", err)
			}
			if got.AuthHeader != c.wantHeader || got.AuthPrefix != c.wantPrefix || got.AuthType != c.wantAuthType {
				t.Fatalf("credentials = header=%q prefix=%q authType=%q, want %q/%q/%q",
					got.AuthHeader, got.AuthPrefix, got.AuthType, c.wantHeader, c.wantPrefix, c.wantAuthType)
			}
			if got.APIKey == "" || got.BaseURL == "" {
				t.Fatalf("base fields missing: %+v", got)
			}
		})
	}
}
