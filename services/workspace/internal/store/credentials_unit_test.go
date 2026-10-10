package store

import (
	"strings"
	"testing"
)

// 本文件只测【不依赖数据库】的纯逻辑。
//
// 背景：internal/store 此前覆盖率 0% —— 既有的 credentials_integration_test.go
// 在未配置测试库时会整体跳过，于是连 encryptSecret / decryptSecret / keepOr /
// AuthHeaderValue 这些**纯函数**也从未被执行过。
// 而它们恰恰是**最安全敏感的一段**：密钥派生、加解密、以及"省略字段时保留原值"的语义。
//
// 注意：本文件与集成测试同包，故不重复定义其已有的 helper（testStore/testCredKey/strptr）。

func TestAuthHeaderValueFlattensNil(t *testing.T) {
	if got := AuthHeaderValue(nil); got != "" {
		t.Fatalf("nil 应展平为空串（NULL 与 \"\" 等价），得到 %q", got)
	}
	empty := ""
	if got := AuthHeaderValue(&empty); got != "" {
		t.Fatalf("空串指针应展平为空串，得到 %q", got)
	}
	v := "X-Api-Key"
	if got := AuthHeaderValue(&v); got != "X-Api-Key" {
		t.Fatalf("应原样返回，得到 %q", got)
	}
}

func TestCredentialKeyFailsClosed(t *testing.T) {
	// ★ 这是最关键的一条安全不变量（判据：credentials.go 的注释
	//   "an unset env fails closed so keys are never silently stored under
	//    an empty/known key"）：
	//   未配置 WORKSPACE_CRED_KEY 时，**派生密钥、加密、解密都必须失败**。
	//   否则所有人都会用"空口令派生的固定密钥"加密，等于明文存储。
	t.Setenv("WORKSPACE_CRED_KEY", "")
	if _, err := credentialKey(); err == nil {
		t.Fatal("未配置密钥时 credentialKey 必须报错（fail closed）")
	}
	if _, err := encryptSecret("sk-x"); err == nil {
		t.Fatal("未配置密钥时加密必须失败")
	}
	if _, err := decryptSecret([]byte("0123456789ab")); err == nil {
		t.Fatal("未配置密钥时解密必须失败")
	}

	// 配置后：sha256 输出 ⇒ 32 字节
	t.Setenv("WORKSPACE_CRED_KEY", "unit-test-key")
	k, err := credentialKey()
	if err != nil {
		t.Fatalf("配置后不应报错：%v", err)
	}
	if len(k) != 32 {
		t.Fatalf("密钥应为 sha256 的 32 字节，得到 %d", len(k))
	}
	// 同一环境值必须派生出同一密钥（否则重启后旧密文全部解不开）
	k2, _ := credentialKey()
	if string(k) != string(k2) {
		t.Fatal("同一 WORKSPACE_CRED_KEY 必须派生出同一密钥")
	}
}

func TestEncryptDecryptRoundTrip(t *testing.T) {
	t.Setenv("WORKSPACE_CRED_KEY", "unit-test-key")
	cases := []string{
		"sk-abcdefghijklmnop",
		"",
		"含中文与符号 !@#$%^&*()_+-=[]{}|;':\",./<>?",
		strings.Repeat("x", 4096),
		"\x00\x01\x02 二进制样字节",
	}
	for i, plain := range cases {
		blob, err := encryptSecret(plain)
		if err != nil {
			t.Fatalf("用例 %d 加密失败：%v", i, err)
		}
		got, err := decryptSecret(blob)
		if err != nil {
			t.Fatalf("用例 %d 解密失败：%v", i, err)
		}
		if got != plain {
			t.Fatalf("用例 %d 往返不一致：期望 %q，得到 %q", i, plain, got)
		}
		if len(plain) > 0 && string(blob) == plain {
			t.Fatalf("用例 %d 密文里出现了明文 —— 等于没加密", i)
		}
	}
}

func TestEncryptIsNonDeterministic(t *testing.T) {
	// 随机 nonce ⇒ 同一明文两次加密必须不同。
	// 若相同，密文相等就泄露了"两次是同一个密钥"这一事实（且可被离线比对）。
	t.Setenv("WORKSPACE_CRED_KEY", "unit-test-key")
	a, err := encryptSecret("sk-same")
	if err != nil {
		t.Fatal(err)
	}
	b, err := encryptSecret("sk-same")
	if err != nil {
		t.Fatal(err)
	}
	if string(a) == string(b) {
		t.Fatal("同一明文两次加密结果相同 —— 说明 nonce 不是随机的")
	}
}

func TestDecryptRejectsTamperedTruncatedAndEmpty(t *testing.T) {
	t.Setenv("WORKSPACE_CRED_KEY", "unit-test-key")
	blob, err := encryptSecret("sk-secret")
	if err != nil {
		t.Fatal(err)
	}
	// 截断（短于 nonce 长度）
	if _, err := decryptSecret(blob[:5]); err == nil {
		t.Fatal("截断的密文必须被拒")
	}
	// 空
	if _, err := decryptSecret(nil); err == nil {
		t.Fatal("空密文必须被拒")
	}
	// 篡改最后一个字节 ⇒ GCM 认证应失败
	bad := append([]byte(nil), blob...)
	bad[len(bad)-1] ^= 0x01
	if _, err := decryptSecret(bad); err == nil {
		t.Fatal("被篡改的密文必须被拒（GCM 认证标签）")
	}
	// 篡改 nonce 区
	bad2 := append([]byte(nil), blob...)
	bad2[0] ^= 0x01
	if _, err := decryptSecret(bad2); err == nil {
		t.Fatal("nonce 被篡改必须被拒")
	}
}

func TestDecryptFailsUnderDifferentKey(t *testing.T) {
	// 密文必须与派生密钥绑定：换环境变量后旧密文必须解不开，
	// 否则"轮换密钥"这个操作就没有任何意义。
	t.Setenv("WORKSPACE_CRED_KEY", "key-A")
	blob, err := encryptSecret("sk-secret")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decryptSecret(blob); err != nil {
		t.Fatalf("同密钥应能解密：%v", err)
	}
	t.Setenv("WORKSPACE_CRED_KEY", "key-B")
	if _, err := decryptSecret(blob); err == nil {
		t.Fatal("换密钥后必须解密失败（密文未与密钥绑定）")
	}
}

func TestKeepOrSemantics(t *testing.T) {
	// keepOr 决定 PUT 省略 auth_header/auth_prefix 时的语义：
	// 传入 nil ⇒ 保留已存值（不是清空）。这正是"省略字段不该静默丢配置"的实现。
	incoming, existing := "X-In", "X-Old"
	empty := ""
	cases := []struct {
		name               string
		incoming, existing *string
		want               *string
	}{
		{"两者都 nil ⇒ nil", nil, nil, nil},
		{"传入 nil，已有值 ⇒ 保留已有", nil, &existing, &existing},
		{"传入值，已有值 ⇒ 用传入", &incoming, &existing, &incoming},
		{"传入【空串指针】，已有值 ⇒ 用传入（空串是显式选择，不是省略）", &empty, &existing, &empty},
		{"传入值，已有 nil ⇒ 用传入", &incoming, nil, &incoming},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := keepOr(c.incoming, c.existing)
			if c.want == nil {
				if got != nil {
					t.Fatalf("期望 nil，得到 %q", *got)
				}
				return
			}
			if got == nil || *got != *c.want {
				t.Fatalf("期望 %q，得到 %v", *c.want, got)
			}
		})
	}
}
