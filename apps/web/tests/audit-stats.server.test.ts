import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// D7b 的回归护栏：审计统计必须来自【服务端】，不得再在前端"当前页"上算。
// 与 settings-navigation.test.ts 同一思路：把架构决定钉在测试里（源码级断言）。
//
// 为什么需要这条：前端的假统计【不会报错、不会崩】，只会让"成功率"随翻页变化 ——
// 这类缺陷靠人眼审查极难发现，只有把它钉成不变量才守得住。

const SRC = readFileSync(
  join(import.meta.dirname, '..', 'src', 'pages', 'SettingsAudit.tsx'),
  'utf8',
);

test('审计统计来自服务端 stats，而不是在前端对当前页做 filter/reduce', () => {
  assert.match(SRC, /statsFrom\(/, 'StatsAudit 必须经由 statsFrom 归一化服务端 stats');
  assert.match(SRC, /stats\?\.(total|success|failed|avgLatencyMs)/, '统计值应读取服务端 stats');
  // ④ §2.3 的耗时百分位同样是【服务端】算的：钉住它不得退化成前端统计
  assert.match(SRC, /stats\?\.p50LatencyMs/, '耗时 P50 必须来自服务端 stats');
  assert.match(SRC, /stats\?\.p95LatencyMs/, '耗时 P95 必须来自服务端 stats');
  assert.match(SRC, /stats\?\.topErrors/, '错误分布必须来自服务端 stats（不得在前端对当前页聚类）');
  // 旧实现的两个特征写法必须消失
  assert.ok(
    !/logs\.filter\(\(l\) => l\.status === 'success'\)/.test(SRC),
    "不得再对当前页 logs 统计 success —— 那是假统计（翻页会变）",
  );
  assert.ok(
    !/logs\.reduce\(\(s, l\) => s \+ l\.latency_ms/.test(SRC),
    '不得再对当前页 logs 计算平均耗时',
  );
});

test('client 的 listAuditLogs 支持服务端筛选参数与 stats 类型', () => {
  const client = readFileSync(
    join(import.meta.dirname, '..', 'src', 'lib', 'api', 'client.ts'),
    'utf8',
  );
  for (const k of ['status', 'model_id', 'channel_id', 'since', 'until']) {
    assert.ok(client.includes(`${k}?: string`), `listAuditLogs 缺少筛选参数 ${k}`);
  }
  assert.match(client, /aggregateOn/, 'listAuditLogs 的响应类型应含 stats.aggregateOn');
});

// D8c 的回归护栏：导出入口必须存在，且筛选条件与页面【同一口径】。
// 为什么钉住：导出若不带筛选，用户会以为"导出的就是看到的那批" —— 这种偏差不会报错，
// 只会让导出的数据与页面不一致，事后极难解释。
test('审计页提供导出入口，且status筛选同时作用于列表/统计/导出', () => {
  assert.match(SRC, /auditExportUrl\(/, '账目页必须通过 api.auditExportUrl 提供导出入口');
  assert.match(SRC, /setStatus/, '账目页必须有状态筛选');
  // 列表取数必须带 status
  assert.match(
    SRC,
    /listAuditLogs\(\{ limit: 100, status: status \|\| undefined \}\)/,
    '列表取数必须带上 status，否则"看到的是筛选后、导出的是全部"',
  );
  // effect 必须依赖 status，否则切换筛选不会重新取数
  assert.match(SRC, /\}, \[status\]\)/, 'effect 必须依赖 status');

  const client = readFileSync(
    join(import.meta.dirname, '..', 'src', 'lib', 'api', 'client.ts'),
    'utf8',
  );
  assert.match(client, /\/api\/v1\/audit\/export/, 'client 必须指向 BFF 的导出端点');
});
