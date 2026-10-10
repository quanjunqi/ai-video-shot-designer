package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"shotdesigner/services/production/internal/catalog"
)

type stubCatalogStore struct {
	dir    catalog.Directory
	models map[string]catalog.Model
}

func (s stubCatalogStore) Directory(context.Context) (catalog.Directory, error) { return s.dir, nil }
func (s stubCatalogStore) GetModel(context.Context, string) (catalog.Model, error) {
	return catalog.Model{}, catalog.ErrNotFound
}
func (s stubCatalogStore) CreateModel(context.Context, string, catalog.Model) (catalog.Model, bool, error) {
	return catalog.Model{}, false, nil
}
func (s stubCatalogStore) UpdateModel(context.Context, string, string, catalog.ModelPatch) (catalog.Model, error) {
	return catalog.Model{}, catalog.ErrNotFound
}
func (s stubCatalogStore) UpdateChannel(context.Context, string, catalog.ChannelPatch) (catalog.Channel, error) {
	return catalog.Channel{}, catalog.ErrNotFound
}
func (s stubCatalogStore) CreateTemplate(context.Context, string, catalog.ProtocolTemplate) (catalog.ProtocolTemplate, bool, error) {
	return catalog.ProtocolTemplate{}, false, nil
}
func (s stubCatalogStore) UpdateTemplate(context.Context, string, string, catalog.ProtocolTemplatePatch) (catalog.ProtocolTemplate, error) {
	return catalog.ProtocolTemplate{}, catalog.ErrNotFound
}
func (s stubCatalogStore) DeleteTemplate(context.Context, string) error {
	return catalog.ErrNotFound
}

func TestGetCatalog(t *testing.T) {
	h := Handler{Token: "secret", CatalogStore: stubCatalogStore{dir: catalog.Directory{
		Channels: []catalog.Channel{{ID: "jimeng", Name: "即梦", Kind: "official", AuthType: "sign", Enabled: true}},
		Models: []catalog.Model{{
			ID: "mod_test0000000000000000", ChannelID: "jimeng", Family: "Seedance 2.5", Name: "Seedance 2.5",
			Type: "video", Status: "enabled", Sort: 1, Capability: json.RawMessage(`{"maxDurationSeconds":30}`), Version: 1,
		}},
	}}}
	req := httptest.NewRequest(http.MethodGet, "/internal/v1/catalog", nil)
	req.Header.Set("Authorization", "Bearer secret")
	req.Header.Set("X-Workspace-Id", "ws_1")
	req.Header.Set("X-Actor-Id", "usr_1")
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var dir catalog.Directory
	if err := json.Unmarshal(rec.Body.Bytes(), &dir); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if len(dir.Channels) != 1 || len(dir.Models) != 1 {
		t.Fatalf("unexpected directory size: channels=%d models=%d", len(dir.Channels), len(dir.Models))
	}
	if dir.Models[0].Version != 1 || dir.Channels[0].ID != "jimeng" {
		t.Fatalf("unexpected contents: %+v %+v", dir.Channels[0], dir.Models[0])
	}
}

func TestGetCatalogUnauthenticated(t *testing.T) {
	h := Handler{Token: "secret", CatalogStore: stubCatalogStore{}}
	req := httptest.NewRequest(http.MethodGet, "/internal/v1/catalog", nil)
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestUpdateModelRejectsUnknownID(t *testing.T) {
	h := Handler{Token: "secret", CatalogStore: stubCatalogStore{}}
	body := `{"sort":9}`
	req := httptest.NewRequest(http.MethodPut, "/internal/v1/catalog/models/not-a-model", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer secret")
	req.Header.Set("X-Workspace-Id", "ws_1")
	req.Header.Set("X-Actor-Id", "usr_1")
	rec := httptest.NewRecorder()
	h.Routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for malformed id, got %d", rec.Code)
	}
}
