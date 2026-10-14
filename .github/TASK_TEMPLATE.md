# 任务卡模板

> 每个 AI 任务开始前必须填写此模板。任务完成后附在此 PR 中。
> **开工前**还须按 `.agents/skills/acceptance-checklist/SKILL.md` 产出验收清单文件
> （复制同目录 `templates/acceptance-checklist.md` → `.github/tasks/<TASK-ID>-acceptance.md`）；
> 本卡 §4 是清单判据的来源，PR 前必须逐项勾对完毕（AC-001 / AC-004 / AC-008）。

## 基本信息

- **任务 ID**：TASK-XXX
- **任务名称**：
- **创建日期**：YYYY-MM-DD
- **人类 Owner**：
- **AI 执行者**：
- **优先级**：P0 / P1 / P2 / P3
- **预计工时**：XX 分钟

---

## 1. 目标

> 一句话说明要做什么，以及为什么做。

**目标**：

**背景**：

---

## 2. 范围

### 范围内（In Scope）

- 

### 范围外（Out of Scope）

- 

---

## 3. 相关文件

> 列出需要修改或参考的文件。

- `path/to/file1.ts` — 说明
- `path/to/file2.go` — 说明

---

## 4. 验收标准

> 可客观验证的完成条件，必须全部满足。**每条都要写清「怎么证明它过了」**
> （判据四要素：判据 / 对象 / 时点 / 例外）；能跑命令的写命令，能看截图的写截图。

- [ ] 验收清单文件已产出：`.github/tasks/<TASK-ID>-acceptance.md`
- [ ] 功能点 1：具体描述（判据：… ；验证：…）
- [ ] 功能点 2：具体描述（判据：… ；验证：…）
- [ ] 测试通过：`npm run gate` / `go test ./...`
- [ ] 无 TypeScript / Go 编译错误
- [ ] 无控制台错误
- [ ] 相关文档已更新

---

## 5. 测试命令

### 前端

```bash
cd apps/web
npm run typecheck
npm run lint:eslint
npm run gate
```

### 后端

```bash
cd services/<service>
go build ./...
go test ./...
go vet ./...
```

### 手动测试步骤

1. 
2. 
3. 

---

## 6. 约束与禁止事项

### 必须遵守

- [ ] 遵循 `.agents/skills/frontend-coding` / `backend-coding`（怎么写）与 `frontend-quality` / `backend-standards`（门禁）
- [ ] 遵循服务边界，不跨库读写
- [ ] 不硬编码参数映射，使用协议模板 capabilities
- [ ] 所有 AI 调用经过 execution 网关，写入审计日志

### 禁止操作

- [ ] 禁止直接 push master
- [ ] 禁止修改已执行的迁移文件
- [ ] 禁止在代码中写入真实密钥
- [ ] 禁止跳过测试强制合并
- [ ] 禁止新增/删除微服务（需人类批准）

---

## 7. 风险与依赖

### 依赖项

- 

### 潜在风险

- 

### 回滚方案

- 

---

## 8. 输出物

- [ ] 分支：`feature/xxx`
- [ ] PR 链接：
- [ ] 验收清单（勾对完毕）：`.github/tasks/<TASK-ID>-acceptance.md`
- [ ] PR body 含「🎯 验收勾对」小节（汇总 + 未过项，AC-005）
- [ ] 测试结果：
- [ ] 文档更新：
- [ ] ADR（如涉及架构决策）：

---

## 9. 完成确认

### AI 自检清单

- [ ] 验收标准全部满足（逐项勾对见验收清单文件；未过项已如实说明）
- [ ] 测试全部通过
- [ ] 无编译错误
- [ ] 无密钥泄露
- [ ] 只修改了必要文件
- [ ] 文档已同步
- [ ] 迭代自检已执行

### 人类审查

- [ ] 功能符合预期
- [ ] 代码质量达标
- [ ] 架构合规
- [ ] 测试充分
- [ ] 无安全风险

**审查结论**：✅ 批准合并 / ❌ 需要修改

**审查人**：__________ **日期**：__________
