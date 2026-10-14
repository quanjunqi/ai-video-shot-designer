# TASK-INFRA-002：CI 按改动范围执行

> 按 `.github/TASK_TEMPLATE.md` 填写。

## 目标

让 CI 只执行与本次改动相关的检查，同时**不破坏分支保护的必需状态检查机制**。

## 背景

现状：每次提交/合并都跑前端 `npm ci` + 6 个 Go 服务的 build/vet/gofmt/lint/test
+ gosec + npm audit。两个问题：
1. 文档类 PR 也要等全套；
2. 更糟的是**会被无关的后端失败卡住**。

## 范围

- ✅ `.github/scripts/detect-changes.sh`（变更判定，含 `--from-stdin` 便于单测）
- ✅ `ci.yml`：新增 `changes` job；前端/后端/安全 job 改为**步骤级**条件过滤
- ✅ 新增 `docs/how-to/ci.md`（含核心不变量说明）
- ✅ 新增 shell 脚本检查：禁止 `$var` 紧跟非 ASCII 字符
- ✅ 同步 CI 的关键文档检查列表（`.github/workflows/ci.yml` 的 `Check key docs and contract exist` 步骤）

## 非范围

- ❌ **不改分支保护**：9 项必需检查名保持不变（因此无需改线上配置）
- ❌ 不引入第三方路径过滤 action（用 git diff，零新增依赖、零供应链面积）
- ❌ 不给任何必需检查 job 加 job 级 `if:`（见下）

## 验收标准

1. **必需检查 job 均无 job 级 `if:`**（否则检查不上报 → PR 卡死）
2. 9 项必需检查名保持不变
3. 仅 `apps/web/**` 改动 → 前端门禁真实执行，后端跳过
4. 仅 `services/asset/**` 改动 → 只有 asset 的后端门禁真实执行
5. 仅文档改动 → 前端/后端/安全均跳过，检查仍如实上报成功
6. `.github/**` 或 `deploy/**` 改动 → 全量执行
7. 判定异常（基线不可解析、无差异、diff 失败）→ fail-safe 全量
8. 判定 job 失败 → 各检查**失败**而非跳过（fail-closed，不给假绿）
9. `$var` 紧跟非 ASCII 的检查能捕获该写法且对现有脚本无误报

## 测试命令

```bash
# 分类逻辑单元测试（8 条路径）
printf 'apps/web/src/x.ts\n'          | bash .github/scripts/detect-changes.sh --from-stdin
printf 'services/asset/a.go\n'        | bash .github/scripts/detect-changes.sh --from-stdin
printf '.github/workflows/ci.yml\n'   | bash .github/scripts/detect-changes.sh --from-stdin
# 不变量校验
python3 -c "import yaml;d=yaml.safe_load(open('.github/workflows/ci.yml'));print([j for j,v in d['jobs'].items() if v.get('name','').endswith(('Quality Gate','Build & Test','Security Scan')) and 'if' in v])"
```

## 约束与禁止事项

- **绝不**给必需检查 job 加 job 级 `if:`；**绝不**用 `paths:` 过滤 workflow
- 判定逻辑必须 fail-safe（异常→全量）且 fail-closed（异常→检查失败）
- 不新增必需检查（避免动分支保护）

## 输出

- 分支 `feat/ci-path-filtering-2026-10-10` + PR
- 测试结果：见 PR 描述（8 条分类路径 + 不变量校验）
- 风险说明：判定脚本自身的 bug 可能导致「该跑没跑」；已用 fail-safe + 单测覆盖
  主要路径，并在 `.agents/skills/ci-triage/SKILL.md`（常见失败排查）给出排障手段

## 附：后续可选优化

| # | 想法 | 代价 |
|---|---|---|
| 1 | 把 9 项必需检查收敛为少量「gate」job，后端改用动态矩阵 | 需改分支保护；且引入 aggregator 后若有 bug 会造成假绿，安全性低于现方案 |
| 2 | 用 GitHub Actions 缓存进一步缩短前端 `npm ci` | 已有 setup-node 的 npm 缓存 |
