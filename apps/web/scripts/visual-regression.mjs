// 视觉回归工具（W2）—— 关键页面截图基线 diff
// 用途：L3 视觉回归。把关键页面当前渲染与基线比对，发现布局错位/溢出/结构变化。
// 用法：
//   node scripts/visual-regression.mjs --update    # 生成/刷新基线（首次或有意变更时）
//   node scripts/visual-regression.mjs             # 与基线 diff（默认），差异率>阈值=阻断
// 依赖：系统 Chrome（headless）、pixelmatch + pngjs（devDeps）
// 说明：基线在同一环境下生成才能可比；页面 API 失败显示的 error 态也属于布局，diff 仍有效。
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pixelmatchMod = require('pixelmatch');
const pixelmatch = pixelmatchMod.default ?? pixelmatchMod;
const { PNG } = require('pngjs');

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, '..');
const BASELINE_DIR = join(APP_ROOT, 'visual-baseline');
const DIFF_DIR = join(APP_ROOT, '.visual-diff'); // gitignore，不入库

// 关键页面清单（路由 → 语义名 [→ 窗口尺寸]）。只放有真实布局的核心页，保持基线稳定。
// 第三项可选：长页面（如组件库总览）需要更高的窗口，否则只截到首屏。
const PAGES = [
  ['/models/costs', 'model-costs'],
  ['/models/audit', 'model-audit'],
  ['/settings/channels', 'settings-channels'],
  ['/settings/models/catalog', 'settings-model-catalog'],
  ['/settings/models', 'settings-logical-models'],
  ['/comic/projects', 'comic-projects'],
  // 组件库总览（仅 DEV 注册）：设计系统清单的视觉留痕。页面很长，用高窗口一次截全。
  ['/dev/ui-kit', 'ui-kit', '1440,3400'],
];

const VIEWPORT = '1440,900';
const DIFF_THRESHOLD = 0.02; // 差异像素占比 >2% 判定回归（抗噪）
const PORT = 4173;

function chromePath() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error('未找到系统 Chrome（headless 截图需要）。macOS 装 Chrome 或 CI 用 ubuntu-latest 自带。');
}

function startPreview() {
  return new Promise((resolve, reject) => {
    // 用 dev server（直接服务源码 + SPA fallback）。注意：生产构建产物是妙搭
    // 托管结构（dist/output/），vite preview 服务 dist 根目录会 404，故不用 preview。
    const child = spawn('npm', ['run', 'dev', '--', '--port', String(PORT), '--strictPort'], {
      cwd: APP_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const deadline = Date.now() + 30000;
    const probe = async () => {
      try {
        const res = await fetch(`http://localhost:${PORT}/models/costs`);
        if (res.ok) resolve(child);
        else setTimeout(probe, 500);
      } catch {
        if (Date.now() > deadline) reject(new Error(`dev server 30s 未就绪：\n${out.slice(-500)}`));
        else setTimeout(probe, 500);
      }
    };
    probe();
  });
}

async function shoot(url, outPath, viewport = VIEWPORT) {
  const chrome = chromePath();
  // 显式指定 user-data-dir：默认目录在某些环境建不出来（实测 "Failed to create a unique
  // user data directory for headless"）。**不能放在仓库内**——Chrome 会往里写大量文件，
  // 触发 Vite 文件监听风暴并把 dev server 打死（实测截图到第二页即 ERR_CONNECTION_REFUSED）。
  const profile = join(tmpdir(), 'mdp-visual-chrome-profile');
  mkdirSync(profile, { recursive: true });
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-sandbox', // CI（ubuntu root 用户）必需；macOS 上无害
    '--no-first-run',
    '--disable-extensions',
    `--user-data-dir=${profile}`,
    '--force-device-scale-factor=1',
    `--window-size=${viewport}`,
    `--virtual-time-budget=4000`,
    `--screenshot=${outPath}`,
    url,
  ];
  await new Promise((resolve, reject) => {
    const p = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('exit', (code) => {
      if (code === 0 && existsSync(outPath)) resolve();
      else reject(new Error(`Chrome 截图失败 code=${code} ${url}：${err.slice(-300)}`));
    });
  });
}

function diffPng(aPath, bPath, diffPath) {
  const a = PNG.sync.read(readFileSync(aPath));
  const b = PNG.sync.read(readFileSync(bPath));
  const w = Math.max(a.width, b.width);
  const h = Math.max(a.height, b.height);
  const diff = new PNG({ width: w, height: h });
  const n = pixelmatch(a.data, b.data, diff.data, w, h, { threshold: 0.12, includeAA: true });
  writeFileSync(diffPath, PNG.sync.write(diff));
  const ratio = n / (w * h);
  return { n, ratio };
}

async function main() {
  const update = process.argv.includes('--update');
  console.log(update ? '[visual-regression] 刷新基线模式（--update）' : '[visual-regression] diff 模式');
  mkdirSync(BASELINE_DIR, { recursive: true });
  mkdirSync(DIFF_DIR, { recursive: true });

  const preview = await startPreview();
  console.log(`[visual-regression] preview server 就绪 :${PORT}`);
  const results = [];
  for (const [route, name, viewport] of PAGES) {
    const url = `http://localhost:${PORT}${route}`;
    const current = join(DIFF_DIR, `${name}.png`);
    await shoot(url, current, viewport);
    const baseline = join(BASELINE_DIR, `${name}.png`);

    if (update) {
      writeFileSync(baseline, readFileSync(current));
      results.push(`✓ ${name} 基线已更新（${route}）`);
      continue;
    }
    if (!existsSync(baseline)) {
      results.push(`✗ ${name} 无基线（先跑 node scripts/visual-regression.mjs --update）—— ${route}`);
      continue;
    }
    const diffPath = join(DIFF_DIR, `${name}.diff.png`);
    const { n, ratio } = diffPng(baseline, current, diffPath);
    const status = ratio > DIFF_THRESHOLD ? '✗ 回归' : '✓ 通过';
    results.push(`${status} ${name} 差异 ${(ratio * 100).toFixed(2)}%（${n}px）${ratio > DIFF_THRESHOLD ? `→ 见 ${diffPath}` : ''}`);
  }
  preview.kill('SIGTERM');
  console.log('\n' + results.join('\n'));
  const failed = results.some((r) => r.startsWith('✗'));
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
