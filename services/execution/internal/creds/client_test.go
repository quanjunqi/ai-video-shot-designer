package creds

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
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

// 渠道探测需要的两个非明文读取：用户渠道定义（base URL 来源）与凭据存在性。
// 两者都必须带内部令牌、都不得触碰 reveal。
func TestListUserChannelsAndCredentialStatus(t *testing.T) {
	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		if got := r.Header.Get("Authorization"); got != "Bearer internal-token" {
			t.Errorf("internal auth header = %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.HasSuffix(r.URL.Path, "/channels"):
			_, _ = w.Write([]byte(`{"items":[{"id":"chan-x","kind":"aggregator","protocol":"api","baseUrl":"https://api.example.com/","authType":"bearer","enabled":true}]}`))
		case strings.HasSuffix(r.URL.Path, "/credentials"):
			_, _ = w.Write([]byte(`{"items":[{"channelId":"chan-x","baseUrl":"https://api.example.com/","authType":"bearer","hasKey":true,"enabled":true}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	c := NewClient(server.URL, "internal-token")
	channels, err := c.ListUserChannels(context.Background(), "ws_dev")
	if err != nil {
		t.Fatalf("ListUserChannels: %v", err)
	}
	if len(channels) != 1 || channels[0].ID != "chan-x" || channels[0].BaseURL != "https://api.example.com/" || channels[0].AuthType != "bearer" {
		t.Fatalf("user channels 解析异常: %+v", channels)
	}
	statuses, err := c.ListCredentialStatus(context.Background(), "ws_dev")
	if err != nil {
		t.Fatalf("ListCredentialStatus: %v", err)
	}
	if len(statuses) != 1 || statuses[0].ChannelID != "chan-x" || !statuses[0].HasKey || statuses[0].AuthType != "bearer" {
		t.Fatalf("credential status 解析异常: %+v", statuses)
	}
	want := []string{
		"/internal/v1/workspaces/ws_dev/channels",
		"/internal/v1/workspaces/ws_dev/credentials",
	}
	if strings.Join(paths, ",") != strings.Join(want, ",") {
		t.Fatalf("请求路径 = %v, want %v", paths, want)
	}
	for _, p := range paths {
		if strings.HasSuffix(p, "/reveal") {
			t.Fatalf("探测路径不得触发 reveal: %v", paths)
		}
	}
}
