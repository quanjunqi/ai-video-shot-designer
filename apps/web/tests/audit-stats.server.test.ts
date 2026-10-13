import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// D7b/D8c 的回归护栏（T2-2 迁移版）：审计页的筛选必须来自【服务端】，
// 导出与列表必须【同一口径】。与 settings-navigation.test.ts 同一思路：
// 把架构决定钉在测试里（源码级断言）——假筛选/口径分裂不会报错，只会让
// "列表看着筛过了、而导出仍是全部"，这类缺陷靠人眼极难发现。
//
// 注意：T2-2 用 ModelAuditPage 替代旧 SettingsAudit（旧页 371 行超 ADR-005 ≤300 约束，
// 且无 T1 业务归因列）。新页砍掉了前端 stats 卡（成本/运营聚合移到成本看板页），
// 因此本护栏不再断言 statsFrom —— 改为钉住【筛选送服务端 + 导出同口径】这两条不变式。

const SRC = readFileSync(
  join(import.meta.dirname, '..', 'src', 'pages', 'ModelAudit.tsx'),
  'utf8',
);

test('审计筛选必须送服务端（否则是假筛选），归因 feature 一并送服务端', () => {
  // 任务卡 §2.1：按人/项目筛选必须是【服务端】的 —— 前端只允许在【当前页】上做文本搜索，
  // 那会让"列表看着筛过了、而 total 仍是全集"。T1 迁移 013 后 feature 同样必须送服务端。
  assert.match(SRC, /user_id: userId \|\| undefined/, '操作者筛选必须送服务端（否则是假筛选）');
  assert.match(SRC, /project_id: projectId \|\| undefined/, '项目筛选必须送服务端（否则是假筛选）');
  assert.match(SRC, /feature: feature \|\| undefined/, '功能归因筛选必须送服务端（否则是假筛选）');
});

test('client 的 listAuditLogs 支持服务端筛选参数与 stats 类型', () => {
  const client = readFileSync(
    join(import.meta.dirname, '..', 'src', 'lib', 'api', 'client.ts'),
    'utf8',
  );
  for (const k of ['status', 'model_id', 'channel_id', 'since', 'until', 'feature']) {
    assert.ok(client.includes(`${k}?: string`), `listAuditLogs 缺少筛选参数 ${k}`);
  }
  assert.match(client, /aggregateOn/, 'listAuditLogs 的响应类型应含 stats.aggregateOn');
});

// D8c 的回归护栏：导出入口必须存在，且筛选条件与页面【同一口径】。
test('审计页提供导出入口，且 status/操作者/项目/功能 筛选同时作用于列表与导出', () => {
  assert.match(SRC, /auditExportUrl\(/, '审计页必须通过 api.auditExportUrl 提供导出入口');
  assert.match(SRC, /setStatus/, '审计页必须有状态筛选');
  // 列表与导出必须带【同一套】筛选（含 T1 的 feature）：
  //   列表带而导出不带 ⇒ 用户以为"导出的就是看到的那批" —— 这种偏差【不会报错】。
  assert.match(
    SRC,
    /listAuditLogs\(\{[^)]*status: status \|\| undefined[^)]*user_id: userId \|\| undefined[^)]*project_id: projectId \|\| undefined[^)]*feature: feature \|\| undefined/,
    '列表取数必须带上 status/操作者/项目/功能',
  );
  assert.match(
    SRC,
    /auditExportUrl\(\{[^)]*status: status \|\| undefined[^)]*user_id: userId \|\| undefined[^)]*project_id: projectId \|\| undefined[^)]*feature: feature \|\| undefined/,
    '导出必须带上同一套筛选（status/操作者/项目/功能），否则导出与页面口径不一致',
  );
  // effect 必须依赖全部筛选，否则切换筛选不会重新取数
  assert.match(SRC, /\}, \[status, userId, projectId, feature\]\)/, 'effect 必须依赖全部筛选');

  const client = readFileSync(
    join(import.meta.dirname, '..', 'src', 'lib', 'api', 'client.ts'),
    'utf8',
  );
  assert.match(client, /\/api\/v1\/audit\/export/, 'client 必须指向 BFF 的导出端点');
});
