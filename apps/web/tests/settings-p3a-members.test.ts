import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '../src');
const repoRoot = join(import.meta.dirname, '../../..');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// TASK-SETTINGS-P3A：工作区成员真实接入。
// 把「BFF 矩阵 admin+ 守卫 + 前端真实 API 接入 + 演示态降级」钉在测试里：
// 谁删掉矩阵规则、把成员区开放给 Viewer、或删掉降级路径，都会红。

test('bff authz matrix: workspace members requires admin', () => {
  const src = stripComments(readFileSync(join(repoRoot, 'services/web-bff/internal/httpserver/authz.go'), 'utf8'));
  assert.match(src, /\{\s*prefix:\s*"\/api\/v1\/workspace\/members",\s*read: roleAdmin,\s*write: roleAdmin\s*\}/);
});

test('bff workspaceMembers handler: forwards to internal members endpoint', () => {
  const src = stripComments(readFileSync(join(repoRoot, 'services/web-bff/internal/httpserver/handlers_workspace.go'), 'utf8'));
  assert.match(src, /func \(s \*server\) workspaceMembers/);
  assert.match(src, /\/internal\/v1\/workspaces\/"\s*\+\s*s\.devWorkspace\s*\+\s*"\/members"/);
  assert.match(src, /r\.Method != http\.MethodGet/);
});

test('frontend members api: GET /api/v1/workspace/members with dev actor header + null on failure', () => {
  const src = stripComments(readFileSync(join(root, 'features/settings/workspace-members.ts'), 'utf8'));
  assert.match(src, /fetch\('\/api\/v1\/workspace\/members'/);
  assert.match(src, /X-Actor-Id/);
  assert.match(src, /localStorage\.getItem\('mdp-dev-actor'\)/);
  assert.match(src, /if \(!resp\.ok\) return null/);
  assert.match(src, /Array\.isArray\(body\?\.items\) \? body\.items : null/);
});

test('settings workspace: three-state member table (loading/api/demo fallback)', () => {
  const src = stripComments(readFileSync(join(root, 'pages/SettingsWorkspace.tsx'), 'utf8'));
  // 三态
  assert.match(src, /'loading' \| 'api' \| 'demo'/);
  assert.match(src, /加载成员…/);
  // 真实 API 渲染（items → actor_id/role）
  assert.match(src, /source === 'api'/);
  assert.match(src, /m\.actor_id/);
  assert.match(src, /m\.role/);
  // 降级路径：API 失败/空 → DEV_ACTORS 演示态 + 来源标注
  assert.match(src, /source === 'demo'/);
  assert.match(src, /DEV_ACTORS\.map/);
  assert.match(src, /workspace 服务不可达时降级/);
  // 成员数量：API 成功用真实数量
  assert.match(src, /memberCount = source === 'api' && members \? members\.length : DEV_ACTORS\.length/);
  // 仅 Admin+ 拉取
  assert.match(src, /if \(!canManage\) return/);
});
