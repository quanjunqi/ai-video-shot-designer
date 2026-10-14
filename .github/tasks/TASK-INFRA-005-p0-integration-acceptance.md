# 任务卡：T13 全链路集成验收（P0 完成判据）

> 按 `.github/TASK_TEMPLATE.md` 填写。dev-plan v1.3 §2/§9 T13；方案 §6 P0 完成判据。
> 依赖：T0-T11 全部完成（A 轨完成即可先行验收）。

## 基本信息

- **任务 ID**：TASK-INFRA-005
- **任务名称**：T13 全链路集成验收（看成本→配预算→看健康→选模型→拿产物）
- **创建日期**：2026-10-14
- **人类 Owner**：quanjunqi
- **AI 执行者**：Doubao MainAgent
- **优先级**：P0（M5 验收）
- **预计工时**：2-3 人日
- **依赖**：T0-T11

---

## 1. 目标

**目标**：逐项验收 P0 完成判据——Owner 在模型中心完成「看成本 → 配预算 → 看渠道健康 → 按能力选模型 → 拿到产物地址」全链路，**无需工程师介入查看任何一张报表**。

**背景**：dev-plan §9 验收总纲 5 项判据；A 轨（T0/T1/T2/T3/T4/T9）完成即可先行验收，B 轨（T5/T6/T7/T8/T10）不阻塞。

---

## 2. 范围

### 范围内（In Scope）

- 逐项验收 5 条 P0 完成判据（见 §4）
- 自动化测试断言存在性检查（4xx 不重试、熔断剔候选、超限拦截）
- 异步任务 succeeded 后 `intent_payload.result` 有产物地址（mock 上游验收 AS1-AS4）
- 模型中心权限矩阵生效（角色切换走查）

### 范围外（Out of Scope）

- ❌ 新增功能（验收发现缺口 → 记录新任务卡，不塞进验收）
- ❌ P1/P2 项（成本/质量三档路由、接入向导、ClickHouse 等）

---

## 3. 相关文件

| 文件 | 说明 |
|---|---|
| `ai-video-shot-designer-private/proposals/model-compute/dev-plan.md` | §9 验收总纲 |
| `docs/architecture/key-sequences.md` 等 | 链路参照 |
| 全部 P0 任务卡 | T0-T11 验收勾对结果 |

---

## 4. 验收标准（判据四要素）

| # | 判据（看什么算过） | 对象（看哪个 ref/环境） | 时点 | 例外 |
|---|---|---|---|---|
| 1 | Owner 在模型中心完成"看成本→配预算→看健康→选模型→拿产物"全链路 | 真机走查（owner 角色） | 验收时 | 不 consult 代码 |
| 2 | 无需工程师介入查看任何一张报表 | 走查中不 consult 代码 | 验收时 | — |
| 3 | 4xx 不重试、熔断剔候选、超限拦截有自动化测试断言 | CI 全绿 + 断言存在性检查 | 验收时 | — |
| 4 | 异步任务 succeeded 后 `intent_payload.result` 有产物地址 | mock 上游验收 AS1-AS4 | 验收时 | 依赖 T9/GATE-1 |
| 5 | 模型中心权限矩阵生效（三角色） | 角色切换走查 | 验收时 | 依赖 T10 |

---

## 5. 测试命令

```bash
# 走查前确认全绿
cd services/execution && go test ./... -race
cd apps/web && npm run gate
# 真机走查：本地栈 + 模型中心页面逐项过判据
docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml --profile app up -d
```

---

## 6. 约束与禁止事项

- ❌ 验收发现的缺口不得"顺手修"塞进验收——记录新任务卡，另行排期
- ❌ 不 consult 代码走查（判据 1/2 的证明方式）
- ✅ 逐项勾对留痕：`.github/tasks/TASK-INFRA-005-acceptance.md`

---

## 7. 输出

- 验收报告：逐项判据结果 + 缺口清单（若有）+ 新任务卡（若有）
- PR：验收本身通常无代码；若有缺陷修复，独立 PR
