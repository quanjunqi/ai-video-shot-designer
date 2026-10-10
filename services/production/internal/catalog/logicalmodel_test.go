package catalog

import (
	"errors"
	"strings"
	"testing"
)

func TestValidLogicalModelID(t *testing.T) {
	valid := []string{
		"image-t2i-high",
		"video-i2v-standard",
		"a",
		"a1",
		"text-chat-cheap",
		"model-2-v3",
		strings.Repeat("a", 64),
	}
	for _, id := range valid {
		if !ValidLogicalModelID(id) {
			t.Errorf("expected %q to be a valid logical model id", id)
		}
	}
	invalid := []string{
		"",
		"-leading",
		"trailing-",
		"double--hyphen",
		"Upper-Case",
		"has_underscore",
		"has space",
		"中文标识",
		"gpt-image-1/2",
		strings.Repeat("a", 65),
	}
	for _, id := range invalid {
		if ValidLogicalModelID(id) {
			t.Errorf("expected %q to be rejected as a logical model id", id)
		}
	}
}

func TestLogicalModelCreateValidate(t *testing.T) {
	sort := 10
	valid := LogicalModelCreate{ID: "image-t2i-high", Label: "文生图 · 高质量", Type: "image", Status: "disabled", Sort: &sort}
	if err := valid.Validate(); err != nil {
		t.Fatalf("valid create rejected: %v", err)
	}
	cases := []struct {
		name  string
		input LogicalModelCreate
		want  error
	}{
		{"empty label", LogicalModelCreate{ID: "image-t2i-high"}, ErrInvalidLabel},
		{"blank label", LogicalModelCreate{ID: "image-t2i-high", Label: "   "}, ErrInvalidLabel},
		{"audio type", LogicalModelCreate{ID: "image-t2i-high", Label: "x", Type: "audio"}, ErrInvalidLogicalType},
		{"empty type", LogicalModelCreate{ID: "image-t2i-high", Label: "x"}, ErrInvalidLogicalType},
		{"unknown status", LogicalModelCreate{ID: "image-t2i-high", Label: "x", Type: "image", Status: "paused"}, ErrInvalidStatus},
		{"uppercase id", LogicalModelCreate{ID: "Image-T2I", Label: "x", Type: "image"}, ErrInvalidLogicalModelID},
	}
	for _, tc := range cases {
		input := tc.input
		if err := input.Validate(); !errors.Is(err, tc.want) {
			t.Errorf("%s: got %v want %v", tc.name, err, tc.want)
		}
	}
	negative := -1
	negativeSort := LogicalModelCreate{ID: "image-t2i-high", Label: "x", Type: "image", Sort: &negative}
	if err := negativeSort.Validate(); err == nil {
		t.Fatal("negative sort should be rejected")
	}
}

func TestLogicalModelPatchValidate(t *testing.T) {
	status := "disabled"
	sort := 0
	label := "新展示名"
	modelType := "video"
	valid := LogicalModelPatch{Label: &label, Type: &modelType, Status: &status, Sort: &sort}
	if err := valid.Validate(); err != nil {
		t.Fatalf("valid patch rejected: %v", err)
	}
	// id 不可修改：请求体带 id 即拒绝
	empty, bad, badStatus := "  ", "audio", "paused"
	zero, negative := 0, -5
	cases := []struct {
		name  string
		patch LogicalModelPatch
		want  error
	}{
		{"id is immutable", LogicalModelPatch{ID: "image-t2i-high"}, ErrLogicalModelIDImmutable},
		{"blank label", LogicalModelPatch{Label: &empty}, ErrInvalidLabel},
		{"audio type", LogicalModelPatch{Type: &bad}, ErrInvalidLogicalType},
		{"unknown status", LogicalModelPatch{Status: &badStatus}, ErrInvalidStatus},
		{"sort=0 is legal", LogicalModelPatch{Sort: &zero}, nil},
	}
	for _, tc := range cases {
		patch := tc.patch
		if err := patch.Validate(); !errors.Is(err, tc.want) {
			t.Errorf("%s: got %v want %v", tc.name, err, tc.want)
		}
	}
	negativeSort := LogicalModelPatch{Sort: &negative}
	if err := negativeSort.Validate(); err == nil {
		t.Fatal("negative sort patch should be rejected")
	}
}

func TestBindCandidatesInputValidate(t *testing.T) {
	priority := 20
	valid := BindCandidatesInput{ModelIDs: []string{"mod_1"}, RoutePriority: &priority}
	if err := valid.Validate(); err != nil {
		t.Fatalf("valid bind input rejected: %v", err)
	}
	negative := -1
	cases := []struct {
		name  string
		input BindCandidatesInput
		want  error
	}{
		{"empty modelIds", BindCandidatesInput{}, ErrInvalidCandidateInput},
		{"blank model id", BindCandidatesInput{ModelIDs: []string{"mod_1", "  "}}, ErrInvalidCandidateInput},
		{"over-long model id", BindCandidatesInput{ModelIDs: []string{strings.Repeat("m", 129)}}, ErrInvalidCandidateInput},
		{"negative priority", BindCandidatesInput{ModelIDs: []string{"mod_1"}, RoutePriority: &negative}, ErrInvalidRoutePriority},
	}
	for _, tc := range cases {
		input := tc.input
		if err := input.Validate(); !errors.Is(err, tc.want) {
			t.Errorf("%s: got %v want %v", tc.name, err, tc.want)
		}
	}
	// 未提供 routePriority 时用默认值 100
	if got := valid.routePriority(); got != 20 {
		t.Fatalf("explicit priority: got %d want 20", got)
	}
	unset := BindCandidatesInput{ModelIDs: []string{"mod_1"}}
	if got := unset.routePriority(); got != DefaultRoutePriority {
		t.Fatalf("default priority: got %d want %d", got, DefaultRoutePriority)
	}
}

func TestUniqueModelIDs(t *testing.T) {
	got := uniqueModelIDs([]string{"b", "a", "b", "c", "a"})
	want := []string{"b", "a", "c"}
	if len(got) != len(want) {
		t.Fatalf("uniqueModelIDs = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("uniqueModelIDs = %v, want %v (order must be preserved)", got, want)
		}
	}
}

func TestErrModelNotFoundNamesEveryModel(t *testing.T) {
	err := ErrModelNotFound{ModelIDs: []string{"mod_a", "mod_b"}}
	message := err.Error()
	for _, modelID := range []string{"mod_a", "mod_b"} {
		if !strings.Contains(message, modelID) {
			t.Fatalf("error %q must name %s", message, modelID)
		}
	}
}

// 409 的映射依赖：多冲突可用 errors.As 取回单条冲突，且消息包含双方 id。
func TestErrModelsBoundElsewhereIsUnwrappable(t *testing.T) {
	err := ErrModelsBoundElsewhere([]ErrModelBoundElsewhere{
		{ModelID: "mod_a", LogicalModelID: "image-t2i-high"},
		{ModelID: "mod_b", LogicalModelID: "image-t2i-low"},
	})
	var single ErrModelBoundElsewhere
	if !errors.As(err, &single) {
		t.Fatalf("errors.As should find a single conflict in %v", err)
	}
	if single.ModelID != "mod_a" {
		t.Fatalf("first conflict should be mod_a, got %s", single.ModelID)
	}
	if !strings.Contains(single.Error(), "image-t2i-high") {
		t.Fatalf("conflict message must name the owning logical model: %q", single.Error())
	}
}
