package provider

import (
	"context"
	"errors"
	"fmt"
)

// genericAdapter is the skeleton implementation shared by all six channels.
// It declares channel identity and supported model types; without tenant
// credentials it fails loudly with ErrCredentialsNotConfigured instead of
// faking a dispatch. Real HTTP clients per channel land behind Generate/Poll.
type genericAdapter struct {
	channelID string
	types     map[string]bool
}

func (a genericAdapter) ChannelID() string { return a.channelID }

func (a genericAdapter) Supports(modelType string) bool { return a.types[modelType] }

func (a genericAdapter) Generate(_ context.Context, _ CapabilitySnapshot, creds Credentials) (string, error) {
	if creds.BaseURL == "" || creds.APIKey == "" {
		return "", fmt.Errorf("%w: channel=%q (workspace credential store empty; 真实鉴权待渠道 key 注入)", ErrCredentialsNotConfigured, a.channelID)
	}
	return "", errors.New("provider: real dispatch not implemented yet")
}

func (a genericAdapter) Poll(_ context.Context, remoteRef string) (Result, error) {
	if remoteRef == "" {
		return Result{}, errors.New("provider: empty remote ref")
	}
	return Result{}, errors.New("provider: real polling not implemented yet")
}

func newAdapter(channelID string, modelTypes ...string) genericAdapter {
	m := make(map[string]bool, len(modelTypes))
	for _, t := range modelTypes {
		m[t] = true
	}
	return genericAdapter{channelID: channelID, types: m}
}

// DefaultAdapterSet returns the six built-in channel adapters (skeleton).
func DefaultAdapterSet() []Provider {
	return []Provider{
		newAdapter("jimeng", "image", "video"),        // 即梦：Seedream 图片 / Seedance 视频
		newAdapter("minimax", "text", "video"),        // MiniMax：H3 视频 / Text-01 文本
		newAdapter("grsai", "text", "image", "video"), // Grsai 聚合：特价版各类型
		newAdapter("google", "text", "image"),         // Google Gemini：文本 / nano-banana 图片
		newAdapter("openai", "text", "image"),         // OpenAI：gpt-image-2 图片 / GPT 文本
		newAdapter("comfy", "image"),                  // ComfyUI 本地/云端：SDXL / Flux 图片
	}
}
