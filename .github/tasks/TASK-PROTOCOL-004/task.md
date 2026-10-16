---
taskId: TASK-PROTOCOL-004
status: 进行中
priority: P1（协议层治理收口——把 openai_video 漂移升级为自动门禁）
pr: "#214"
criteria: 6
criteriaPassed: 0
depends_on: 不依赖 Owner 数据口径（输入 = 注册表 id 集 + 真库快照 + 061 能力键枚举）
---

# TASK-PROTOCOL-004：协议定义三方一致性自检（注册表 ↔ DB ↔ 能力键词表）

> **来源**：TASK-PROTOCOL-003 遗留（SOP 已记录）+ 漂移实证。
> 实测 2026-10-16：`pt_builtin_openai_video` **只在 DB、不在注册表 Go 代码**（grep -c=0）——
> 协议定义来源不统一 = 漂移面。本卡把漂移升级为**可自动检出**的门禁。

## 目标

一句话：**实现协议模板三方一致性审计器（纯函数 + 单测 + 真库快照自证），
自动检出「注册表↔DB 漂移」与「能力键词表违规」，防止协议定义再次分叉。**

## 检查项（Audit 纯函数）

| # | 检查 | 语义 | 判据 |
|---|---|---|---|
| 1 | id 集合 | 注册表 id 集 vs DB id 集 | `db_only` = 漂移检出（阻断项）；`registry_only` = MergeTemplates 补齐态（信息） |
| 2 | 能力键词表 | DB capabilities 键 ∈ 061 枚举（text-chat/text-to-image/image-to-image/text-to-video/image-to-video） | 违规 = 阻断项（064 教训：词表与调用方同源） |
| 3 | 空能力提示 | builtin 且 capabilities 为空（comfyui 例外） | 提示（渐进补齐原则，非阻断） |

## 设计决策

| 编号 | 主题 | 选择 | 理由 |
|---|---|---|---|
| D-001 | 包位置 | **新包 internal/protocolaudit/**（独立于 protocolgen） | 不依赖未合并的 #213；审计 = 独立主题 |
| D-002 | 输入形态 | 纯函数：registryIDs + DB 行快照 + 词表 → Report | 不连库；快照由调用方提供（testdata 固化真库快照） |
| D-003 | 例外规则 | emptyCapOK map（comfyui） | 工作流自定义无法静态声明（#212 同源口径 8/9） |
| D-004 | 门禁自证 | 真库快照单测断言已知漂移稳定检出 | 防回归：快照 = 门禁基线 |

## 范围

### 本期
1. `services/production/internal/protocolaudit/audit.go`：Audit 纯函数 + Report
2. `audit_test.go`：6 单测（漂移检出 / 干净 / 词表违规 / 空提示 / registry-only / 真库快照自证）
3. `testdata/protocol_templates_snapshot.json`：真库 9 行快照（2026-10-17，含来源注释）
4. `docs/how-to/protocol-onboarding.md`：补充「一致性自检」小节（如何跑 + 退出码语义）

### 非范围
- ❌ 不改注册表 / 不动 DB 行 / 不改契约 / 不修 openai_video 漂移（修归入后续卡——本卡只检出不修）
- ❌ 不加 CI workflow（本卡交付审计器 + 单测 + 快照自证；接入 CI 属 infra 卡）

## 验收标准

1. **漂移检出**：Audit 检出 db-only（openai_video fixture 场景）；干净场景无违规
2. **词表违规**：能力键不在枚举 → CapViolation 检出
3. **真库快照自证**：快照 9 行；db-only=[openai_video] 稳定检出；无词表违规
4. **快照留痕**：testdata 快照含来源（真库 + 拉取时间 + 已知漂移注记）
5. **SOP 补充**：protocol-onboarding.md 含一致性自检小节
6. **门禁全绿**：production build/test -race/vet/gofmt + file-size + 台账三方一致

## 测试命令

```bash
cd services/production && go build ./... && go test ./... -race && go vet ./...
bash scripts/check-file-size.sh
bash .github/scripts/check-task-ledger.sh
```
