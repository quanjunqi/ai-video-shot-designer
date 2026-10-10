package provider

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestResolverRoutesByChannel(t *testing.T) {
	r := NewResolver(DefaultAdapterSet()...)

	cases := []struct {
		snapshot CapabilitySnapshot
		want     string
	}{
		{CapabilitySnapshot{ChannelID: "jimeng", Type: "video", Family: "Seedance 2.5", ModelName: "Seedance 2.5"}, "jimeng"},
		{CapabilitySnapshot{ChannelID: "minimax", Type: "video", Family: "MiniMax H3", ModelName: "MiniMax H3"}, "minimax"},
		{CapabilitySnapshot{ChannelID: "grsai", Type: "image", Family: "Seedream 5.0", ModelName: "Seedream 5.0"}, "grsai"},
		{CapabilitySnapshot{ChannelID: "google", Type: "text", Family: "Gemini 3.1", ModelName: "gemini-3.1-flash-lite"}, "google"},
		{CapabilitySnapshot{ChannelID: "openai", Type: "image", Family: "gpt-image", ModelName: "gpt-image-2"}, "openai"},
		{CapabilitySnapshot{ChannelID: "comfy", Type: "image", Family: "SDXL", ModelName: "SDXL"}, "comfy"},
	}
	for _, c := range cases {
		p, err := r.Resolve(c.snapshot)
		if err != nil {
			t.Fatalf("resolve %+v: %v", c.snapshot, err)
		}
		if got := p.ChannelID(); got != c.want {
			t.Fatalf("resolve %q: got channel %q want %q", c.snapshot.ModelName, got, c.want)
		}
	}
}

func TestResolverRejectsUnknownChannelAndType(t *testing.T) {
	r := NewResolver(DefaultAdapterSet()...)
	if _, err := r.Resolve(CapabilitySnapshot{ChannelID: "hunyuan", Type: "video"}); !errors.Is(err, ErrUnsupportedChannel) {
		t.Fatalf("expected ErrUnsupportedChannel, got %v", err)
	}
	if _, err := r.Resolve(CapabilitySnapshot{ChannelID: "jimeng", Type: "audio"}); !errors.Is(err, ErrUnsupportedModelType) {
		t.Fatalf("expected ErrUnsupportedModelType, got %v", err)
	}
	// channel exists but does not support the type
	if _, err := r.Resolve(CapabilitySnapshot{ChannelID: "comfy", Type: "video"}); !errors.Is(err, ErrUnsupportedModelType) {
		t.Fatalf("expected ErrUnsupportedModelType for comfy/video, got %v", err)
	}
}

func TestGenerateWithoutCredentialsFailsLoudly(t *testing.T) {
	r := NewResolver(DefaultAdapterSet()...)
	p, err := r.Resolve(CapabilitySnapshot{ChannelID: "jimeng", Type: "video", Family: "Seedance 2.5", ModelName: "Seedance 2.5"})
	if err != nil {
		t.Fatal(err)
	}
	_, err = p.Generate(context.Background(), CapabilitySnapshot{}, Credentials{})
	if !errors.Is(err, ErrCredentialsNotConfigured) {
		t.Fatalf("expected ErrCredentialsNotConfigured, got %v", err)
	}
	if !strings.Contains(err.Error(), "jimeng") {
		t.Fatalf("error should name the channel, got %v", err)
	}
}

func TestIsKnownChannel(t *testing.T) {
	for _, id := range KnownChannelIDs {
		if !IsKnownChannel(id) {
			t.Fatalf("expected %q to be known", id)
		}
	}
	if IsKnownChannel("hunyuan") {
		t.Fatal("hunyuan should not be known")
	}
}
