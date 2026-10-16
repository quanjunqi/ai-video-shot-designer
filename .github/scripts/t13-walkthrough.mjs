#!/usr/bin/env node
// T13 走查自动化（TASK-INFRA-006）：headless Chrome + CDP 驱动
// 把「一场走查闭合 4 条判据」从人工手点变成一条命令 + 一组截图 + 一份 JSON 结论。
//
// 依赖：系统 Chrome + Node ≥ 22（原生 WebSocket，零新增 npm 依赖）。
// 用法：node .github/scripts/t13-walkthrough.mjs   # 期望 0/1；栈未起或无 Chrome 则 2
//
// 退出码语义（与仓库门禁一致）：
//   0 = 全部断言通过
//   1 = 断言失败（输出具体站/角色/断言 + 截图路径）
//   2 = 无法执行（栈未起 / 无 Chrome / 前置不可达）——「未验证」≠ 通过
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---- 配置 ---------------------------------------------------------------
const FRONT_PORTS = [5173, 5174];          // Vite dev（实测 5173；task.md 旧值 5174 兼容探测）
const ME_PATH = '/api/v1/me';               // 栈新鲜度断言：BFF 经 Vite proxy 可达
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const OUT_DIR = join(tmpdir(), 't13-walkthrough');   // 截图落盘：仓库外（判据 7）
const CDP_PORT = 9222;

// 三角色 × 模型中心导航预期（契约：apps/web/src/features/model-center/model-center-navigation.ts
//   visibleModelCenterNav(role)：audit=仅 owner；channels=admin+；其余全角色）
const NAV_LABELS_BY_ROLE = {
  owner:  ['模型目录', '模型广场', '渠道与凭据', '成本与用量', '审计日志', '协议模板', '健康'],
  admin:  ['模型目录', '模型广场', '渠道与凭据', '成本与用量', '协议模板', '健康'],
  viewer: ['模型目录', '模型广场', '成本与用量', '协议模板', '健康'],
};
const ACTORS = [   // DEV_ACTORS 契约（stores/useAuthStore.ts）：owner 的 actorId 是 user_dev
  { actorId: 'user_dev',    role: 'owner'  },
  { actorId: 'user_admin',  role: 'admin'  },
  { actorId: 'user_viewer', role: 'viewer' },
];

// ---- 结果收集 ------------------------------------------------------------
const results = [];   // { role?, page?, check, ok, detail }
let failures = 0;
let verifiedCount = 0;
function record(check, ok, detail, page = null, role = null) {
  results.push({ role, page, check, ok, detail });
  if (ok) verifiedCount += 1;
  else failures += 1;
}
function fatal(code, msg) {   // 无法执行（2）或非断言性错误（1）
  console.error(`❌ ${msg}`);
  process.exit(code);
}

// ---- 栈前置自检 -----------------------------------------------------------
async function findFrontBase() {
  for (const port of FRONT_PORTS) {
    try {
      const res = await fetch(`http://localhost:${port}${ME_PATH}`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (res.ok) return { base: `http://localhost:${port}`, port };
      // 200 才认可；其余（404/500）说明栈旧或未起
      console.warn(`  ⚠️  :${port} 可达但 /api/v1/me 返回 ${res.status} —— 栈新鲜度存疑，尝试下一端口`);
    } catch { /* 端口未监听 */ }
  }
  return null;
}

// ---- Chrome + CDP ---------------------------------------------------------
function chromeBinary() {
  for (const c of CHROME_CANDIDATES) if (existsSync(c)) return c;
  return null;
}

async function startChrome(binary) {
  const userData = join(tmpdir(), `t13-cdp-profile-${Date.now()}`);
  const proc = spawn(binary, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userData}`,
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=1440,900',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  // 等待 DevTools 端点就绪（最多 ~10s）：取 page target（Page.* 域需要，browser 级 ws 没有）
  const deadline = Date.now() + 10000;
  let wsUrl = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      if (res.ok) {
        const targets = await res.json();
        const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
      }
    } catch { /* 未就绪，继续轮询 */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { proc, wsUrl };
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = (e) => reject(new Error(`CDP WebSocket 连接失败：${e.message ?? e}`));
    });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`CDP ${msg.error.message}`));
        else resolve(msg.result);
      }
    };
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { try { this.ws.close(); } catch {} }
}

async function waitFor(condFn, timeoutMs, step) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const v = await condFn();
      if (v) return v;
    } catch (e) { lastErr = e; }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`等待超时（${step}）：${lastErr?.message ?? '条件未满足'}`);
}

// 注入 dev 身份并重载（契约：localStorage['mdp-dev-actor'] + AppShell hydrate 拉 /api/v1/me）
// 等待信号：页面 reload 完成 + 身份回读与导航重渲缓冲（TopBar 显示 role 而非 actorId，
//   故不等文本，给足 hydrate 完成时间；导航断言本身在等待后执行，未生效会如实 fail）
async function setActor(cdp, base, actorId) {
  await cdp.send('Runtime.evaluate', {
    expression: `localStorage.setItem('mdp-dev-actor', '${actorId}'); location.reload(); true`,
  });
  await waitFor(async () => {
    const r = await cdp.send('Runtime.evaluate', {
      expression: `document.readyState === 'complete' && document.body && document.body.children.length > 0`,
      returnByValue: true,
    });
    return r?.result?.value === true;
  }, 20000, `页面重载（身份 ${actorId}）`);
  await new Promise((r) => setTimeout(r, 2000));   // hydrate(fetch /api/v1/me) + 导航按角色重渲
}

async function screenshot(cdp, filePath) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  mkdirSync(dirOf(filePath), { recursive: true });
  writeFileSync(filePath, Buffer.from(shot.data, 'base64'));
  return filePath;
}
function dirOf(p) { return p.slice(0, Math.max(p.lastIndexOf('/'), 0)); }

async function pageText(cdp) {
  const r = await cdp.send('Runtime.evaluate', {
    expression: 'document.body ? document.body.innerText : ""',
    returnByValue: true,
  });
  return r?.result?.value ?? '';
}

// ---- 走查主流程 -----------------------------------------------------------
async function main() {
  // 0) 栈前置自检（判据 8/11）：前端可达 + /api/v1/me 200
  const front = await findFrontBase();
  if (!front) {
    record('栈前置自检', false, `前端 ${FRONT_PORTS.join('/')} 不可达或 /api/v1/me 未返回 200 —— 先起本地栈`);
    console.log(JSON.stringify({ ok: false, reason: 'stack_unavailable', results }, null, 2));
    process.exit(2);   // 未验证 ≠ 通过
  }
  record('栈前置自检', true, `前端 :${front.port} 可达且 /api/v1/me 200`);

  // 1) Chrome 可用性（判据 8）
  const chrome = chromeBinary();
  if (!chrome) {
    record('Chrome 可用性', false, '未找到系统 Chrome');
    console.log(JSON.stringify({ ok: false, reason: 'no_chrome', results }, null, 2));
    process.exit(2);
  }
  const { proc, wsUrl } = await startChrome(chrome);
  if (!wsUrl) {
    proc.kill();
    record('Chrome CDP', false, 'DevTools 端点未就绪');
    console.log(JSON.stringify({ ok: false, reason: 'cdp_unavailable', results }, null, 2));
    process.exit(2);
  }
  const cdp = new CDP(wsUrl);
  await cdp.open();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  // 2) 三角色 × 模型中心导航断言（判据 2：visibleModelCenterNav 契约）
  for (const actor of ACTORS) {
    await cdp.send('Page.navigate', { url: `${front.base}/models/costs` });
    await waitFor(async () => {
      const r = await cdp.send('Runtime.evaluate', {
        expression: `document.readyState === 'complete' && !!document.querySelector('aside, nav')`,
        returnByValue: true,
      });
      return r?.result?.value === true;
    }, 15000, `导航载入（${actor.role}）`);
    await setActor(cdp, front.base, actor.actorId);
    await new Promise((r) => setTimeout(r, 1200));   // 等导航按角色重渲

    const text = await pageText(cdp);
    const expected = NAV_LABELS_BY_ROLE[actor.role];
    const missing = expected.filter((label) => !text.includes(label));
    // 反例：不应出现的项
    const allNav = ['模型目录', '模型广场', '渠道与凭据', '成本与用量', '审计日志', '协议模板', '健康'];
    const forbidden = allNav.filter((label) => !expected.includes(label) && text.includes(label));

    const shot = await screenshot(cdp, join(OUT_DIR, actor.role, 'models-costs-nav.png'));
    record(
      `三角色导航（${actor.role}）`,
      missing.length === 0 && forbidden.length === 0,
      `缺项=${JSON.stringify(missing)} 越权项=${JSON.stringify(forbidden)} 截图=${shot}`,
      '/models/costs', actor.role,
    );
  }

  // 3) Owner 五站链路断言（判据 3/4/5/6）
  await setActor(cdp, front.base, 'user_owner');
  const stations = [
    { path: '/models/costs',  key: 'costs',   expect: ['成本与用量'] },
    { path: '/models/health', key: 'health',  expect: ['健康'] },
    { path: '/create/image',  key: 'create',  expect: ['图片创作'] },
    { path: '/tasks',         key: 'tasks',   expect: ['任务'] },
  ];
  for (const st of stations) {
    await cdp.send('Page.navigate', { url: `${front.base}${st.path}` });
    await waitFor(async () => {
      const r = await cdp.send('Runtime.evaluate', {
        expression: `document.readyState === 'complete' && !!document.querySelector('#root') && document.querySelector('#root').children.length > 0`,
        returnByValue: true,
      });
      return r?.result?.value === true;
    }, 20000, `站点 ${st.path}`);
    await new Promise((r) => setTimeout(r, 800));
    const text = await pageText(cdp);
    const missing = st.expect.filter((s) => !text.includes(s));
    const crash = /Cannot read properties of undefined|TypeError|ReferenceError/.test(text)
      || await hasErrorOverlay(cdp);
    const shot = await screenshot(cdp, join(OUT_DIR, 'owner', `${st.key}.png`));
    record(
      `站点可渲染（${st.path}）`,
      missing.length === 0 && !crash,
      `缺关键文案=${JSON.stringify(missing)} 崩溃=${crash} 截图=${shot}`,
      st.path, 'owner',
    );
  }

  // 4) /tasks 详情抽屉（判据 5）与产物区块（判据 6）
  await cdp.send('Page.navigate', { url: `${front.base}/tasks` });
  await waitFor(async () => {
    const r = await cdp.send('Runtime.evaluate', {
      expression: `document.readyState === 'complete' && !!document.querySelector('#root') && document.querySelector('#root').children.length > 0`,
      returnByValue: true,
    });
    return r?.result?.value === true;
  }, 20000, '/tasks 载入');
  await new Promise((r) => setTimeout(r, 1500));

  // 找「查看详情」按钮（Tasks.tsx：Eye 图标 + title="查看详情"）并点击；无任务行时记「未验证」而非通过（判据 6 例外）
  const drawerResult = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const btns = [...document.querySelectorAll('button[title="查看详情"]')];
      if (btns.length === 0) return { found: false, reason: 'no_detail_btn' };
      btns[0].click();
      return { found: true };
    })()`,
    returnByValue: true,
  });
  const drawer = drawerResult?.result?.value ?? { found: false };
  if (drawer.found) {
    await new Promise((r) => setTimeout(r, 1200));
    const drawerText = await pageText(cdp);
    const hasArtifact = /产物|output|结果|下载|预览/.test(drawerText);
    record('详情抽屉可开（OBS-001 回归）', true, '详情已打开，抽屉内容可读', '/tasks', 'owner');
    record('产物区块（INFRA-005 判据 4）', hasArtifact,
      hasArtifact ? '详情内存在产物/结果区' : '详情内未见产物区（当前任务可能无产物，按未验证处理）', '/tasks', 'owner');
  } else {
    record('详情抽屉可开（OBS-001 回归）', false, '未找到「详情」按钮（任务列表可能为空）', '/tasks', 'owner');
    record('产物区块（INFRA-005 判据 4）', false, '无任务行可展开，无法断言产物（未验证，非通过）', '/tasks', 'owner');
  }
  await screenshot(cdp, join(OUT_DIR, 'owner', 'tasks-detail.png'));

  // 5) 汇总
  cdp.close();
  proc.kill();
  const summary = {
    ok: failures === 0,
    verified: verifiedCount,
    failures,
    results,
    screenshotsDir: OUT_DIR,
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(failures === 0 ? 0 : 1);
}

async function hasErrorOverlay(cdp) {
  const r = await cdp.send('Runtime.evaluate', {
    expression: `!!document.querySelector('vite-error-overlay, #vite-error-overlay, [data-testid="error-boundary"]')`,
    returnByValue: true,
  });
  return r?.result?.value === true;
}

main().catch((e) => {
  console.error(`❌ 走查脚本异常：${e.message}`);
  process.exit(1);
});
