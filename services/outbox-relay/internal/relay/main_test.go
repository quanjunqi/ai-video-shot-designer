package relay

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDeliverSendsTrustedContextAndToken(t *testing.T) {
	var got event
	var auth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer r.Body.Close()
		got.Workspace = r.Header.Get("X-Workspace-Id")
		got.Actor = r.Header.Get("X-Actor-Id")
		auth = r.Header.Get("Authorization")
		w.WriteHeader(http.StatusCreated)
	}))
	defer server.Close()
	r := &relay{client: server.Client(), executionURL: server.URL, token: "secret"}
	err := r.deliver(context.Background(), event{Workspace: "ws-1", Actor: "actor-1", EventType: "generation.intent.created", Payload: []byte(`{"intent_id":"i1"}`)})
	if err != nil || got.Workspace != "ws-1" || got.Actor != "actor-1" || auth != "Bearer secret" {
		t.Fatalf("deliver: err=%v event=%+v auth=%q", err, got, auth)
	}
}

func TestDeliverRejectsUnsupportedOrNon2xx(t *testing.T) {
	r := &relay{client: http.DefaultClient, executionURL: "http://127.0.0.1:1", token: "secret"}
	if err := r.deliver(context.Background(), event{EventType: "unknown"}); err == nil || !strings.Contains(err.Error(), "unsupported event") {
		t.Fatalf("unsupported event error: %v", err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { http.Error(w, "no", http.StatusConflict) }))
	defer server.Close()
	r.executionURL = server.URL
	if err := r.deliver(context.Background(), event{EventType: "generation.intent.created"}); err == nil || !strings.Contains(err.Error(), "HTTP 409") {
		t.Fatalf("non-2xx error: %v", err)
	}
}
