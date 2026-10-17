# TASK-MARKET-M4 验收清单

| # | 需求点 | 判据（四要素） | 自检 |
|---|---|---|---|
| 1 | 试跑 async 分流 | 模板 async.Enabled 时试跑走 RunAsync（submit→poll），否则 Run（判据：handler 代码 + 单测；时点：修改后） | ✅ |
| 2 | 图片试跑可用 | Boogu Image（pt_builtin_openai_img）试跑 → 真实 submit 上游 + 轮询（判据：本地 stub async 端点 submit/poll 返回 done，试跑 ok:True；时点：实测；例外：真实上游 503/超时如实展示） | ✅ |
| 3 | 轮询状态机单测 | RunAsync submit→poll→done/fail/timeout 有单测覆盖（判据：go test 通过；时点：提交前） | ✅ |
| 4 | 无回归 | text 模型试跑仍走 sync（行为不变）；视频试跑仍禁用（判据：stub text 试跑 ok:True 不变；时点：实测） | ✅ |
| 5 | 门禁 | `go build ./... && go test ./... -race && go vet ./...` 全绿；台账门禁 0；PR 附勾对 | ✅ |
