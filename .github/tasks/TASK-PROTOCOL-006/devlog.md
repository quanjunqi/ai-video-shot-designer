# TASK-PROTOCOL-006 开发日志

## 动作 A（2026-10-17）· 探查与立卡
- 确定实战对象：OpenAI Responses API（/v1/responses）——OpenAI 2025+ 主力契约，本仓 9 模板缺失。
- 证据：官方 repo 分支 main、openapi.json 4.8MB（230 paths，含 /responses）、CreateResponse allOf 三分支均无 required。
- 决策 D-001：规范留档用来源注记（URL+版本+sha256），不进仓库（4.8MB 体积）。
- 决策 D-002：param_mapping 无实测 → observed_evidence 显式标注待验证（061 证据分级）。

## 动作 B（2026-10-17）· 生成与审查
- protocol-gen 实战：首次运行 -path /responses 未匹配（op.Path = basePath+path 拼接，用 /v1/responses 正确）。
- 生成输出：31 params（官方 CreateResponse 全属性）+ response_extract 顶层映射；required 空（规范未声明，不臆测）。
- 审查：type=text、capabilities=text-chat（061 枚举）、async 同步（enabled=false）。

## 动作 C（2026-10-17）· 落库与回归
- 迁移 068（INSERT + capabilities + doc_ref/observed_evidence JSON；修复 B-001：doc_ref 是 jsonb，首版传纯字符串报 invalid input syntax）。
- registry.go + protocol_capabilities.go 常量 + registry 测试更新（9→10：builtinTemplateIDs 字母序、golden 行、merge 11）。
- 真库 production 执行迁移（宿主无 psql → 容器内跑；schema_migrations 空 → MIGRATE_ADOPT_UNTIL=067 采纳登记旧档 + 执行 068）。
- 快照重拍（10 行 migration=068）；audit_test registryIDs 补 responses（9→10）。
- 回归：audit 通过 / 门禁 ✓ / execution mapping 冒烟 ✓ / production build+vet+test -race ✓。

## 纪律自检
- 开工即建日志 ✓；清单先行 ✓；无依据不填（param_mapping 标注待测）✓；迁移只增不改 ✓。
