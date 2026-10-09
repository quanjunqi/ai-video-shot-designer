package project

import (
	"strings"
	"testing"
)

func validInput() CreateInput {
	return CreateInput{
		Title: " 测试剧本 ", StyleID: "style-1", StyleVersion: "v1", AspectRatio: "16:9",
		DefaultImageModel: "image-1", DefaultVideoModel: "video-1",
		SourceText: strings.Repeat("一", 100),
	}
}

func TestValidateAndHash(t *testing.T) {
	input := validInput()
	if err := input.Validate(); err != nil {
		t.Fatal(err)
	}
	copy := input
	copy.Title = "测试剧本"
	if input.RequestHash() != copy.RequestHash() {
		t.Fatal("title whitespace should not change idempotency identity")
	}
	copy = input
	copy.SourceText += " "
	if input.RequestHash() == copy.RequestHash() {
		t.Fatal("source whitespace must remain part of immutable source identity")
	}
	if SHA256([]byte("abc")) != "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" {
		t.Fatal("invalid SHA-256")
	}
}

func TestValidateRejectsInvalidInput(t *testing.T) {
	cases := []struct {
		name string
		edit func(*CreateInput)
	}{
		{"short script", func(i *CreateInput) { i.SourceText = strings.Repeat("字", 99) }},
		{"invalid utf8", func(i *CreateInput) { i.SourceText = strings.Repeat("字", 100) + "\xff" }},
		{"nul in script", func(i *CreateInput) { i.SourceText += "\x00" }},
		{"nul in style", func(i *CreateInput) { i.StyleID = "style\x00id" }},
		{"long title", func(i *CreateInput) { i.Title = strings.Repeat("字", 51) }},
		{"unknown ratio", func(i *CreateInput) { i.AspectRatio = "4:3" }},
		{"missing model", func(i *CreateInput) { i.DefaultVideoModel = "" }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			input := validInput()
			tc.edit(&input)
			if err := input.Validate(); err != ErrInvalid {
				t.Fatalf("expected invalid input, got %v", err)
			}
		})
	}
}
