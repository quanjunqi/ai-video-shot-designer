package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"shotdesigner/services/workspace/internal/store"
)

type fakeStore struct {
	members       []store.Member
	memberErr     error
	authorized    store.Member
	authorizeErr  error
	lastWorkspace string
	lastActor     string
}

func (s *fakeStore) ListUserChannels(_ context.Context, workspaceID string) ([]store.UserChannel, error) {
	s.lastWorkspace = workspaceID
	return nil, nil
}

func (s *fakeStore) UpsertUserChannel(_ context.Context, workspaceID string, c store.UserChannel) (store.UserChannel, error) {
	s.lastWorkspace = workspaceID
	return c, nil
}

func (s *fakeStore) DeleteUserChannel(_ context.Context, workspaceID, _ string) error {
	s.lastWorkspace = workspaceID
	return nil
}

func (s *fakeStore) Members(_ context.Context, workspaceID string) ([]store.Member, error) {
	s.lastWorkspace = workspaceID
	return s.members, s.memberErr
}

func (s *fakeStore) Authorize(_ context.Context, workspaceID, actorID string) (store.Member, error) {
	s.lastWorkspace, s.lastActor = workspaceID, actorID
	return s.authorized, s.authorizeErr
}

func (s *fakeStore) PutCredential(_ context.Context, _, _, _, _, _, _ string) error { return nil }
func (s *fakeStore) Status(_ context.Context, _ string) ([]store.CredentialStatus, error) {
	return nil, nil
}
func (s *fakeStore) DeleteCredential(_ context.Context, _, _ string) error { return nil }
func (s *fakeStore) RevealKey(_ context.Context, _, _ string) (string, string, string, error) {
	return "https://x", "bearer", "sk-plain", nil
}

func workspaceRequest(method, path string) *http.Request {
	r := httptest.NewRequest(method, path, nil)
	r.Header.Set("Authorization", "Bearer test-token")
	return r
}

func TestRoutesRequireInternalAuthentication(t *testing.T) {
	h := Handler{Store: &fakeStore{}, Token: "test-token"}.Routes()
	for _, authorization := range []string{"", "Bearer wrong-token", "Basic test-token"} {
		r := httptest.NewRequest(http.MethodGet, "/internal/v1/workspaces/ws_dev/members", nil)
		r.Header.Set("Authorization", authorization)
		response := httptest.NewRecorder()
		h.ServeHTTP(response, r)
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("authorization %q: expected 401, got %d", authorization, response.Code)
		}
	}
}

func TestAuthorizeValidatesActorAndReturnsMember(t *testing.T) {
	fake := &fakeStore{authorized: store.Member{WorkspaceID: "ws_dev", ActorID: "user_dev", Role: "owner"}}
	h := Handler{Store: fake, Token: "test-token"}.Routes()

	response := httptest.NewRecorder()
	h.ServeHTTP(response, workspaceRequest(http.MethodGet, "/internal/v1/workspaces/ws_dev/authorize"))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("missing actor_id: expected 400, got %d", response.Code)
	}

	response = httptest.NewRecorder()
	h.ServeHTTP(response, workspaceRequest(http.MethodGet, "/internal/v1/workspaces/ws_dev/authorize?actor_id=user_dev"))
	if response.Code != http.StatusOK || fake.lastWorkspace != "ws_dev" || fake.lastActor != "user_dev" {
		t.Fatalf("authorize: code=%d workspace=%q actor=%q body=%s", response.Code, fake.lastWorkspace, fake.lastActor, response.Body.String())
	}
}

func TestAuthorizeMapsMembershipAndStoreFailures(t *testing.T) {
	for _, tc := range []struct {
		name   string
		err    error
		status int
	}{
		{name: "not member", err: store.ErrNotMember, status: http.StatusForbidden},
		{name: "database unavailable", err: errors.New("database offline"), status: http.StatusServiceUnavailable},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := Handler{Store: &fakeStore{authorizeErr: tc.err}, Token: "test-token"}.Routes()
			response := httptest.NewRecorder()
			h.ServeHTTP(response, workspaceRequest(http.MethodGet, "/internal/v1/workspaces/ws_dev/authorize?actor_id=user_dev"))
			if response.Code != tc.status {
				t.Fatalf("expected %d, got %d: %s", tc.status, response.Code, response.Body.String())
			}
		})
	}
}

func TestMembersReturnsItemsAndMapsStoreFailure(t *testing.T) {
	fake := &fakeStore{members: []store.Member{{WorkspaceID: "ws_dev", ActorID: "user_dev", Role: "owner"}}}
	h := Handler{Store: fake, Token: "test-token"}.Routes()
	response := httptest.NewRecorder()
	h.ServeHTTP(response, workspaceRequest(http.MethodGet, "/internal/v1/workspaces/ws_dev/members"))
	if response.Code != http.StatusOK || fake.lastWorkspace != "ws_dev" {
		t.Fatalf("members: code=%d workspace=%q body=%s", response.Code, fake.lastWorkspace, response.Body.String())
	}

	fake.memberErr = errors.New("database offline")
	response = httptest.NewRecorder()
	h.ServeHTTP(response, workspaceRequest(http.MethodGet, "/internal/v1/workspaces/ws_dev/members"))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("store failure: expected 503, got %d", response.Code)
	}
}

func TestReadyReflectsDatabaseHealth(t *testing.T) {
	h := Handler{Store: &fakeStore{}, Token: "test-token", Ready: func(context.Context) error { return errors.New("offline") }}.Routes()
	response := httptest.NewRecorder()
	h.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/ready", nil))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("not ready: expected 503, got %d", response.Code)
	}

	h = Handler{Store: &fakeStore{}, Token: "test-token", Ready: func(context.Context) error { return nil }}.Routes()
	response = httptest.NewRecorder()
	h.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/ready", nil))
	if response.Code != http.StatusNoContent {
		t.Fatalf("ready: expected 204, got %d", response.Code)
	}
}
