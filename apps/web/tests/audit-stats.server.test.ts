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
