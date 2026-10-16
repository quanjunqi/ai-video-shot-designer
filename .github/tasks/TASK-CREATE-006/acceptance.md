# TASK-CREATE-006 验收清单

> 逐项可验证判据（判据/对象/时点/例外 四要素）。规则：AC-001~011。
> ⚠️ 本卡**尚未开工**（`status: 待开工`）；清单按 AC-008「开工前产出」先行落盘。

---

## 任务信息

- 任务名称：`capability.aspectRatios` 显式声明（ADR 分片 6 · D3-B）
- 关联需求/任务卡：[task.md](task.md)
- 开发者（AI）：待指派
- 开工日期：待定
- 目标一句话：让目录显式声明支持哪些画面比例，而不是让前端拿通用表前 N 个去猜。

---

## 一、需求点 → 可验证判据

| # | 需求点 | 验收判据（可客观验证） | 四要素备注 | 自检结果 |
|---|---|---|---|---|
| 1 | 契约先行 | `openapi/bff.yaml` 的 capability 含 `aspectRatios`（可空字符串数组）；`cd apps/web && npm run api:check` 退出 0 | 判据：字段存在 + api:check 绿；对象：契约与生成类型；时点：开发后 | ☐ 未开始 |
| 2 | 契约非破坏 | CI `Contract Breaking Change`（oasdiff `--fail-on ERR`）对本次改动**无 ERR** | 判据：无 ERR 级；对象：契约 diff；时点：PR CI；例外：新增可选字段应为 WARN/无 | ☐ 未开始 |
| 3 | 迁移合规 | 新迁移在**全新库**执行零错误；号段符合认领表；未修改任何已执行迁移 | 判据：全新库通过 + `git diff` 无旧迁移改动；对象：migration；时点：开发后 | ☐ 未开始 |
| 4 | 后端读写 | production 服务可写入并返回该字段；目录 API 响应含 `aspectRatios` | 判据：API 响应字段存在；对象：production；时点：开发后 | ☐ 未开始 |
| 5 | **已声明**模型走 declared | 目录声明了 `aspectRatios` 的模型 → 前端 `source === 'declared'` 且 `options` 与声明**逐字一致**（顺序一致） | 判据：source 值 + 数组逐字相等；对象：`control-schema.ts`；时点：开发后 | ☐ 未开始 |
| 6 | **未声明**模型行为不变 | 未声明该字段的模型 → `source === 'count-fallback'`，`options` 与**改动前完全一致**（回归断言） | 判据：与改动前快照逐字相等；对象：既有模型；时点：开发后；例外：无 | ☐ 未开始 |
| 7 | 视频侧去硬编码 | `control-schema.ts` 不再出现 `listFallbackRange(3, …)` 的硬编码 3；视频比例由目录数据决定 | 判据：硬编码消失 + 数据驱动生效；对象：视频模型；时点：开发后 | ☐ 未开始 |
| 8 | 测试与门禁 | 新增纯函数单测（declared 优先 / 缺失回退）通过；`npm run gate` = 0/0；`npm test` 全绿；后端 `go build/test -race/vet` 全绿 | 判据：命令均通过；对象：前后端；时点：开发后 | ☐ 未开始 |

---

## 二、设计稿逐点映射

**N/A —— 非 UI 任务**（改变的是选项**数据来源**，不改布局/视觉）。

---

## 三、三态与边界

| # | 场景 | 预期 | 自检结果 |
|---|---|---|---|
| 1 | 目录声明了比例 | `source='declared'`，选项 = 声明值 | ☐ 未开始 |
| 2 | 目录未声明（既有模型） | `source='count-fallback'`，行为与改动前一致 | ☐ 未开始 |
| 3 | 目录声明为**空数组** | 明确语义（视为未声明 or 空选项）——**须在卡内定死并测** | ☐ 未开始 |
| 4 | 声明含非法/重复值 | 去重或拒绝，不产生重复选项 | ☐ 未开始 |
| 5 | 旧库升级 | 迁移后既有模型 `aspect_ratios` 为 NULL → 走 count-fallback，不报错 | ☐ 未开始 |

---

## 四、反模式自查

| # | 反模式检查 | 命中？ | 处理 |
|---|---|---|---|
| 1 | 契约未先行（CT-001） | ☐ 未开始 | 判据 1 专治 |
| 2 | 改已执行迁移 | ☐ 未开始 | 判据 3 |
| 3 | 破坏向后兼容（既有模型行为变了） | ☐ 未开始 | 判据 6 |
| 4 | 放宽 `source` 三态语义 | ☐ 未开始 | 约束 5 |
| 5 | 后端吞错 `_ = f()`（BE-ERR-001） | ☐ 未开始 | — |
| 6 | SQL 拼接（BE-PGX-001） | ☐ 未开始 | — |

---

## 五、门禁与测试

| # | 检查 | 命令 | 结果 |
|---|---|---|---|
| 1 | 契约与前端 | `cd apps/web && npm run api:check && npm run gate && npm test` | ☐ 未开始 |
| 2 | 后端 | `cd services/production && go build ./... && go test ./... -race && go vet ./...` | ☐ 未开始 |
| 3 | 迁移（全新库 + 旧库升级） | 见 `.agents/skills/database-migrations/SKILL.md` | ☐ 未开始 |
| 4 | 台账一致性 | `bash .github/scripts/check-task-ledger.sh` | ☐ 未开始 |

---

## 六、PR 附勾对结果

```markdown
## ✅ 验收勾对（acceptance-checklist）
- 需求点：__/8 通过（未过项：）
- 设计稿映射：N/A（非 UI 任务）
- 三态与边界：5/5 通过
- 反模式自查：6/6 未命中
- 门禁：api:check / gate / npm test / 后端三门 / oasdiff 无 ERR
- 未过项及原因：（如实填写，不得隐瞒）
```
