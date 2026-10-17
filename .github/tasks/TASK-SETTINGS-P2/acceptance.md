# 需求验收清单：TASK-SETTINGS-P2 设置中心 P2 骨架

> 设计稿：`prototypes/settings-redesign/设置中心P2骨架 v15.html`（归档于本卡 design-prototype.html）
> 评审：Owner 2026-10-17 授权按专业建议执行（范围 OK + 权限选 A：数据区全员可操作 + 确认弹窗兜底）。

---

## 任务信息

- 任务名称：设置中心 P2 骨架（账号/工作区/数据 3 区 + 外观·创作密度 + 通知开关）
- 关联需求/任务卡：TASK-IA-001（已合并 #221，v14 分期 P2）
- 开发者（AI）：Doubao MainAgent
- 开工日期：2026-10-17
- 目标一句话：6 区设置全部从「占位」升级为本地演示态骨架（可交互结构），P3 能力显式禁用不造假。

---

## 一、开发阶段判据（8 条）

| # | 需求点（引用 v15） | 验收判据（可客观验证） | 自检结果 |
|---|---|---|---|
| 1 | 账号与安全骨架（v15 §一） | `/settings/account` 展示身份卡：actorId + 角色徽标（Owner/Admin/Viewer 随 TopBar 切换实时变化）+ 工作区标识（来自 useAuthStore）；昵称/邮箱/登录方式/会话设备=P3 禁用态（不可点击、无 onMouseDown 副作用） | ✅ 已通过 |
| 2 | 工作区与成员骨架（v15 §二） | `/settings/workspace` 信息卡（名称/标识/成员计数）；成员列表=本地 DEV_ACTORS 三角色；Viewer 整区隐藏（ROLE_RANK ≥ admin 才渲染成员区）；邀请/调整/移除/共享预设库=禁用态 | ✅ 已通过 |
| 3 | 数据与存储骨架（v15 §三） | `/settings/data` 存储用量动态统计（localStorage 键/字节）；「清理离线缓存」=确认弹窗→清 offline-fallback 快照、偏好保留；「重置本地偏好」=确认弹窗（列出范围）→ 清 mdp:settings persist v3 → 刷新恢复默认；导出=禁用态 | ✅ 已通过 |
| 4 | 外观·创作密度（v15 §四） | `/settings/appearance` 追加「创作界面密度」节：分镜字号三态（紧凑/标准/宽松）+ 画布密度两态（普通/高密度）；选择写入 preferences.density（persist v4，旧 v3 数据无痕迁移不丢主题/语言/专家开关） | ✅ 已通过 |
| 5 | 通知开关（v15 §四） | `/settings/notifications` 追加「通知」节：任务完成/失败通知、渠道健康告警两个开关，写入 preferences.notifications；成员协作通知=禁用态（P3） | ✅ 已通过 |
| 6 | 三态与边界 | 三页均无 loading/error/empty 裸奔；无僵尸按钮（P3 项 disabled 且 aria-disabled）；页面 ≤300 行/文件 ≤500（骨架拆组件） | ✅ 已通过 |
| 7 | 门禁 | `npm run gate`=0/0；`node --test` 全绿（导航/权限测试更新：成员区 Viewer 隐藏断言、P3 禁用断言）；vitest 全绿；`ui:check` 绿；`visual:check` 绿（基线更新=预期变更） | ✅ 已通过 |
| 8 | 三角色走查 | 浏览器实测 Owner/Admin/Viewer × 账号/工作区/数据/外观/通知：角色徽标联动、成员区 Viewer 隐藏、P3 按钮不可点、重置后偏好恢复默认；台账门禁 RC=0；acceptance 8 判据全过 | ✅ 已通过 |

## 二、设计稿逐点映射（AC-003）

**设计稿信息**：来源=自绘高保真 HTML（v15）｜评审人=Owner｜评审结论=通过（授权按专业建议执行）｜评审日期=2026-10-17

| # | 设计稿模块 | 对应判据 | 实现位置 | 偏差说明 | 自检结果 |
|---|---|---|---|---|---|
| 1 | 身份卡 + 安全占位 | 1 | `SettingsAccount.tsx` | 无 | ✅ 已通过 |
| 2 | 工作区信息卡 + 成员列表 + P3 占位 | 2 | `SettingsWorkspace.tsx` | 无 | ✅ 已通过 |
| 3 | 本地数据卡 + 清理/重置/导出 | 3 | `SettingsData.tsx` | 无 | ✅ 已通过 |
| 4 | 创作密度节 | 4 | `SettingsAppearance.tsx` | 无 | ✅ 已通过 |
| 5 | 通知节 | 5 | `SettingsNotifications.tsx` | 无 | ✅ 已通过 |

## 三、三态与边界（AC-006）

| 页面 | loading | error | empty | 边界 |
|---|---|---|---|---|
| 账号 | 身份未就绪（useAuthStore status=loading/error）→ 显示「身份加载中/不可用」降级文案 | — | — | 角色切换实时联动 |
| 工作区 | 同上 | — | 无成员 → 空态文案（当前恒 3 人） | Viewer 整区隐藏 |
| 数据 | 用量统计计算中 | localStorage 不可用（隐私模式）→ 显示「存储不可用」 | 无缓存 → 「无离线缓存」 | 重置确认弹窗 |

## 四、反模式自查（AC-007，命中即改）

- FE-STATE-001 切片解构 store（防重渲染）
- FE-API 三态（本卡无新 API；本地态操作直接 store/localStorage）
- 僵尸按钮：P3 项一律 disabled + 视觉降级（frontend-quality）
- 页面行数 ≤300/文件 ≤500（BE-SIZE-001 前端口径对齐）

## 五、门禁与测试

```bash
cd apps/web && npm run gate          # 0/0
node --test 'tests/*.test.ts'        # 全绿
npm test                             # vitest 全绿
npm run ui:check && npm run visual:check  # 绿（基线更新=预期变更）
bash .github/scripts/check-task-ledger.sh  # RC=0
```

## ✅ 验收勾对（acceptance-checklist）

| 判据 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| 通过 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
