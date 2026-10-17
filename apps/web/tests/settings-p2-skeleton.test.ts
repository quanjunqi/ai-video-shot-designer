import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '../src');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// TASK-SETTINGS-P2（v15，Owner 2026-10-17 授权）：设置中心 P2 骨架。
// 把「本地演示态 + P3 显式禁用（禁僵尸按钮）+ 成员区 Admin+」的架构决策钉在测试里：
// 谁把 P3 占位做成可点击、把成员区开放给 Viewer、或删掉确认弹窗，都会红。

test('settings account: identity card from useAuthStore + P3 placeholders disabled', () => {
  const src = stripComments(readFileSync(join(root, 'pages/SettingsAccount.tsx'), 'utf8'));
  // 身份卡数据源：与 TopBar 同源 useAuthStore
  assert.match(src, /useAuthStore\(\(s\) => s\.actorId\)/);
  assert.match(src, /useAuthStore\(\(s\) => s\.role\)/);
  assert.match(src, /useAuthStore\(\(s\) => s\.workspaceId\)/);
  // P3 占位：昵称/邮箱、登录方式/退出、会话与设备——全部为展示态（尚未开放），无 onClick 副作用
  assert.match(src, /昵称 \/ 邮箱编辑/);
  assert.match(src, /登录方式 \/ 当前会话/);
  assert.match(src, /会话与设备管理/);
  assert.match(src, /真实账号体系在 P3 提供/);
  // 禁僵尸按钮：安全区为纯文本行，不渲染 Button
  assert.doesNotMatch(src, /<Button[^>]*>[\s\S]*退出登录/);
});

test('settings workspace: member section Admin+ only + P3 member ops disabled', () => {
  const src = stripComments(readFileSync(join(root, 'pages/SettingsWorkspace.tsx'), 'utf8'));
  // 成员区被 canManage（ROLE_RANK ≥ admin）条件包裹 → Viewer 整区隐藏
  assert.match(src, /canManage && \(/);
  assert.match(src, /ROLE_RANK\[role\] \?\? 0\) >= ROLE_RANK\.admin/);
  assert.match(src, /仅 Admin\+ 可见/);
  // 成员数据源 = DEV_ACTORS（本地三角色），邀请/调整/移除/共享预设库 = 展示态 P3（无 Button）
  assert.match(src, /DEV_ACTORS/);
  assert.match(src, /邀请成员/);
  assert.match(src, /调整角色 \/ 移除成员/);
  assert.match(src, /团队共享预设库/);
  assert.doesNotMatch(src, /<Button/);
  // 工作区信息卡全员可见（在条件包裹之外）
  assert.match(src, /工作区信息/);
});

test('settings data: confirm dialogs for clear/reset + export P3 disabled', () => {
  const src = stripComments(readFileSync(join(root, 'pages/SettingsData.tsx'), 'utf8'));
  // 存储用量动态统计 localStorage
  assert.match(src, /estimateBytes/);
  assert.match(src, /TextEncoder\(\)\.encode/);
  // 清理/重置 = 确认弹窗（Dialog + 取消/确认按钮）
  assert.match(src, /Dialog open=\{clearOpen\}/);
  assert.match(src, /Dialog open=\{resetOpen\}/);
  assert.match(src, /确认清理/);
  assert.match(src, /确认重置/);
  // 重置范围说明（确认弹窗列出将被重置的项）
  assert.match(src, /主题、语言、专家模式、默认模型/);
  // 导出 = 显式 P3 占位
  assert.match(src, /导出（项目 \/ 剧集 \/ 资产 \/ 分镜）/);
  assert.match(src, /P3 · 尚未开放/);
  // 清缓存不动偏好（实现里 update 只清 channels/models/templates/catalogSource）
  assert.match(src, /channels: \[\], models: \[\], templates: \[\], catalogSource: 'demo'/);
});

test('settings appearance: creative density added (3 sizes + 2 canvas) into preferences.density', () => {
  const src = stripComments(readFileSync(join(root, 'pages/SettingsAppearance.tsx'), 'utf8'));
  assert.match(src, /SHOT_SIZES/);
  assert.match(src, /紧凑/, '紧凑');
  assert.match(src, /标准/);
  assert.match(src, /宽松/);
  assert.match(src, /CANVAS_DENSITIES/);
  assert.match(src, /高密度/);
  // 写入 preferences.density（保留其它偏好字段）
  assert.match(src, /preferences: \{ \.\.\.preferences, density: \{ \.\.\.preferences\.density, shotFontSize/);
});

test('settings notifications: task/channel switches into preferences.notifications + collab P3', () => {
  const src = stripComments(readFileSync(join(root, 'pages/SettingsNotifications.tsx'), 'utf8'));
  assert.match(src, /任务完成 \/ 失败通知/);
  assert.match(src, /渠道健康告警/);
  assert.match(src, /preferences\.notifications/);
  assert.match(src, /成员协作通知/);
  assert.match(src, /P3 · 尚未开放/);
});

test('settings store: preferences extended with density+notifications and persist v4 keep-old migrate', () => {
  const src = stripComments(readFileSync(join(root, 'stores/useSettingsStore.ts'), 'utf8'));
  // 新字段进接口与默认值
  assert.match(src, /density: \{ shotFontSize: 'compact' \| 'standard' \| 'relaxed'; canvasDensity: 'normal' \| 'high' \}/);
  assert.match(src, /notifications: \{ taskDone: boolean; channelHealth: boolean \}/);
  assert.match(src, /shotFontSize: 'standard' as const/);
  assert.match(src, /taskDone: true, channelHealth: false/);
  // persist v4：迁移签名带 persisted（保留旧值，不再全量重置），merge 深合并 preferences
  assert.match(src, /version: 4/);
  assert.match(src, /migrate: \(persisted\) =>/);
  assert.match(src, /\.\.\.defaultPrefs\(\)/);
  assert.match(src, /\.\.\.prefs/);
});
