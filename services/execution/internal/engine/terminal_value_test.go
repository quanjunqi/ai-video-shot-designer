package engine

import "testing"

// TestMatchesTerminalValue 表驱动锁定终态匹配的语义：
// 逗号分隔候选值、大小写不敏感、忽略空白与空项；spec 为空则永不命中。
func TestMatchesTerminalValue(t *testing.T) {
	cases := []struct {
		name   string
		status string
		spec   string
		want   bool
	}{
		// —— 单值：与改动前的精确比较等价 ——
		{"单值精确命中", "SUCCESS", "SUCCESS", true},
		{"单值精确未命中", "SUCCESS", "FAILED", false},
		{"单值小写命中大写声明", "success", "SUCCESS", true},
		{"单值大写命中小写声明", "COMPLETED", "completed", true},
		{"单值混合大小写命中", "Completed", "completed", true},
		{"单值大小写不敏感但不相等", "FAILED", "failed_x", false},

		// —— 状态值两侧空白：TrimSpace 后比较 ——
		{"状态值带空白", "  SUCCESS  ", "SUCCESS", true},
		{"声明与状态都带空白", " Success ", "  Success  ", true},

		// —— 多值（逗号分隔候选）：机制保留，供字面量不确定时列出多种拼写 ——
		{"多值命中第一项", "Failed", "Failed,Fail", true},
		{"多值命中第二项", "Fail", "Failed,Fail", true},
		{"多值命中第一项小写", "failed", "Failed,Fail", true},
		{"多值命中第二项小写", "fail", "Failed,Fail", true},
		{"多值命中第二项全大写", "FAIL", "Failed,Fail", true},
		{"多值两项都不匹配", "FAILURE", "Failed,Fail", false},
		{"多值项间空白", "fail", " Failed , Fail ", true},
		{"多值末尾多余逗号", "fail", "Failed,Fail,", true},
		{"多值前导多余逗号", "Failed", ",Failed,Fail", true},
		{"多值连续逗号", "SUCCESS", "SUCCESS,,FAILED", true},
		{"多值命中项带空白", " SUCCESS ", "FAILED , SUCCESS ", true},
		{"多值中枚举并集命中", "succeeded", "completed,succeeded", true},

		// —— spec 为空的边界 ——
		{"空 spec", "SUCCESS", "", false},
		{"空状态空 spec", "", "", false},
		{"空状态非空 spec", "", "SUCCESS", false},
		{"只有逗号", "SUCCESS", ",", false},
		{"只有逗号与空白", "SUCCESS", " , , ", false},
		{"空白 spec", "SUCCESS", "   ", false},

		// —— 单值声明的向后兼容（迁移 008 的历史值行为不变） ——
		{"历史单值 done 保持兼容", "SUCCESS", "SUCCESS", true},
		{"历史单值 fail 保持兼容", "FAILED", "FAILED", true},
		{"历史单值 Success 保持兼容", "Success", "Success", true},
		{"历史单值 Failed 接受大小写变体", "FAILED", "Failed", true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := matchesTerminalValue(tc.status, tc.spec); got != tc.want {
				t.Fatalf("matchesTerminalValue(%q, %q) = %v, want %v", tc.status, tc.spec, got, tc.want)
			}
		})
	}
}

// TestMatchesTerminalValueMiniMaxStatusEnum 是真实缺陷的回归锁。
//
// MiniMax 官方文档的顶层 status 枚举是 queued | in_progress | completed | failed
// （迁移 030 与注册表按此取值 doneValue=completed、failValue=failed）：
//   - completed / failed 及其大小写变体必须命中对应终态；
//   - queued / in_progress 是有意的「继续轮询」态，**既不匹配 done 也不匹配 fail**；
//   - 迁移 008 写的旧值（Success / Fail）与枚举不同名，正是「成功与失败都检测不到、
//     空转到超时」的原因 —— 这里显式记录旧值不命中，以防有人改回去。
func TestMatchesTerminalValueMiniMaxStatusEnum(t *testing.T) {
	const done = "completed"
	const fail = "failed"

	for _, status := range []string{"completed", "Completed", "COMPLETED", " completed "} {
		if !matchesTerminalValue(status, done) {
			t.Errorf("matchesTerminalValue(%q, %q) = false, want true（完成态漏判会导致空转到超时）", status, done)
		}
	}
	for _, status := range []string{"failed", "Failed", "FAILED", " failed "} {
		if !matchesTerminalValue(status, fail) {
			t.Errorf("matchesTerminalValue(%q, %q) = false, want true（失败态漏判会空转到超时并使重试失效）", status, fail)
		}
	}

	// 非终态：两个终态都不匹配 ⇒ 轮询继续。
	for _, status := range []string{"queued", "Queued", "QUEUED", "in_progress", "In_Progress", "IN_PROGRESS", "", "processing"} {
		if matchesTerminalValue(status, done) {
			t.Errorf("matchesTerminalValue(%q, %q) = true, want false（非终态不得判为完成）", status, done)
		}
		if matchesTerminalValue(status, fail) {
			t.Errorf("matchesTerminalValue(%q, %q) = true, want false（非终态不得判为失败）", status, fail)
		}
	}

	// 旧枚举值不命中新枚举（无依据的猜测值 Fail 也不命中）。
	if matchesTerminalValue("Success", done) {
		t.Error("迁移 008 的旧 doneValue Success 不应命中 completed（这就是原缺陷）")
	}
	if matchesTerminalValue("Fail", fail) {
		t.Error("猜测值 Fail 不应命中官方枚举 failed")
	}
}
