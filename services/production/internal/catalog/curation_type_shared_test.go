package catalog

import "testing"

// TestCurateTypeSharedValidation 验证策展与逻辑模型的 type 校验同源：
// 合法三值通过、非法值被同一函数拒绝（单一来源，防两处枚举漂移）。
func TestCurateTypeSharedValidation(t *testing.T) {
	for _, tt := range []struct {
		typ   string
		valid bool
	}{
		{"text", true},
		{"image", true},
		{"video", true},
		{"embedding", false},
		{"model", false},
		{"", false},
		{"IMAGE", false},
	} {
		if got := ValidLogicalModelType(tt.typ); got != tt.valid {
			t.Errorf("ValidLogicalModelType(%q) = %v, want %v", tt.typ, got, tt.valid)
		}
	}
}
