# <TASK-ID> 开发日志

> 开发过程的事实源：**动作 / 证据 / 决策 / 阻塞** 四类条目，随开发同步记录。
> 审计 agent（人或 AI）依此还原：是否先测试后提交、是否越界、验证是否真实、决策是否成立。
> 规则：AC-010（`.agents/skills/acceptance-checklist/SKILL.md`）。**开工即建，随开发追加，PR 前完成；禁止交付前一次性补写。**

## 任务信息

| 字段 | 值 |
|---|---|
| 任务卡 | [task.md](task.md) |
| 验收清单 | [acceptance.md](acceptance.md) |
| 分支 | fix/ssrf-guard-2026-10-15 |
| PR | #<待开>（合并 sha：<待填>） |
| 开工 | 2026-10-15（本地） |
| 完成 | 2026-10-15 |
| 开发者 | AI Agent（会话 <id>） |

## 执行轨迹（正序；每个动作一条）

> 一条 = 时间 + 阶段 + 动作 + 发现/证据（命令与输出摘要，完整输出引用 PR/文件）。决策单列 D-xxx。

### 2026-10-15 开工/探查（验收型：实现已在 develop，netguard 由 INFRA-004 抽至 shared/）
- **动作**：读任务卡 8 条验收标准；建 worktree sec-001（fix/ssrf-guard-2026-10-15，基 origin/develop@2c3b998）；核对实现与测试覆盖
- **发现/证据**：
  - 引擎出站已接入：cmd/server/main.go:76-77 `upstreamPolicy := netguard.FromEnv` + `engineClient := upstreamPolicy.NewClient(600s)`；:121 worker（async）、:157 httpapi（sync）双路径共用；:142 下载上游 URL 走受控 client；:147 asset 内部 API 用普通 client（内网目标，符合非范围）
  - netguard 能力：Policy{hostAllowed/CheckURL/CheckIP/Control/NewTransport/NewClient}；Control 作用于真实拨号 IP（防 DNS rebinding）；netguard.go:106 IPv4-mapped IPv6 还原后判断
  - 测试 11 单测 + 1 端到端：TestCheckIP_DefaultPolicyBlocksInternalRanges（含 ::ffff:10.0.0.1）/AllowPrivateOpensLoopbackAndPrivateButNotMetadata/CheckURL（含 ftp:// file://）/CheckURL_Allowlist（含 api.openai.com.evil.com 后缀伪装）/Client_RevalidatesRedirectTarget/RedirectHopLimit/BlocksLoopbackByDefault/AllowPrivatePermitsLocalProvider/FromEnv + engine TestSubmit_SSRFGuardBlocksLoopbackUpstream（拦截→上游0命中；AllowPrivate 放开→成功1命中）
- **决策**：D-001

### YYYY-MM-DD HH:MM 开发/验证/PR/验收（按实际追加）
- **动作**：
- **证据**：

## 决策记录 D

| 编号 | 主题 | 选项 | 选择 | 理由 | 时机 |
|---|---|---|---|---|---|
| D-001 | netguard 归属 | execution/internal / shared/ | shared/netguard（既有）| INFRA-004 已抽为公共能力（c4d66c3），SEC-001 直接复用，不重复实现 | 开工（既有事实） |
| D-002 | 内部服务 client | 也套防护 / 保持普通 client | 保持普通 client | 任务卡非范围：catalog/creds/asset 内部 API 目标是私网内部服务，套防护自断链路 | 开工（任务卡已定） |

> 重要选择必须留痕（哪怕一句"选 B 因为 CI 更稳"）。审计以此判断拍板是否成立、有无被推翻。

## 验证记录 V

| 编号 | 对应验收判据 | 命令/方式 | 结果 | 证据位置 |
|---|---|---|---|---|
| V-001 | 验收1 默认拒绝各内网段 | netguard_test.go TestCheckIP_DefaultPolicyBlocksInternalRanges | PASS | netguard_test.go:14 |
| V-002 | 验收2 IPv4-mapped 还原 | 同上用例含 "::ffff:10.0.0.1"/"::ffff:127.0.0.1" + netguard.go:106 还原逻辑 | PASS | netguard_test.go:33-34 |
| V-003 | 验收3 放开后仍拒元数据 | TestCheckIP_AllowPrivateOpensLoopbackAndPrivateButNotMetadata | PASS | netguard_test.go:52 |
| V-004 | 验收4 白名单+后缀伪装 | TestCheckURL_Allowlist 含 "api.openai.com.evil.com" 拒绝 | PASS | netguard_test.go:85-102 |
| V-005 | 验收5 重定向重校验+跳数上限 | TestClient_RevalidatesRedirectTarget / TestClient_RedirectHopLimit | PASS | netguard_test.go:146/164 |
| V-006 | 验收6 端到端拦截与放开 | engine TestSubmit_SSRFGuardBlocksLoopbackUpstream（0 命中 → AllowPrivate 成功 1 命中） | PASS | engine_test.go:497 |
| V-007 | 验收7 协议限制 | TestCheckURL 含 ftp:// file:// 拒绝 | PASS | netguard_test.go:68-82 |
| V-008 | 验收8 内部服务不破坏 | main.go:147 asset 内部 API 普通 client + 双路径接入 + execution 全量 build/vet/test | PASS（全量全绿） | main.go:133-152 + CI |

> 结果只填 PASS / FAIL / 跳过+原因；证据位置可引用 PR、CI 链接、文件路径。禁止只写结论不写证据。

## 阻塞与解法 B

| 编号 | 阻塞 | 根因 | 解法 | 复用教训 |
|---|---|---|---|---|
| B-001 |  |  |  |  |

## 纪律自检（对照 `.agents` 规则，逐项留证据）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 先本地测试/验证再 commit | ✓ | V-001~V-008（netguard 11 单测 + engine 端到端 + 全量全绿后提交） |
| 按路径 add（禁 `git add -A`） | ✓ / ✗ | commit 明细 |
| 只改点名范围（未越界） | ✓ | 仅新增 .github/tasks/ 文档；无代码改动（实现已在 develop） |
| 验收清单逐项勾对（AC-004/005） | ✓ | acceptance.md 8/8 ✅ |
| GATE / 后端门禁全绿 | ✓ | gofmt/build/vet/test 全绿；无前端改动 |
| 台账同步（状态/PR 号） | 待 PR 合并后 | README 行更新 |
| 迁移只增不改 / 号段合规（如涉） | ✓ / ✗ | 迁移 diff |

> 任一 ✗ 必须写明原因与处置，不得空项带过。

## 复盘（收尾时写，1–3 句每项）

- **做得好的**：AC-010 连续实践（INFRA-004→SEC-001）；8 条验收标准与测试一一对应，全部可复核
- **可改进的**：端到端验证依赖单测（httptest 模拟内网服务），未起真实本地栈
- **遗留/后续**：配额限流（SEC-002）依赖 AUDIT-001 cost_amount 写入；本片未覆盖 OIDC/请求体脱敏（任务卡已声明）
