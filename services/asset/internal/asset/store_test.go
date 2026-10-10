package asset

import (
	"encoding/hex"
	"testing"
)

// 本包此前【没有任何测试】。这里只测不依赖 DB / MinIO 的纯逻辑。
// 其余方法（CreateUpload/Put/Commit/List）全部直接使用 *pgxpool.Pool 与 *minio.Client，
// 属集成测试范畴，见 httpapi 包测试文件末尾的说明。

func TestRandomIDShape(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 200; i++ {
		id := randomID()
		if len(id) != 24 {
			t.Fatalf("randomID 应为 12 字节的 hex（24 字符），得到 %d 字符：%q", len(id), id)
		}
		if _, err := hex.DecodeString(id); err != nil {
			t.Fatalf("randomID 不是合法 hex：%q（%v）", id, err)
		}
		if seen[id] {
			t.Fatalf("randomID 出现重复：%q（200 次内不应碰撞）", id)
		}
		seen[id] = true
	}
}

func TestSentinelErrorsAreDistinct(t *testing.T) {
	// 这些哨兵错误被 httpapi 用 errors.Is 映射成不同的 HTTP 状态码
	// （404/409/413/400/422）；一旦有人把它们改成同一个值，
	// 上游状态码就会串味 —— 所以把"互不相同"钉成不变量。
	errs := []error{ErrNotFound, ErrConflict, ErrHashMismatch, ErrTooLarge, ErrSizeMismatch}
	for i := range errs {
		for j := range errs {
			if i != j && errs[i] == errs[j] {
				t.Fatalf("哨兵错误 %d 与 %d 相同：%v", i, j, errs[i])
			}
		}
		if errs[i].Error() == "" {
			t.Fatalf("哨兵错误 %d 的消息为空", i)
		}
	}
}
