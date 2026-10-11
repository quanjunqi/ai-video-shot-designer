import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// D2 接线不变量（源码级）：面板必须真的被挂上，且**顺序**必须是"先写后端、再刷新界面"。
// 这类测试抓的是"组件写好了但没接上 / 接反了顺序"——本项目已发生过多次（接线漏改 ×2、合并丢字段 ×2）。

const page = readFileSync(new URL('../src/pages/SettingsChannels.tsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/features/settings/CurationPanel.tsx', import.meta.url), 'utf8');

test('渠道页：策展按钮存在、且面板被挂载并传入该渠道', () => {
  assert.match(page, /策展上游模型/, '渠道卡片上必须有策展入口');
  assert.match(page, /<CurationPanel[\s\S]*?channel=\{curationFor\}/, '面板必须接收当前渠道');
  assert.match(page, /setCurationFor\(c\)/, '按钮必须设置当前渠道');
  assert.match(page, /import CurationPanel from '@\/features\/settings\/CurationPanel'/, '必须真的 import 面板');
});

test('面板：读取供给与提交策展都用 client 的统一入口（禁止直接 fetch）', () => {
  assert.match(panel, /api\.listSupply\(/, '必须通过 api.listSupply 读供给');
  assert.match(panel, /api\.curateModel\(/, '必须通过 api.curateModel 提交');
  assert.doesNotMatch(panel, /\bfetch\(/, '禁止绕过 client 直接 fetch');
});

test('面板：提交前自查 + 成功后先刷新服务端事实再刷本地视图', () => {
  assert.match(panel, /validateCurateDraft\(draft\)/, '提交前必须用同一套纯函数自查（把后端 422 提前）');
  const curateAt = panel.indexOf('await api.curateModel(');
  const syncAt = panel.indexOf('await syncCatalog()');
  assert.ok(curateAt > 0 && syncAt > curateAt, '必须先写后端（curateModel）、再刷新（syncCatalog）——顺序反了界面会与后端不一致');
});

test('面板：不猜类型 —— 类型来自纯函数推断，且表单上标为必填', () => {
  assert.match(panel, /draftFromSupply\(/, '默认值必须来自纯函数（可单测）');
  assert.match(panel, /产品面类型/, '必须明确标注类型字段');
  assert.match(panel, /必须选择（上游标签无法确定它属于哪一类）|无法判断类型/, '认不出类型时必须解释为什么要求人选');
});

test('面板：已策展与已下架的行照样列出（只打标，不隐藏）', () => {
  assert.match(panel, /已策展/);
  assert.match(panel, /上游已下架/);
});
