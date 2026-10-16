// TASK-MODEL-006 判据 8 真机勾对脚本：useSettingsStore.catalogSource 实测是否 === 'server'
//
// 为什么需要它：判据 8 断言的是「前端在真实浏览器里加载后，目录数据源从 demo 迁移到 server」。
// 单测（vitest）锁的是逻辑分支，不能证明「真机 + 真 BFF + 真 dev server」下这条路径可达。
// 本脚本用无头 Chrome + CDP 打开真前端，注入 dev 身份，等应用自己调 syncCatalog()，
// 再在页面上下文里读回 useSettingsStore.catalogSource，并打印真实加载到的模型清单。
//
// 用法（在 apps/web 下）：
//   node scripts/verify-catalog-source.mjs
// 前置：BFF 已在 http://127.0.0.1:8080 运行（本脚本不启动任何后端）。
//
// 退出码（与仓内覆盖率棘轮同口径）：
//   0 = 断言通过（catalogSource === 'server' 且目录非空）
//   1 = 断言失败（读到了值，但不是 'server'）
//   2 = 无法验证（Chrome 起不来 / dev server 起不来 / BFF 不可达 / 读不到 store）—— 2 ≠ 通过
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, '..');
const BFF = process.env.BFF_PROXY_TARGET || 'http://127.0.0.1:8080';
const ROUTE = '/settings/models'; // 该页自己也会调 syncCatalog()，且渲染 catalogSource 徽章
const RC_PASS = 0;
const RC_FAIL = 1;
const RC_CANNOT = 2;

const T_DEV_SERVER = 90_000;
const T_CATALOG = 60_000;
const T_EVAL = 25_000; // 单次页面求值上限（页面卡住时不能让脚本无限等）
const T_TOTAL = 240_000; // 整体看门狗（超时按 rc=2 无法验证退出，绝不假通过）

let STEP = 'init'; // 看门狗报出卡在哪一步

const log = (...a) => console.log('[verify-catalog-source]', ...a);
const cannot = (msg) => {
  console.error(`\n✗ 无法验证（rc=${RC_CANNOT}）：${msg}`);
  process.exit(RC_CANNOT);
};

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} 超时（${ms / 1000}s）`)), ms)),
  ]);
}

// ── 工具 ────────────────────────────────────────────────────────────────
function chromePath() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// ── dev server（复用 visual-regression.mjs 的口径：dev server + --strictPort）──
async function startDevServer(port) {
  // 显式 --host 127.0.0.1：vite 默认只绑 localhost（本机解析成 ::1，实测 lsof 显示 [::1]:5173），
  // 用 127.0.0.1 探测会 fetch failed；固定 IPv4 让 dev server / 探测 / Chrome 三者同源一致。
  const child = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: APP_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  let exited = null;
  child.on('exit', (code) => (exited = code));
  const deadline = Date.now() + T_DEV_SERVER;
  for (;;) {
    if (exited !== null) throw new Error(`dev server 退出（code=${exited}）：\n${out.slice(-800)}`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}${ROUTE}`);
      if (res.ok) return { child, out: () => out };
    } catch {
      /* 还没起来 */
    }
    if (Date.now() > deadline) throw new Error(`dev server ${T_DEV_SERVER / 1000}s 未就绪：\n${out.slice(-800)}`);
    await sleep(400);
  }
}

// ── 极简 CDP 客户端（Node 22 自带全局 WebSocket）────────────────────────
async function connectCDP(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('CDP WebSocket 连接超时')), 10_000);
    ws.addEventListener('open', () => { clearTimeout(t); resolve(); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(t); reject(new Error('CDP WebSocket 连接失败')); }, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
    if (msg.id) {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    } else {
      for (const cb of listeners.get(msg.method) ?? []) cb(msg.params);
    }
  });
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++seq;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    on(method, cb) {
      if (!listeners.has(method)) listeners.set(method, []);
      listeners.get(method).push(cb);
    },
    close() { try { ws.close(); } catch { /* ignore */ } },
  };
}

// 页面上下文求值：返回 JSON 值（异常 → 抛出，由调用方决定 rc）
async function evalJson(cdp, expression, ms = T_EVAL) {
  const r = await withTimeout(
    cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    }),
    ms,
    '页面求值',
  );
  if (r.exceptionDetails) {
    const d = r.exceptionDetails.exception?.description || r.exceptionDetails.text || '未知求值异常';
    throw new Error(`页面求值异常：${d.split('\n')[0]}`);
  }
  return r.result.value;
}

// 启动 headless Chrome（参数照抄 visual-regression.mjs，额外开 CDP 端口）
function startChrome(url) {
  const chrome = chromePath();
  if (!chrome) return null;
  const profile = join(tmpdir(), 'mdp-verify-catalog-chrome-profile');
  rmSync(profile, { recursive: true, force: true }); // 干净 profile：无历史 localStorage，避免脏态
  mkdirSync(profile, { recursive: true });
  const child = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-sandbox',
      '--no-first-run',
      '--disable-extensions',
      `--user-data-dir=${profile}`,
      '--remote-debugging-port=0',
      '--remote-allow-origins=*',
      '--window-size=1440,900',
      '--force-device-scale-factor=1',
      url,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));
  return { child, profile, stderr: () => stderr };
}

async function cdpPort(profile, chrome) {
  const file = join(profile, 'DevToolsActivePort');
  const deadline = Date.now() + 20_000;
  for (;;) {
    if (existsSync(file)) {
      const port = readFileSync(file, 'utf8').split('\n')[0].trim();
      if (port) return Number(port);
    }
    if (chrome.child.exitCode !== null) {
      throw new Error(`Chrome 提前退出（code=${chrome.child.exitCode}）：\n${chrome.stderr().slice(-500)}`);
    }
    if (Date.now() > deadline) throw new Error(`20s 内未拿到 DevToolsActivePort：\n${chrome.stderr().slice(-500)}`);
    await sleep(200);
  }
}

async function pageTarget(port, expectHostPort) {
  const deadline = Date.now() + 15_000;
  for (;;) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const pages = list.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      const preferred = pages.find((t) => t.url.includes(expectHostPort)) ?? pages[0];
      if (preferred) return preferred;
    } catch {
      /* 还没起来 */
    }
    if (Date.now() > deadline) throw new Error('15s 内未拿到页面 target');
    await sleep(200);
  }
}

// 页面启动前注入（addScriptToEvaluateOnNewDocument）：
//   ① dev 身份：前端 dev 模式读 localStorage['mdp-dev-actor']（useAuthStore.devActorInitial）
//   ② 清掉持久化快照，保证本次加载从内置默认 demo 起步（真发生 demo → server 迁移）
//   ③ 记录 zustand persist 每次写 localStorage('mdp:settings') 的 catalogSource —— 这是【应用自己的
//      store 实例】写出来的轨迹，可与动态 import 读到的值互相印证
const BOOTSTRAP = `(() => {
  try {
    localStorage.setItem('mdp-dev-actor', 'user_dev');
    localStorage.removeItem('mdp:settings');
  } catch (e) { window.__mdpBootError = String(e); }
  const trace = [];
  window.__mdpCatalogTrace = trace;
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (k === 'mdp:settings') {
      let src = null, n = null;
      try {
        const p = JSON.parse(v);
        src = p && p.state ? p.state.catalogSource : null;
        n = p && p.state && Array.isArray(p.state.models) ? p.state.models.length : null;
      } catch (e) { /* ignore */ }
      let frame = '';
      try {
        frame = ((new Error().stack) || '').split('\\n').find((l) => l.indexOf('useSettingsStore') >= 0) || '';
      } catch (e) { /* ignore */ }
      trace.push({ at: Math.round(performance.now()), catalogSource: src, modelCount: n, storeFrame: frame.trim() });
    }
    return orig.call(this, k, v);
  };
})();`;

// 页面上下文探针：读 store（动态 import 应用实际加载的同一个模块 URL）+ 持久化快照 + DOM 徽章
const PROBE = `(async () => {
  const out = { href: location.href, readyState: document.readyState };
  out.bootError = window.__mdpBootError || null;
  out.trace = window.__mdpCatalogTrace || null;
  const resources = performance.getEntriesByType('resource').map((e) => e.name);
  out.storeModuleUrls = resources.filter((n) => n.includes('/stores/useSettingsStore'));
  out.authModuleUrls = resources.filter((n) => n.includes('/stores/useAuthStore'));
  const body = document.body ? document.body.innerText : '';
  out.domBadge = { connected: body.includes('目录已连接'), offline: body.includes('目录离线降级') };
  const pick = (needle) => (out.storeModuleUrls.find((n) => n.includes(needle)) || null);
  const storeUrl = pick('/stores/useSettingsStore');
  out.storeModuleUrlUsed = storeUrl || '/src/stores/useSettingsStore.ts';
  try {
    const mod = await import(out.storeModuleUrlUsed);
    const st = mod.useSettingsStore;
    out.storeImportOk = true;
    out.catalogSource = st.getState().catalogSource;
    try { out.initialCatalogSource = st.getInitialState().catalogSource; } catch (e) { out.initialCatalogSource = 'n/a'; }
    out.models = st.getState().models.map((m) => ({ id: m.id, name: m.name, type: m.type, channelId: m.channelId, status: m.status }));
    out.channels = st.getState().channels.map((c) => ({ id: c.id, name: c.name, kind: c.kind }));
    try {
      const au = await import(out.authModuleUrls[0] || '/src/stores/useAuthStore.ts');
      const a = au.useAuthStore.getState();
      out.identity = { status: a.status, workspaceId: a.workspaceId, actorId: a.actorId, role: a.role };
    } catch (e) { out.identity = 'n/a: ' + String(e); }
  } catch (e) {
    out.storeImportOk = false;
    out.storeImportError = String(e);
  }
  try { out.persistedCatalogSource = JSON.parse(localStorage.getItem('mdp:settings')).state.catalogSource; }
  catch (e) { out.persistedCatalogSource = null; }
  return out;
})()`;

// 诊断：syncCatalog() 用裸 catch 吞掉了原始异常（catch {}），CDP 打开「捕获时也暂停」，
// 就能拿到被吞掉的异常类型/消息/抛出帧 —— 这决定了是「后端不可达」还是「前端映射抛错」。
async function captureSwallowedError(cdp) {
  const pauses = [];
  const cap = 80;
  await cdp.send('Debugger.enable');
  cdp.on('Debugger.paused', (p) => {
    if (pauses.length < cap) {
      pauses.push({
        reason: p.reason,
        type: p.data?.className ?? null,
        message: (p.data?.description ?? '').split('\n')[0],
        frames: (p.callFrames ?? []).slice(0, 5).map((f) => `${f.functionName || '(anon)'} @ ${f.url.replace(/^http:\/\/[^/]+/, '')}:${f.location.lineNumber + 1}`),
      });
    }
    cdp.send('Debugger.resume').catch(() => {});
  });
  await cdp.send('Debugger.setPauseOnExceptions', { state: 'all' });
  // ★ 用「发出即不管」(awaitPromise:false) 的方式触发：页面若被暂停，脚本本身不会跟着卡死
  //   （实测 awaitPromise:true 时若某次暂停没能续跑，整条 CDP 求值会永久挂起）。
  await withTimeout(
    cdp.send('Runtime.evaluate', { expression: TRIGGER, awaitPromise: false, returnByValue: false, userGesture: true }),
    6_000,
    '异常诊断触发',
  ).catch(() => {});
  await sleep(5_000); // 留时间让被吞掉的异常触发暂停、由上面的 handler 逐次续跑
  await cdp.send('Debugger.setPauseOnExceptions', { state: 'none' }).catch(() => {});
  await cdp.send('Debugger.resume').catch(() => {});
  await withTimeout(cdp.send('Debugger.disable'), 5_000, 'Debugger.disable').catch(() => {});
  const app = pauses.filter((p) => p.frames.some((f) => f.includes('useSettingsStore') || f.includes('channel-sync') || f.includes('client.ts')));
  return { total: pauses.length, appFrames: app.length, interesting: (app.length ? app : pauses).slice(0, 6) };
}

// 反事实实验（**不修改任何源码/数据**）：只在 CDP 层把 /api/v1/catalog 响应里
// 非数组的 params/responseParams 就地改成 []（＝ OpenAPI 契约声明的数组），再让页面重跑
// syncCatalog()。若 catalogSource 随即变成 'server'，就证明判据 8 的拦路石**只有**这条畸形数据。
async function counterfactualFix(cdp) {
  const patched = [];
  let seen = 0;
  cdp.on('Fetch.requestPaused', async (p) => {
    seen += 1;
    try {
      if (p.responseStatusCode === undefined) return void (await cdp.send('Fetch.continueRequest', { requestId: p.requestId }));
      const { body, base64Encoded } = await cdp.send('Fetch.getResponseBody', { requestId: p.requestId });
      const text = base64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body;
      let next = text;
      try {
        const json = JSON.parse(text);
        let changed = false;
        for (const t of json.templates ?? []) {
          if (!Array.isArray(t.params)) { patched.push(`${t.id}.params=${JSON.stringify(t.params)}→[]`); t.params = []; changed = true; }
          if (!Array.isArray(t.responseParams)) { patched.push(`${t.id}.responseParams=${JSON.stringify(t.responseParams)}→[]`); t.responseParams = []; changed = true; }
        }
        if (changed) next = JSON.stringify(json);
      } catch { /* 解析失败就原样返回 */ }
      const responseHeaders = (p.responseHeaders ?? []).filter((h) => !/^(content-length|content-encoding)$/i.test(h.name));
      await cdp.send('Fetch.fulfillRequest', {
        requestId: p.requestId,
        responseCode: p.responseStatusCode ?? 200,
        responseHeaders,
        body: Buffer.from(next, 'utf8').toString('base64'),
      });
    } catch (e) {
      await cdp.send('Fetch.continueRequest', { requestId: p.requestId }).catch(() => {});
    }
  });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/v1/catalog*', requestStage: 'Response' }] });
  let trigger = null;
  try {
    trigger = await evalJson(cdp, TRIGGER, 20_000);
  } catch (e) {
    trigger = { error: e.message };
  }
  await cdp.send('Fetch.disable').catch(() => {});
  const after = await evalJson(cdp, PROBE, 20_000).catch((e) => ({ error: e.message }));
  return {
    interceptedResponses: seen,
    bodyPatched: patched,
    syncCatalog: trigger,
    catalogSourceAfterPatch: after.catalogSource,
    modelIdsAfterPatch: (after.models ?? []).map((m) => m.id),
    domBadgeAfterPatch: after.domBadge,
  };
}

// 页面侧直接调 api.getCatalog()/listUserChannels()（与 store 同一个 client 模块），
// 看页面实际收到的形状 —— 用于区分「响应体形状不对」与「映射逻辑抛错」
const RAW_API = `(async () => {
  const c = await import('/src/lib/api/client.ts');
  const out = {};
  try {
    const dir = await c.api.getCatalog();
    out.catalogKeys = dir && typeof dir === 'object' ? Object.keys(dir) : String(dir);
    out.catalogCounts = dir && typeof dir === 'object'
      ? { channels: dir.channels && dir.channels.length, models: dir.models && dir.models.length, templates: dir.templates && dir.templates.length }
      : null;
    out.modelIds = Array.isArray(dir?.models) ? dir.models.map((m) => m.id) : null;
    out.templateParamShapes = Array.isArray(dir?.templates) ? dir.templates.map((t) => Array.isArray(t.params) ? t.params.map((p) => (p === null ? 'null' : typeof p)) : typeof t.params) : null;
  } catch (e) { out.catalogError = String(e); }
  try {
    const u = await c.api.listUserChannels();
    out.userKeys = u && typeof u === 'object' ? Object.keys(u) : String(u);
    out.userCount = Array.isArray(u?.items) ? u.items.length : null;
    out.userItems = Array.isArray(u?.items) ? u.items.map((i) => ({ id: i.id, kind: i.kind, syncKind: i.syncKind, sort: i.sort })) : null;
  } catch (e) { out.userError = String(e); }
  // 复现 useSettingsStore.ts:81 的映射表达式（t.params ?? []).map(...)）跑在真实响应上，
  // 用来把「后端返回的形状」与「前端那一行抛错」直接对上（仅诊断，不替代判据断言）
  try {
    const dir2 = await c.api.getCatalog();
    out.mappingProbe = (dir2.templates ?? []).filter((t) => !Array.isArray(t.params) || !Array.isArray(t.responseParams)).map((t) => {
      let err = null;
      try { (t.params ?? []).map((p) => ({ ...p, type: p.type })); } catch (e) { err = String(e); }
      return {
        id: t.id,
        paramsType: Array.isArray(t.params) ? 'array' : typeof t.params,
        responseParamsType: Array.isArray(t.responseParams) ? 'array' : typeof t.responseParams,
        sameExpressionError: err,
      };
    });
  } catch (e) { out.mappingProbeError = String(e); }
  return out;
})()`;

// 显式在页面上下文触发 syncCatalog()，读回前后值
const TRIGGER = `(async () => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/stores/useSettingsStore')) || '/src/stores/useSettingsStore.ts';
  const mod = await import(url);
  const st = mod.useSettingsStore;
  const before = st.getState().catalogSource;
  await st.getState().syncCatalog();
  const after = st.getState().catalogSource;
  return { before, after, models: st.getState().models.map((m) => m.name + '|' + m.type) };
})()`;

async function main() {
  // 看门狗：任何一步卡死都按 rc=2（无法验证）退出并报出卡点，绝不静默挂起、绝不假通过
  setTimeout(() => {
    console.error(`\n✗ 无法验证（rc=${RC_CANNOT}）：整体超时（>${T_TOTAL / 1000}s），卡在步骤「${STEP}」`);
    process.exit(RC_CANNOT);
  }, T_TOTAL);

  STEP = 'chrome-path';
  const chrome = chromePath();
  if (!chrome) cannot('未找到系统 Chrome');

  // 前置：BFF 必须在跑（本脚本不启动后端）
  STEP = 'bff-preflight';
  let bffCatalog;
  try {
    const res = await fetch(`${BFF}/api/v1/catalog`, {
      headers: { Accept: 'application/json', 'X-Workspace-Id': 'ws_dev', 'X-Actor-Id': 'user_dev' },
    });
    if (!res.ok) cannot(`BFF ${BFF}/api/v1/catalog 返回 HTTP ${res.status}`);
    bffCatalog = await res.json();
    log(`前置 OK：BFF ${BFF} 可达，/api/v1/catalog HTTP ${res.status}`);
  } catch (e) {
    return cannot(`BFF ${BFF} 不可达：${e.message}`);
  }

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let dev = null;
  let browser = null;
  let cdp = null;
  let network = [];
  let consoleErrors = [];
  try {
    STEP = 'dev-server-start';
    log(`启动 dev server :${port} …`);
    dev = await startDevServer(port);
    log(`dev server 就绪 ${base}${ROUTE}`);

    STEP = 'chrome-launch';
    browser = startChrome('about:blank');
    const dPort = await cdpPort(browser.profile, browser);
    const target = await pageTarget(dPort, port);
    cdp = await connectCDP(target.webSocketDebuggerUrl);
    log(`Chrome 已连上 CDP（目标 ${target.type} ${target.url}）`);

    STEP = 'page-load';
    cdp.on('Network.responseReceived', (p) => {
      const u = p?.response?.url ?? '';
      if (u.includes('/api/v1/')) network.push({ url: u.replace(base, ''), status: p.response.status, mime: p.response.mimeType });
    });
    cdp.on('Network.loadingFailed', (p) => {
      network.push({ failed: true, error: p.errorText, type: p.type });
    });
    cdp.on('Runtime.exceptionThrown', (p) => {
      consoleErrors.push(p?.exceptionDetails?.exception?.description?.split('\n')[0] ?? p?.exceptionDetails?.text ?? 'unknown');
    });
    cdp.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') consoleErrors.push(p.args?.map((a) => a.value ?? a.description).join(' ').slice(0, 200));
    });

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    // ① 身份 + 干净持久化快照（在任何应用脚本之前生效）
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOTSTRAP });

    // ② 打开真前端
    const loaded = new Promise((resolve) => cdp.on('Page.loadEventFired', resolve));
    await cdp.send('Page.navigate', { url: base + ROUTE });
    await Promise.race([loaded, sleep(45_000)]);
    log('页面 load 事件已到，等待 syncCatalog() 生效 …');

    // ③ 等 catalogSource 变成 server（应用自动调用 syncCatalog：AppShell + 该页 useEffect）
    STEP = 'wait-catalog-source';
    const deadline = Date.now() + T_CATALOG;
    let snap = null;
    for (;;) {
      try {
        snap = await evalJson(cdp, PROBE);
      } catch (e) {
        log('探针暂时失败：' + e.message);
      }
      const cur = snap?.catalogSource ?? snap?.persistedCatalogSource ?? null;
      if (cur === 'server') break;
      if (Date.now() > deadline) break;
      await sleep(500);
    }

    if (!snap || snap.storeImportOk !== true) {
      console.error('\n探针结果：' + JSON.stringify(snap, null, 2));
      return cannot(`读不到 useSettingsStore（storeImportOk=${snap?.storeImportOk}）：${snap?.storeImportError ?? '未知'}`);
    }

    STEP = 'explicit-syncCatalog';
    // ④ 显式在页面上下文再触发一次 syncCatalog()（判据 8 的「真实加载」口径双保险）
    let trigger = null;
    try {
      trigger = await evalJson(cdp, TRIGGER);
    } catch (e) {
      log('显式 syncCatalog() 触发失败（不影响自动路径结论）：' + e.message);
    }
    const final = await evalJson(cdp, PROBE);

    // ⑤ 断言不成立时，补齐诊断证据：被吞掉的原始异常 + 页面侧看到的响应形状
    let diag = null;
    let rawApi = null;
    let counterfactual = null;
    if (final.catalogSource !== 'server') {
      STEP = 'diagnose-raw-api';
      try { rawApi = await evalJson(cdp, RAW_API); } catch (e) { rawApi = { error: e.message }; }
      STEP = 'diagnose-counterfactual';
      try { counterfactual = await withTimeout(counterfactualFix(cdp), 60_000, '反事实实验'); } catch (e) { counterfactual = { error: e.message }; }
      STEP = 'diagnose-debugger';
      try { diag = await withTimeout(captureSwallowedError(cdp), 30_000, '异常诊断（Debugger）'); } catch (e) { diag = { error: e.message }; }
    }

    STEP = 'report';
    // ── 报告 ──────────────────────────────────────────────────────────
    const models = final.models ?? [];
    const bffIds = (bffCatalog?.models ?? []).map((m) => m.id).sort();
    const pageIds = models.map((m) => m.id).sort();
    const sameAsBff = bffIds.length > 0 && JSON.stringify(bffIds) === JSON.stringify(pageIds);
    const requested = network.filter((n) => n.url.includes('/api/v1/catalog') || n.url.includes('/workspace/channels'));

    console.log('\n================ 判据 8 真机勾对结果 ================');
    console.log(`初始 store 值（getInitialState） : ${final.initialCatalogSource}`);
    console.log(`应用实例持久化写出的轨迹        : ${JSON.stringify(final.trace)}`);
    console.log(`动态 import 的模块 URL          : ${final.storeModuleUrlUsed}`);
    console.log(`应用实际加载的模块 URL          : ${JSON.stringify(final.storeModuleUrls)}`);
    console.log(`身份（useAuthStore.getState）   : ${JSON.stringify(final.identity)}`);
    console.log(`DOM 徽章                        : ${JSON.stringify(final.domBadge)}`);
    console.log(`持久化快照 catalogSource        : ${final.persistedCatalogSource}`);
    console.log(`显式 syncCatalog()              : before=${trigger?.before} after=${trigger?.after}`);
    console.log(`★ catalogSource（最终实测值）   : ${final.catalogSource}`);
    console.log(`目录模型数                      : ${models.length}（BFF 直连同口径 ${bffIds.length} 条，id 集合一致=${sameAsBff}）`);
    for (const m of models) console.log(`   · ${m.type.padEnd(5)} ${m.id}  ${m.name}  ← ${m.channelId} (${m.status})`);
    console.log(`渠道数                          : ${(final.channels ?? []).length}`);
    console.log(`/api/v1/* 响应                  : ${JSON.stringify(requested)}`);
    if (consoleErrors.length) console.log(`页面 console error（前 5 条）    : ${JSON.stringify(consoleErrors.slice(0, 5))}`);
    if (rawApi) console.log(`页面侧 api.getCatalog() 形状     : ${JSON.stringify(rawApi)}`);
    if (counterfactual) console.log(`反事实（CDP 层只改响应体 params/responseParams → Array）: ${JSON.stringify(counterfactual)}`);
    if (diag) console.log(`Debugger 抓原始异常（辅助证据）  : ${JSON.stringify(diag)}`);
    console.log('====================================================');

    const checks = [
      [`catalogSource === 'server'`, final.catalogSource === 'server', `实测 ${final.catalogSource}`],
      ['目录非空（models.length > 0）', models.length > 0, `实测 ${models.length}`],
      ['应用实例也写出 server（persist 轨迹一致）', (final.trace ?? []).some((t) => t.catalogSource === 'server'), JSON.stringify((final.trace ?? []).map((t) => t.catalogSource))],
      ['DOM 渲染出「目录已连接」徽章', final.domBadge?.connected === true, JSON.stringify(final.domBadge)],
    ];
    for (const [name, ok, detail] of checks) console.log(`${ok ? '✓' : '✗'} ${name} —— ${detail}`);
    const failed = checks.filter(([, ok]) => !ok);
    if (failed.length === 0) {
      console.log(`\n✓ 判据 8 通过：catalogSource 实测 '${final.catalogSource}'（rc=${RC_PASS}）`);
      return RC_PASS;
    }
    console.error(`\n✗ 判据 8 未通过：${failed.map(([n]) => n).join('；')}（rc=${RC_FAIL}）`);
    return RC_FAIL;
  } finally {
    try { cdp?.close(); } catch { /* ignore */ }
    try { browser?.child.kill('SIGKILL'); } catch { /* ignore */ }
    try { dev?.child.kill('SIGTERM'); } catch { /* ignore */ }
  }
}

main()
  .then((rc) => process.exit(rc))
  .catch((e) => {
    console.error(`\n✗ 无法验证（rc=${RC_CANNOT}）：${e.message}`);
    process.exit(RC_CANNOT);
  });
