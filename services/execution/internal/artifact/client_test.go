package artifact

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

// ---- ExtractURL ----

func TestExtractURL(t *testing.T) {
	cases := []struct {
		name string
		ext  map[string]any
		want string
	}{
		{"image_url", map[string]any{"image_url": "https://cdn.example.com/a.png"}, "https://cdn.example.com/a.png"},
		{"video_url", map[string]any{"video_url": "https://cdn.example.com/v.mp4"}, "https://cdn.example.com/v.mp4"},
		{"url", map[string]any{"url": "http://cdn.example.com/x"}, "http://cdn.example.com/x"},
		{"result", map[string]any{"result": "https://cdn.example.com/r"}, "https://cdn.example.com/r"},
		{"image_url 优先于 result", map[string]any{"image_url": "https://a.example.com/i", "result": "https://b.example.com/r"}, "https://a.example.com/i"},
		{"非字符串跳过", map[string]any{"image_url": 42, "url": "https://cdn.example.com/u"}, "https://cdn.example.com/u"},
		{"空串跳过", map[string]any{"image_url": "", "url": "https://cdn.example.com/u"}, "https://cdn.example.com/u"},
		{"ftp 拒绝", map[string]any{"url": "ftp://cdn.example.com/x"}, ""},
		{"无约定键", map[string]any{"output": "https://cdn.example.com/o"}, ""},
		{"空 map", map[string]any{}, ""},
		{"nil", nil, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := ExtractURL(c.ext); got != c.want {
				t.Fatalf("ExtractURL() = %q, want %q", got, c.want)
			}
		})
	}
}

// ---- Persist 成功路径（httptest mock asset）----

func TestPersistSuccess(t *testing.T) {
	var (
		gotUploads int32
		gotPuts    int32
		gotCommits int32
		lastBody   []byte
	)
	src := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write([]byte("PNGDATA-0123456789"))
	}))
	defer src.Close()

	asset := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/uploads"):
			if r.Header.Get("Authorization") != "Bearer t0ken" {
				t.Errorf("missing bearer token")
			}
			if r.Header.Get("X-Workspace-Id") != "ws_1" || r.Header.Get("X-Actor-Id") != "usr_1" {
				t.Errorf("missing workspace/actor headers")
			}
			atomic.AddInt32(&gotUploads, 1)
			w.WriteHeader(201)
			_, _ = io.WriteString(w, `{"id":"upl_1","object_key":"ws_1/p_1/upl_1","status":"uploading"}`)
		case r.Method == http.MethodPut && strings.Contains(r.URL.Path, "/content"):
			atomic.AddInt32(&gotPuts, 1)
			if r.Header.Get("Content-Type") != "image/png" {
				t.Errorf("content-type not propagated, got %q", r.Header.Get("Content-Type"))
			}
			lastBody, _ = io.ReadAll(r.Body)
			w.WriteHeader(204)
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/commit"):
			atomic.AddInt32(&gotCommits, 1)
			w.WriteHeader(201)
			_, _ = io.WriteString(w, `{"id":"ast_1","object_key":"ws_1/p_1/upl_1","byte_size":20,"status":"committed"}`)
		default:
			t.Errorf("unexpected call: %s %s", r.Method, r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	defer asset.Close()

	c := &Client{
		AssetBaseURL: asset.URL,
		Token:        "t0ken",
		AssetHTTP:    asset.Client(),
		Downloader:   src.Client(),
		MaxBytes:     1 << 20,
	}
	res, err := c.Persist(context.Background(), PersistOptions{
		WorkspaceID: "ws_1", ActorID: "usr_1", ProjectID: "p_1",
		Kind: "image", Name: "shot-001.png", URL: src.URL + "/img.png",
	})
	if err != nil {
		t.Fatalf("Persist() error: %v", err)
	}
	if res.AssetID != "ast_1" || res.ObjectKey != "ws_1/p_1/upl_1" {
		t.Fatalf("unexpected result: %+v", res)
	}
	if !strings.HasSuffix(res.AssetURL, "/internal/v1/assets/ast_1/content") {
		t.Fatalf("unexpected asset url: %s", res.AssetURL)
	}
	if got := atomic.LoadInt32(&gotUploads); got != 1 {
		t.Fatalf("uploads = %d, want 1", got)
	}
	if got := atomic.LoadInt32(&gotPuts); got != 1 {
		t.Fatalf("puts = %d, want 1", got)
	}
	if got := atomic.LoadInt32(&gotCommits); got != 1 {
		t.Fatalf("commits = %d, want 1", got)
	}
	if string(lastBody) != "PNGDATA-0123456789" {
		t.Fatalf("uploaded body = %q", lastBody)
	}
}

// ---- 失败路径 ----

func TestPersistDownloadError(t *testing.T) {
	src := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(500)
		_, _ = io.WriteString(w, "boom")
	}))
	defer src.Close()
	c := &Client{
		AssetBaseURL: "http://asset:18084",
		Token:        "t",
		AssetHTTP:    http.DefaultClient,
		Downloader:   src.Client(),
		MaxBytes:     1 << 20,
	}
	_, err := c.Persist(context.Background(), PersistOptions{WorkspaceID: "w", URL: src.URL})
	if err == nil || !strings.Contains(err.Error(), "500") {
		t.Fatalf("expected download 500 error, got %v", err)
	}
}

func TestPersistTooLarge(t *testing.T) {
	// 20 字节源，上限 10 字节 → 必须拒绝
	src := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, "01234567890123456789")
	}))
	defer src.Close()
	c := &Client{
		AssetBaseURL: "http://asset:18084",
		Token:        "t",
		AssetHTTP:    http.DefaultClient,
		Downloader:   src.Client(),
		MaxBytes:     10,
	}
	_, err := c.Persist(context.Background(), PersistOptions{WorkspaceID: "w", URL: src.URL})
	if err == nil || !strings.Contains(err.Error(), "exceeds") {
		t.Fatalf("expected too-large error, got %v", err)
	}
}

func TestPersistSSRFRejected(t *testing.T) {
	c := &Client{
		AssetBaseURL: "http://asset:18084",
		Token:        "t",
		AssetHTTP:    http.DefaultClient,
		Downloader:   http.DefaultClient,
		// 模拟 netguard.CheckURL 的拒绝
		CheckURL: func(raw string) error {
			if strings.Contains(raw, "169.254.169.254") {
				return errors.New("netguard: rejected metadata address")
			}
			return nil
		},
		MaxBytes: 1 << 20,
	}
	_, err := c.Persist(context.Background(), PersistOptions{
		WorkspaceID: "w",
		URL:         "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
	})
	if err == nil || !strings.Contains(err.Error(), "SSRF") {
		t.Fatalf("expected SSRF rejection, got %v", err)
	}
}

func TestPersistAssetCommitFails(t *testing.T) {
	src := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, "data")
	}))
	defer src.Close()
	asset := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/uploads"):
			w.WriteHeader(201)
			_, _ = io.WriteString(w, `{"id":"upl_1","object_key":"k","status":"uploading"}`)
		case r.Method == http.MethodPut && strings.Contains(r.URL.Path, "/content"):
			w.WriteHeader(204)
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/commit"):
			w.WriteHeader(409)
			_, _ = io.WriteString(w, `{"code":"CONFLICT","message":"already committed"}`)
		}
	}))
	defer asset.Close()
	c := &Client{
		AssetBaseURL: asset.URL,
		Token:        "t",
		AssetHTTP:    asset.Client(),
		Downloader:   src.Client(),
		MaxBytes:     1 << 20,
	}
	_, err := c.Persist(context.Background(), PersistOptions{WorkspaceID: "w", URL: src.URL})
	if err == nil || !strings.Contains(err.Error(), "commit") {
		t.Fatalf("expected commit error, got %v", err)
	}
}

// ---- 未配置 ----

func TestPersistNotConfigured(t *testing.T) {
	c := &Client{}
	_, err := c.Persist(context.Background(), PersistOptions{URL: "http://x.example.com/a"})
	if err == nil {
		t.Fatal("expected not-configured error")
	}
}
