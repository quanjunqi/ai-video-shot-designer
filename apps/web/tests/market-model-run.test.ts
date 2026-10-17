import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// TASK-MARKET-M2：模型中心「模型试跑」入口。
// 把「真实 runModelTest 调用 + 结果如实展示 + 图片/视频禁用 + Admin+ 权限」钉在测试里：
// 谁退回假调用、把试跑开放给 Viewer、或让图片/视频也能同步试跑，都会红。
// TASK-MARKET-M6 组件拆分后：试跑逻辑在 ModelDetailSheet（详情抽屉），页面仅组装。

const page = readFileSync(new URL('../src/pages/ModelMarket.tsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../src/features/models/ModelDetailSheet.tsx', import.meta.url), 'utf8');
const card = readFileSync(new URL('../src/features/models/ModelMarketCard.tsx', import.meta.url), 'utf8');
const src = page + detail + card;

test('试跑入口：必须走统一 client 入口（api.runModelTest），禁止直接 fetch', () => {
  assert.match(detail, /api\.runModelTest\(/, '必须通过 api.runModelTest 发起真实试跑');
  const runSection = detail.slice(detail.indexOf('试跑'), detail.indexOf('设为个人默认{TYPE_LABEL'));
  assert.doesNotMatch(runSection, /\bfetch\(/, '试跑禁止绕过 client 直接 fetch');
});

test('试跑按钮：Admin+ 条件渲染（与设默认同一权限源）', () => {
  // 以 ModelDetailBody 函数体为界：试跑区必须在详情组件内且被 canDefault 分支包裹
  const detailAt = detail.indexOf('function ModelDetailBody');
  const body = detail.slice(detailAt);
  assert.ok(detailAt > 0, '详情组件必须存在');
  assert.match(body, /\{canDefault && \(/, '试跑区必须挂在 Admin+ 权限分支下');
  const runAt = body.indexOf('发起试跑');
  const canDefaultAt = body.indexOf('canDefault &&');
  assert.ok(runAt > canDefaultAt, '试跑按钮必须位于 canDefault 分支内（Viewer 不渲染）');
});

test('结果展示：真实字段（ok / 上游 HTTP status / 耗时 / 响应摘要），ok=false 也如实展示', () => {
  assert.match(detail, /runResult\.ok/, '必须如实读取上游 ok 结果');
  assert.match(detail, /runResult\.run\?\.status/, '必须展示上游 HTTP 状态码');
  assert.match(detail, /runMs/, '必须展示耗时');
  assert.match(detail, /choices\.0\.message\.content/, '必须尝试抽取文本响应内容');
  assert.match(detail, /rawBody/, '抽取不到时回退原始响应体');
  assert.match(detail, /上游失败/, 'ok=false 必须如实显示为失败而非假装成功');
});

// TASK-MARKET-M10：图片试跑产物渲染（output. 前缀抽取修复）
test('M10: 图片试跑产物必须按执行器 output. 前缀抽取并渲染 <img>', () => {
  assert.match(detail, /output\.data\.0\.url/, '必须识别执行器 output. 前缀图片键（curl 实证）');
  assert.match(detail, /data\.0\.url/, '协议模板声明键作兼容兜底');
  assert.match(detail, /output\.image_urls\.0/, '必须识别 image_urls 形态键');
  assert.match(detail, /extractRunArtifact/, '必须存在产物 URL 抽取函数');
  assert.match(detail, /m\.type === 'image' && runArtifact/, '图片类型且命中产物时走图片分支');
  assert.match(detail, /<img/, '命中产物必须渲染 <img> 缩略图（不再只显示文本）');
  assert.doesNotMatch(detail, /未返回可读内容.*未返回可读内容/, '不得在命中产物时仍显示「未返回可读内容」');
});

test('视频：禁用同步试跑并说明（成本高，走创作流异步生成）', () => {
  assert.match(detail, /视频暂不开放试跑/, 'video 按钮必须禁用并说明');
  assert.match(detail, /视频生成成本较高，暂不开放同步试跑/, '必须解释为什么不支持视频试跑');
  assert.match(detail, /m\.type !== 'video'/, '试跑按钮条件必须按视频排除（文本+图片可跑）');
});

test('图片：开放同步试跑，runtime 用协议模板标准 prompt 字段', () => {
  assert.match(detail, /m\.type === 'image'/, '必须有图片分支');
  assert.match(detail, /prompt: '一张简单的测试图/, '图片 runtime 必须用 prompt 字段（execution engine api_connector 标准）');
  assert.match(detail, /图片试跑为真实生成调用/, '图片试跑必须提示真实成本');
});

test('三态：running 有加载态与真实文案，error 展示真实错误', () => {
  assert.match(detail, /真实调用中/, 'running 态必须明示这是真实调用');
  assert.match(detail, /runState === 'running'/, '必须有 running 分支');
  assert.match(detail, /试跑失败：\{runError\}/, 'error 态必须展示真实错误消息');
  assert.match(detail, /有真实成本/, 'idle 态必须提示真实调用会产生成本');
});

test('连通检测注释已与真实实现一致（probe，不再标注假调通）', () => {
  const store = readFileSync(new URL('../src/stores/useSettingsStore.ts', import.meta.url), 'utf8');
  assert.match(store, /真实 HTTP 探测/, 'testChannel 注释必须反映真实探测实现');
  assert.doesNotMatch(store, /假调通/, '不得残留「假调通」注释误导');
});
