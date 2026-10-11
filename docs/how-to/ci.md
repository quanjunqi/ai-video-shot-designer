# CI 怎么工作的

本文介绍 CI 流水线的结构和常见问题排查。

## CI 跑什么

| Job | 什么时候跑 |
|---|---|
| Detect Changes | 每次都跑（只判断改了什么，几秒） |
| Frontend Quality Gate | 前端代码有改动时 |
| Backend Build & Test × 6 | 对应服务有改动时 |
| Security Scan | 前端或后端有改动时 |
| Documentation Check | 每次都跑（检查关键文档存在） |
| Merge Check | PR 汇总 |

## 改动什么会触发全量

以下改动会触发所有检查全跑：
- `.github/**`（CI 配置本身）
- `deploy/**`（部署配置）

## CI 红了怎么排查

| 症状 | 先看哪里 |
|---|---|
| 前端红 | 本地跑 `npm run gate` |
| 后端红 | 本地跑对应服务的 `go test ./... -race` |
| 文档检查红 | 看缺了哪个文件 |
| 某检查一直没跑 | 看 Detect Changes 的输出，确认有没有识别到你的改动 |

## 本地复现 CI 判定

```bash
printf 'services/asset/a.go\n' | bash .github/scripts/detect-changes.sh --from-stdin
```

## 改 CI 配置注意

- 必需检查的 job 必须始终运行，不要给 job 加 `if:`（会导致 PR 永远卡着等检查）
- 要跳过重的步骤，在 job 内部加步骤级 `if:`
