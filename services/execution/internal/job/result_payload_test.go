package job

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

// jsonEqual 语义比较两个 JSON：jsonb 会规范化空白与键序，因此不能按字节比较
// （真库上 `{"a":1,"b":2}` 读回是 `{"a": 1, "b": 2}`）。
func jsonEqual(a, b []byte) bool {
	var x, y any
	if json.Unmarshal(a, &x) != nil || json.Unmarshal(b, &y) != nil {
		return false
	}
	return reflect.DeepEqual(x, y)
}

// hasKey 判断 JSON 对象是否含某键（用于断言 intent_payload 里不再有 result）。
func hasKey(raw []byte, key string) bool {
	var m map[string]any
	if json.Unmarshal(raw, &m) != nil {
		return false
	}
	_, ok := m[key]
	return ok
}

// ---------- 纯逻辑：读取路径归一化（无需数据库，CI 也会跑） ----------

// 010 之前的历史行：结果被覆盖写在 intent_payload 的 "result" 键下。
func TestNormalizeLegacyResultPromotesIntentResultKey(t *testing.T) {
	j := Job{IntentPayload: json.RawMessage(`{"modelId":"image-v1","prompt":"blue coat","result":{"url":"https://cdn/legacy.png"}}`)}
	normalizeLegacyResult(&j)
	if got := string(j.ResultPayload); got != `{"url":"https://cdn/legacy.png"}` {
		t.Fatalf("历史结果应被提升为 result_payload，实际 %s", got)
	}
	// 只提升、不改写：原始意图（含历史 result 键）必须原样保留
	if !strings.Contains(string(j.IntentPayload), "blue coat") {
		t.Fatalf("归一化不得丢失原始意图，实际 %s", j.IntentPayload)
	}
	if !strings.Contains(string(j.IntentPayload), `"result"`) {
		t.Fatalf("归一化不得改写 intent_payload 原值，实际 %s", j.IntentPayload)
	}
}

// 010 之后的新行：result_payload 已有值 → 不做任何改动。
func TestNormalizeLegacyResultLeavesNewRowsUntouched(t *testing.T) {
	intent := json.RawMessage(`{"modelId":"image-v1","prompt":"blue coat"}`)
	result := json.RawMessage(`{"url":"https://cdn/new.png"}`)
	j := Job{IntentPayload: intent, ResultPayload: result}
	normalizeLegacyResult(&j)
	if string(j.ResultPayload) != string(result) {
		t.Fatalf("新行 result_payload 不应被改写，实际 %s", j.ResultPayload)
	}
	if string(j.IntentPayload) != string(intent) {
		t.Fatalf("新行 intent_payload 不应被改写，实际 %s", j.IntentPayload)
	}
}

func TestNormalizeLegacyResultIgnoresRowsWithoutResult(t *testing.T) {
	cases := map[string]json.RawMessage{
		"无 result 键":     json.RawMessage(`{"prompt":"雾夜钟楼"}`),
		"result 为 null":  json.RawMessage(`{"prompt":"雾夜钟楼","result":null}`),
		"payload 为空":     json.RawMessage(``),
		"payload 为 null": json.RawMessage(`null`),
		"非法 JSON":        json.RawMessage(`{不是合法JSON`),
	}
	for name, payload := range cases {
		j := Job{IntentPayload: payload}
		normalizeLegacyResult(&j)
		if len(j.ResultPayload) != 0 {
			t.Fatalf("%s：不应产生 result_payload，实际 %s", name, j.ResultPayload)
		}
	}
	// nil 指针不得 panic
	normalizeLegacyResult(nil)
}

// API 形状：新行的 intent_payload 只有原始意图（无 result 键），结果只从 result_payload 出。
func TestJobJSONKeepsIntentAndResultSeparate(t *testing.T) {
	b, err := json.Marshal(Job{
		ID:            "job_1",
		Kind:          "image",
		Label:         "角色立绘",
		Status:        "succeeded",
		IntentPayload: json.RawMessage(`{"modelId":"image-v1","prompt":"blue coat"}`),
		ResultPayload: json.RawMessage(`{"result":{"url":"https://cdn/a.png"}}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	var got struct {
		IntentPayload map[string]any `json:"intent_payload"`
		ResultPayload map[string]any `json:"result_payload"`
	}
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatal(err)
	}
	if _, ok := got.IntentPayload["result"]; ok {
		t.Fatalf("新行 intent_payload 不应含 result 键：%s", b)
	}
	if got.IntentPayload["modelId"] != "image-v1" {
		t.Fatalf("intent_payload 应保留原始意图：%s", b)
	}
	result, ok := got.ResultPayload["result"].(map[string]any)
	if !ok || result["url"] != "https://cdn/a.png" {
		t.Fatalf("result_payload 应携带结果：%s", b)
	}
}

// ---------- 真库集成（EXECUTION_TEST_DATABASE_URL 未设时整组跳过） ----------

// 一条测试覆盖 Job 的全部读取路径（Create/Cancel/Retry 的 RETURNING、
// ListRunning、Get、List），防止新增列在某一处漏改导致 scan 错位。
func TestIntegration_CompleteWritesResultPayloadAndKeepsIntent(t *testing.T) {
	store := testStore(t) // 已在独立 schema 中应用全部迁移（含 010）
	ctx := context.Background()
	const workspace = "ws-result"
	intent := json.RawMessage(`{"modelId":"image-v1","prompt":"blue coat"}`)

	created, replay, err := store.Create(ctx, workspace, "tester", Input{
		IntentID: "intent-result-1", IdempotencyKey: "intent-result-1", Kind: "image",
		Label: "角色立绘", ProjectID: "project-1", IntentPayload: intent,
	})
	if err != nil || replay {
		t.Fatalf("Create: job=%+v replay=%v err=%v", created, replay, err)
	}

	// Cancel RETURNING
	cancelled, err := store.Cancel(ctx, workspace, created.ID)
	if err != nil {
		t.Fatalf("Cancel: %v", err)
	}
	if !jsonEqual(cancelled.IntentPayload, intent) || len(cancelled.ResultPayload) != 0 {
		t.Fatalf("Cancel 返回的列错位：intent=%s result=%s", cancelled.IntentPayload, cancelled.ResultPayload)
	}

	// Retry RETURNING
	retried, err := store.Retry(ctx, workspace, created.ID)
	if err != nil {
		t.Fatalf("Retry: %v", err)
	}
	if !jsonEqual(retried.IntentPayload, intent) || len(retried.ResultPayload) != 0 {
		t.Fatalf("Retry 返回的列错位：intent=%s result=%s", retried.IntentPayload, retried.ResultPayload)
	}

	// ListRunning（先认领为 running）
	if err := store.Advance(ctx, 10); err != nil {
		t.Fatalf("Advance: %v", err)
	}
	running, err := store.ListRunning(ctx, 100)
	if err != nil {
		t.Fatalf("ListRunning: %v", err)
	}
	var seenRunning bool
	for _, j := range running {
		if j.ID != created.ID {
			continue
		}
		seenRunning = true
		if !jsonEqual(j.IntentPayload, intent) || len(j.ResultPayload) != 0 {
			t.Fatalf("ListRunning 返回的列错位：intent=%s result=%s", j.IntentPayload, j.ResultPayload)
		}
	}
	if !seenRunning {
		t.Fatalf("ListRunning 未返回刚认领的任务 %s", created.ID)
	}

	// Complete：结果必须进 result_payload
	result := json.RawMessage(`{"result":{"url":"https://cdn/a.png"}}`)
	if err := store.Complete(ctx, created.ID, true, result, ""); err != nil {
		t.Fatalf("Complete: %v", err)
	}

	// ① result_payload 有值 ② intent_payload 未被改写
	got, err := store.Get(ctx, workspace, created.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if !jsonEqual(got.ResultPayload, result) {
		t.Fatalf("Get：result_payload 应为结果，实际 %s", got.ResultPayload)
	}
	if !jsonEqual(got.IntentPayload, intent) || hasKey(got.IntentPayload, "result") {
		t.Fatalf("Get：intent_payload 被覆盖了！期望 %s 实际 %s", intent, got.IntentPayload)
	}
	// 证据：新行在 /api/v1/tasks 上的形状（intent_payload 无 result，结果在 result_payload）
	if b, err := json.Marshal(got); err == nil {
		t.Logf("API 形状（新行）: %s", b)
	}

	// List 也必须带上该列（列顺序一致）
	list, err := store.List(ctx, workspace, "", "", 100)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	var seenList bool
	for _, j := range list {
		if j.ID != created.ID {
			continue
		}
		seenList = true
		if !jsonEqual(j.ResultPayload, result) {
			t.Fatalf("List：result_payload 错误，实际 %s", j.ResultPayload)
		}
		if !jsonEqual(j.IntentPayload, intent) || hasKey(j.IntentPayload, "result") {
			t.Fatalf("List：intent_payload 被覆盖了！实际 %s", j.IntentPayload)
		}
	}
	if !seenList {
		t.Fatalf("List 未返回任务 %s", created.ID)
	}

	// 真库列值（不信内存里的对象）
	var rawIntent, rawResult string
	if err := store.Pool.QueryRow(ctx, `SELECT intent_payload::text, result_payload::text FROM jobs WHERE workspace_id=$1 AND id=$2`, workspace, created.ID).Scan(&rawIntent, &rawResult); err != nil {
		t.Fatalf("读回列值: %v", err)
	}
	if !strings.Contains(rawIntent, "blue coat") || strings.Contains(rawIntent, "cdn/a.png") {
		t.Fatalf("库中 intent_payload 应仍是原始意图，实际 %s", rawIntent)
	}
	if !strings.Contains(rawResult, "cdn/a.png") {
		t.Fatalf("库中 result_payload 应含结果，实际 %s", rawResult)
	}
}

// 历史行形态（010 之前）：result_payload 为 NULL，结果只存在于 intent_payload.result。
// 迁移不回填，因此**读取路径必须**仍能把结果交给调用方。
func TestIntegration_LegacyRowResultStillReadable(t *testing.T) {
	store := testStore(t)
	ctx := context.Background()
	const workspace = "ws-result"
	const legacyID = "it-result-legacy-1"
	legacyIntent := `{"modelId":"image-v1","prompt":"legacy coat","result":{"url":"https://cdn/legacy.png"}}`

	if _, err := store.Pool.Exec(ctx, `INSERT INTO jobs (workspace_id,id,idempotency_key,request_hash,kind,label,created_by,status,intent_payload)
		VALUES ($1,$2,$3,'h','image','历史任务','tester','succeeded',$4::jsonb)`,
		workspace, legacyID, "k-legacy-1", legacyIntent); err != nil {
		t.Fatalf("构造历史行: %v", err)
	}

	got, err := store.Get(ctx, workspace, legacyID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	// 回退路径：结果通过归一化仍可读到
	if !jsonEqual(got.ResultPayload, []byte(`{"url":"https://cdn/legacy.png"}`)) {
		t.Fatalf("历史行的结果应可通过 result_payload 读到，实际 %s", got.ResultPayload)
	}
	if !jsonEqual(got.IntentPayload, []byte(legacyIntent)) {
		t.Fatalf("历史行 intent_payload 必须原样保留，实际 %s", got.IntentPayload)
	}
	// 证据：历史行在 /api/v1/tasks 上的形状（intent_payload 保留原值，结果由归一化补进 result_payload）
	if b, err := json.Marshal(got); err == nil {
		t.Logf("API 形状（历史行）: %s", b)
	}

	// List 路径同样生效（旧行与新行在 API 上表现一致）
	list, err := store.List(ctx, workspace, "", "", 100)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	var seen bool
	for _, j := range list {
		if j.ID != legacyID {
			continue
		}
		seen = true
		if !jsonEqual(j.ResultPayload, []byte(`{"url":"https://cdn/legacy.png"}`)) {
			t.Fatalf("List 中历史行结果缺失，实际 %s", j.ResultPayload)
		}
	}
	if !seen {
		t.Fatalf("List 未返回历史行 %s", legacyID)
	}

	// 迁移「只加列不回填」：库中该行 result_payload 仍为 NULL
	var stored *string
	if err := store.Pool.QueryRow(ctx, `SELECT result_payload::text FROM jobs WHERE workspace_id=$1 AND id=$2`, workspace, legacyID).Scan(&stored); err != nil {
		t.Fatalf("读回列值: %v", err)
	}
	if stored != nil {
		t.Fatalf("历史行不得被回填，库中 result_payload 应为 NULL，实际 %q", *stored)
	}
}
