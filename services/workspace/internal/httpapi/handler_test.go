package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"shotdesigner/services/workspace/internal/store"
)

type fakeStore struct {
	workspace     store.WorkspaceInfo
	workspaceErr  error
	members       []store.Member
	memberErr     error
	authorized    store.Member
	authorizeErr  error
	lastWorkspace string
	lastActor     string

	lastCredential   store.Credential
	putErr           error
	revealErr        error
	revealAuthHeader *string
	revealAuthPrefix *string

	statusItems []store.CredentialStatus
	statusErr   error

	channels    []store.UserChannel
	channelsErr error
	deleteChErr error
	lastChannel string

	budgetRules    []store.BudgetRule
	budgetRulesErr error
	upsertedRule   store.BudgetRule
	deletedPeriod  string
}

func (s *fakeStore) ListBudgetRules(_ context.Context, workspaceID string) ([]store.BudgetRule, error) {
	s.lastWorkspace = workspaceID
	return s.budgetRules, s.budgetRulesErr
}

func (s *fakeStore) EffectiveBudgetRules(_ context.Context, workspaceID string) ([]store.BudgetRule, error) {
	s.lastWorkspace = workspaceID
	return s.budgetRules, s.budgetRulesErr
}

func (s *fakeStore) UpsertBudgetRule(_ context.Context, workspaceID string, r store.BudgetRule) (store.BudgetRule, error) {
	s.lastWorkspace = workspaceID
	// 与真实 store 一致：workspace 级规则落具体工作区，tenant 级落空串
	if r.Scope == "workspace" {
		r.WorkspaceID = workspaceID
	}
	s.upsertedRule = r
	return r, nil
}

func (s *fakeStore) DeleteBudgetRule(_ context.Context, workspaceID, period string) error {
	s.lastWorkspace, s.deletedPeriod = workspaceID, period
	return s.budgetRulesErr
}

func (s *fakeStore) ListUserChannels(_ context.Context, workspaceID string) ([]store.UserChannel, error) {
	s.lastWorkspace = workspaceID
	return s.channels, s.channelsErr
}

func (s *fakeStore) UpsertUserChannel(_ context.Context, workspaceID string, c store.UserChannel) (store.UserChannel, error) {
	s.lastWorkspace = workspaceID
	return c, nil
}

func (s *fakeStore) DeleteUserChannel(_ context.Context, workspaceID, channelID string) error {
	s.lastWorkspace, s.lastChannel = workspaceID, channelID
	return s.deleteChErr
}

func (s *fakeStore) Workspace(_ context.Context, workspaceID string) (store.WorkspaceInfo, error) {
	s.lastWorkspace = workspaceID
	return s.workspace, s.workspaceErr
}

func (s *fakeStore) Members(_ context.Context, workspaceID string) ([]store.Member, error) {
	s.lastWorkspace = workspaceID
	return s.members, s.memberErr
}

func (s *fakeStore) Authorize(_ context.Context, workspaceID, actorID string) (store.Member, error) {
	s.lastWorkspace, s.lastActor = workspaceID, actorID
	return s.authorized, s.authorizeErr
}

func (s *fakeStore) PutCredential(_ context.Context, in store.Credential) error {
	s.lastCredential = in
	return s.putErr
}
func (s *fakeStore) Status(_ context.Context, _ string) ([]store.CredentialStatus, error) {
	return s.statusItems, s.statusErr
}
func (s *fakeStore) DeleteCredential(_ context.Context, _, _ string) error { return nil }
func (s *fakeStore) RevealKey(_ context.Context, _, _ string) (store.RevealedCredential, error) {
	if s.revealErr != nil {
		return store.RevealedCredential{}, s.revealErr
	}
	return store.RevealedCredential{
		BaseURL: "https://x", AuthType: "bearer",
		AuthHeader: s.revealAuthHeader, AuthPrefix: s.revealAuthPrefix,
		APIKey: "sk-plain",
	}, nil
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

// PUT 凭据必须把 authHeader/authPrefix 透传给 store（ADR-007 D2 的数据驱动字段）。
func TestPutCredentialPassesAuthHeaderAndPrefix(t *testing.T) {
	fake := &fakeStore{}
	h := Handler{Store: fake, Token: "test-token"}.Routes()

	body := `{"channelId":"autodl","baseUrl":"https://api.autodl.com","authType":"token","authHeader":"Authorization","authPrefix":"","apiKey":"sk-1"}`
	r := httptest.NewRequest(http.MethodPut, "/internal/v1/workspaces/ws_dev/credentials/autodl", strings.NewReader(body))
	r.Header.Set("Authorization", "Bearer test-token")
	response := httptest.NewRecorder()
	h.ServeHTTP(response, r)
	if response.Code != http.StatusOK {
		t.Fatalf("put credential: expected 200, got %d body=%s", response.Code, response.Body.String())
	}
	got := fake.lastCredential
	if got.WorkspaceID != "ws_dev" || got.ChannelID != "autodl" || got.AuthType != "token" || got.APIKey != "sk-1" {
		t.Fatalf("credential not passed through: %+v", got)
	}
	if got.AuthHeader == nil || *got.AuthHeader != "Authorization" {
		t.Fatalf("authHeader not passed through: %v", got.AuthHeader)
	}
	// 空字符串是有效配置（裸 token），必须与「未提供（nil）」区分开
	if got.AuthPrefix == nil || *got.AuthPrefix != "" {
		t.Fatalf("empty authPrefix must survive as an explicit empty string, got %v", got.AuthPrefix)
	}
}

// PUT 未提供 authHeader/authPrefix 时必须保持 nil，store 侧才能沿用既有值。
func TestPutCredentialKeepsAuthKnobsNilWhenAbsent(t *testing.T) {
	fake := &fakeStore{}
	h := Handler{Store: fake, Token: "test-token"}.Routes()

	body := `{"channelId":"ch","baseUrl":"https://x","authType":"bearer","apiKey":"sk-1"}`
	r := httptest.NewRequest(http.MethodPut, "/internal/v1/workspaces/ws_dev/credentials/ch", strings.NewReader(body))
	r.Header.Set("Authorization", "Bearer test-token")
	response := httptest.NewRecorder()
	h.ServeHTTP(response, r)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", response.Code)
	}
	if fake.lastCredential.AuthHeader != nil || fake.lastCredential.AuthPrefix != nil {
		t.Fatalf("absent fields must stay nil, got header=%v prefix=%v", fake.lastCredential.AuthHeader, fake.lastCredential.AuthPrefix)
	}
}

// reveal 必须一路透出 authHeader/authPrefix（execution 靠它走数据驱动分支）。
func TestRevealExposesAuthHeaderAndPrefix(t *testing.T) {
	header, prefix := "X-Api-Key", "Token "
	fake := &fakeStore{revealAuthHeader: &header, revealAuthPrefix: &prefix}
	h := Handler{Store: fake, Token: "test-token"}.Routes()

	response := httptest.NewRecorder()
	h.ServeHTTP(response, workspaceRequest(http.MethodGet, "/internal/v1/workspaces/ws_dev/credentials/ch/reveal"))
	if response.Code != http.StatusOK {
		t.Fatalf("reveal: expected 200, got %d body=%s", response.Code, response.Body.String())
	}
	var got map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &got); err != nil {
		t.Fatalf("reveal response is not JSON: %v", err)
	}
	if got["authHeader"] != "X-Api-Key" || got["authPrefix"] != "Token " {
		t.Fatalf("reveal must expose the data-driven knobs, got %v", got)
	}
	if got["apiKey"] != "sk-plain" {
		t.Fatalf("reveal must keep returning the decrypted key, got %v", got["apiKey"])
	}
}

// 未配置（NULL）的两列在 reveal 响应里必须是空串，而不是 null（兼容既有客户端）。
func TestRevealFlattensNullAuthKnobsToEmptyString(t *testing.T) {
	h := Handler{Store: &fakeStore{}, Token: "test-token"}.Routes()

	response := httptest.NewRecorder()
	h.ServeHTTP(response, workspaceRequest(http.MethodGet, "/internal/v1/workspaces/ws_dev/credentials/ch/reveal"))
	if response.Code != http.StatusOK {
		t.Fatalf("reveal: expected 200, got %d", response.Code)
	}
	var got map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &got); err != nil {
		t.Fatalf("reveal response is not JSON: %v", err)
	}
	if got["authHeader"] != "" || got["authPrefix"] != "" {
		t.Fatalf("NULL knobs must flatten to empty strings, got %v", got)
	}
}

func TestCredentialStatusReturnsItemsAndMapsFailure(t *testing.T) {
	fake := &fakeStore{statusItems: []store.CredentialStatus{{ChannelID: "autodl", HasKey: true, Enabled: true}}}
	h := Handler{Store: fake, Token: "test-token"}.Routes()

	response := httptest.NewRecorder()
	h.ServeHTTP(response, workspaceRequest(http.MethodGet, "/internal/v1/workspaces/ws_dev/credentials"))
	if response.Code != http.StatusOK {
		t.Fatalf("status: expected 200, got %d body=%s", response.Code, response.Body.String())
	}
	var got map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &got); err != nil {
		t.Fatalf("status response is not JSON: %v", err)
	}
	if got["items"] == nil {
		t.Fatalf("status must return items, got %v", got)
	}

	fake.statusErr = errors.New("database offline")
	response = httptest.NewRecorder()
	h.ServeHTTP(response, workspaceRequest(http.MethodGet, "/internal/v1/workspaces/ws_dev/credentials"))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status store failure: expected 503, got %d", response.Code)
	}
}

func TestDeleteCredential(t *testing.T) {
	h := Handler{Store: &fakeStore{}, Token: "test-token"}.Routes()

	response := httptest.NewRecorder()
	h.ServeHTTP(response, workspaceRequest(http.MethodDelete, "/internal/v1/workspaces/ws_dev/credentials/autodl"))
	if response.Code != http.StatusNoContent {
		t.Fatalf("delete credential: expected 204, got %d body=%s", response.Code, response.Body.String())
	}
}

func TestListUserChannelsReturnsItemsAndMapsFailure(t *testing.T) {
	fake := &fakeStore{channels: []store.UserChannel{{ID: "ch1", Name: "渠道一"}}}
	h := Handler{Store: fake, Token: "test-token"}.Routes()

	response := httptest.NewRecorder()
	h.ServeHTTP(response, workspaceRequest(http.MethodGet, "/internal/v1/workspaces/ws_dev/channels"))
	if response.Code != http.StatusOK || fake.lastWorkspace != "ws_dev" {
		t.Fatalf("list channels: code=%d workspace=%q body=%s", response.Code, fake.lastWorkspace, response.Body.String())
	}
	var got map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &got); err != nil {
		t.Fatalf("channels response is not JSON: %v", err)
	}
	if got["items"] == nil {
		t.Fatalf("channels must return items, got %v", got)
	}

	fake.channelsErr = errors.New("database offline")
	response = httptest.NewRecorder()
	h.ServeHTTP(response, workspaceRequest(http.MethodGet, "/internal/v1/workspaces/ws_dev/channels"))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("channels store failure: expected 503, got %d", response.Code)
	}
}

func TestPutUserChannel(t *testing.T) {
	fake := &fakeStore{}
	h := Handler{Store: fake, Token: "test-token"}.Routes()

	body := `{"name":"渠道一","kind":"official","protocol":"api","baseUrl":"https://x","authType":"bearer"}`
	r := httptest.NewRequest(http.MethodPut, "/internal/v1/workspaces/ws_dev/channels/ch1", strings.NewReader(body))
	r.Header.Set("Authorization", "Bearer test-token")
	response := httptest.NewRecorder()
	h.ServeHTTP(response, r)
	if response.Code != http.StatusOK {
		t.Fatalf("put user channel: expected 200, got %d body=%s", response.Code, response.Body.String())
	}
	if fake.lastWorkspace != "ws_dev" {
		t.Fatalf("put user channel must pass workspace, got %q", fake.lastWorkspace)
	}
}

func TestDeleteUserChannel(t *testing.T) {
	fake := &fakeStore{}
	h := Handler{Store: fake, Token: "test-token"}.Routes()

	response := httptest.NewRecorder()
	h.ServeHTTP(response, workspaceRequest(http.MethodDelete, "/internal/v1/workspaces/ws_dev/channels/ch1"))
	if response.Code != http.StatusNoContent || fake.lastChannel != "ch1" {
		t.Fatalf("delete user channel: code=%d channel=%q body=%s", response.Code, fake.lastChannel, response.Body.String())
	}

	fake.deleteChErr = errors.New("database offline")
	response = httptest.NewRecorder()
	h.ServeHTTP(response, workspaceRequest(http.MethodDelete, "/internal/v1/workspaces/ws_dev/channels/ch1"))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("delete user channel failure: expected 503, got %d", response.Code)
	}
}

func TestListBudgetRulesReturnsItemsAndMapsFailure(t *testing.T) {
	fake := &fakeStore{budgetRules: []store.BudgetRule{{Scope: "workspace", Period: "day", LimitAmount: 500, Action: "block"}}}
	h := Handler{Store: fake, Token: "test-token"}.Routes()

	response := httptest.NewRecorder()
	h.ServeHTTP(response, workspaceRequest(http.MethodGet, "/internal/v1/workspaces/ws_dev/budget/rules"))
	if response.Code != http.StatusOK {
		t.Fatalf("list budget rules: expected 200, got %d body=%s", response.Code, response.Body.String())
	}
	if fake.lastWorkspace != "ws_dev" {
		t.Fatalf("list budget rules must pass workspace, got %q", fake.lastWorkspace)
	}
	if !strings.Contains(response.Body.String(), `"limitAmount":500`) {
		t.Fatalf("budget rules body missing limitAmount: %s", response.Body.String())
	}

	fake.budgetRulesErr = errors.New("database offline")
	response = httptest.NewRecorder()
	h.ServeHTTP(response, workspaceRequest(http.MethodGet, "/internal/v1/workspaces/ws_dev/budget/rules"))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("list budget rules failure: expected 503, got %d", response.Code)
	}
}

func TestPutBudgetRuleValidatesAndUpserts(t *testing.T) {
	fake := &fakeStore{}
	h := Handler{Store: fake, Token: "test-token"}.Routes()

	// 合法写入
	body := `{"scope":"workspace","period":"day","limitAmount":500,"action":"block","warnAt":0.8}`
	r := httptest.NewRequest(http.MethodPut, "/internal/v1/workspaces/ws_dev/budget/rules", strings.NewReader(body))
	r.Header.Set("Authorization", "Bearer test-token")
	response := httptest.NewRecorder()
	h.ServeHTTP(response, r)
	if response.Code != http.StatusOK {
		t.Fatalf("put budget rule: expected 200, got %d body=%s", response.Code, response.Body.String())
	}
	if fake.upsertedRule.WorkspaceID != "ws_dev" || fake.upsertedRule.Scope != "workspace" || fake.upsertedRule.Period != "day" {
		t.Fatalf("upserted rule mismatch: %+v", fake.upsertedRule)
	}

	// 非法 limitAmount
	badBody := `{"scope":"workspace","period":"day","limitAmount":0,"action":"block"}`
	r = httptest.NewRequest(http.MethodPut, "/internal/v1/workspaces/ws_dev/budget/rules", strings.NewReader(badBody))
	r.Header.Set("Authorization", "Bearer test-token")
	response = httptest.NewRecorder()
	h.ServeHTTP(response, r)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("put budget rule invalid limit: expected 400, got %d", response.Code)
	}

	// 非法 action
	badAction := `{"scope":"workspace","period":"day","limitAmount":10,"action":"explode"}`
	r = httptest.NewRequest(http.MethodPut, "/internal/v1/workspaces/ws_dev/budget/rules", strings.NewReader(badAction))
	r.Header.Set("Authorization", "Bearer test-token")
	response = httptest.NewRecorder()
	h.ServeHTTP(response, r)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("put budget rule invalid action: expected 400, got %d", response.Code)
	}
}

func TestDeleteBudgetRule(t *testing.T) {
	fake := &fakeStore{}
	h := Handler{Store: fake, Token: "test-token"}.Routes()

	response := httptest.NewRecorder()
	h.ServeHTTP(response, workspaceRequest(http.MethodDelete, "/internal/v1/workspaces/ws_dev/budget/rules/day"))
	if response.Code != http.StatusNoContent || fake.deletedPeriod != "day" {
		t.Fatalf("delete budget rule: code=%d period=%q", response.Code, fake.deletedPeriod)
	}

	// 非法周期
	response = httptest.NewRecorder()
	h.ServeHTTP(response, workspaceRequest(http.MethodDelete, "/internal/v1/workspaces/ws_dev/budget/rules/week"))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("delete budget rule invalid period: expected 400, got %d", response.Code)
	}
}

func TestWorkspaceInfoReturnsProfile(t *testing.T) {
	fake := &fakeStore{workspace: store.WorkspaceInfo{ID: "ws_dev", Name: "开发工作区", CreatedAt: time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)}}
	h := Handler{Store: fake, Token: "test-token"}.Routes()

	response := httptest.NewRecorder()
	h.ServeHTTP(response, workspaceRequest(http.MethodGet, "/internal/v1/workspaces/ws_dev"))
	if response.Code != http.StatusOK {
		t.Fatalf("workspace info: expected 200, got %d", response.Code)
	}
	var got store.WorkspaceInfo
	if err := json.NewDecoder(response.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.ID != "ws_dev" || got.Name != "开发工作区" || got.CreatedAt.IsZero() {
		t.Fatalf("workspace info body mismatch: %+v", got)
	}
	if fake.lastWorkspace != "ws_dev" {
		t.Fatalf("store called with workspace %q, want ws_dev", fake.lastWorkspace)
	}
}

func TestWorkspaceInfoMapsNotFoundAndUnavailable(t *testing.T) {
	fake := &fakeStore{workspaceErr: store.ErrNotFound}
	h := Handler{Store: fake, Token: "test-token"}.Routes()
	response := httptest.NewRecorder()
	h.ServeHTTP(response, workspaceRequest(http.MethodGet, "/internal/v1/workspaces/ws_dev"))
	if response.Code != http.StatusNotFound {
		t.Fatalf("not found: expected 404, got %d", response.Code)
	}

	fake.workspaceErr = errors.New("db down")
	response = httptest.NewRecorder()
	h.ServeHTTP(response, workspaceRequest(http.MethodGet, "/internal/v1/workspaces/ws_dev"))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("unavailable: expected 503, got %d", response.Code)
	}
}
