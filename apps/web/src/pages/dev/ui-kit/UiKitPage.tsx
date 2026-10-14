import { useMemo, useState, type ReactNode } from 'react';
import { BookOpenIcon, SearchIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { UI_CATALOG, type UiComponent, type UiToken } from '@/generated/ui-catalog';

import { UI_DEMOS } from './demos';

// 组件库可视化总览页（dev-only，路由见 src/app.tsx 的 import.meta.env.DEV 分支）。
// 事实源：src/generated/ui-catalog.ts（由 scripts/ui-inventory.mjs 从代码抽取，禁止手改）。
// 本页只做「展示 + 导航 + 缺口标注」，不引入任何新依赖、不重复维护组件元数据。
const NOTES_FILE = '.agents/skills/frontend-coding/ui-components.notes.md';
const DEMOS_DIR = 'src/pages/dev/ui-kit/demos';

type CategoryGroup = { id: string; category: string; components: UiComponent[] };

function buildGroups(components: UiComponent[]): CategoryGroup[] {
  return UI_CATALOG.categories
    .map((category, index) => ({
      id: `cat-${index}`,
      category,
      components: components.filter((component) => component.category === category),
    }))
    .filter((group) => group.components.length > 0);
}

function matchesQuery(component: UiComponent, query: string) {
  if (!query) return true;
  return (
    component.name.toLowerCase().includes(query) ||
    component.category.toLowerCase().includes(query) ||
    component.exports.some((name) => name.toLowerCase().includes(query))
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card min-w-0 rounded-lg border p-4">
      <div className="text-muted-foreground text-xs font-medium">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="text-muted-foreground mt-1 text-xs">{hint}</div> : null}
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

function Chip({ children, mono = true }: { children: ReactNode; mono?: boolean }) {
  return (
    <code
      className={
        mono
          ? 'bg-muted text-muted-foreground min-w-0 truncate rounded-sm px-1.5 py-0.5 font-mono text-xs'
          : 'bg-muted text-muted-foreground min-w-0 truncate rounded-sm px-1.5 py-0.5 text-xs'
      }
    >
      {children}
    </code>
  );
}

// 非色彩 token 用对应的 CSS 属性做真实预览（字体族出字样、阴影/圆角出盒子），
// 否则色块会是空的——「色块为空属正常」对读者并不友好。
function TokenPreview({ token }: { token: UiToken }) {
  if (token.name.startsWith('--font-')) {
    return (
      <span className="min-w-0 flex-1 truncate text-base" style={{ fontFamily: `var(${token.name})` }}>
        Ag 漫剧 123
      </span>
    );
  }
  if (token.name.startsWith('--shadow')) {
    return <span className="bg-card border-border size-6 shrink-0 rounded-sm border" title={token.light} style={{ boxShadow: `var(${token.name})` }} />;
  }
  if (token.name.startsWith('--radius')) {
    return <span className="bg-muted size-6 shrink-0" title={token.light} style={{ borderRadius: `var(${token.name})` }} />;
  }
  return <TokenSwatch token={token} />;
}

function TokenSwatch({ token }: { token: UiToken }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <span
        title={`浅色：${token.light}`}
        className="border-border size-6 rounded-sm border"
        style={{ background: `var(${token.name})` }}
      />
      <span className="dark bg-background flex items-center rounded-sm p-1">
        <span
          title={`深色：${token.dark ?? '仅浅色定义'}`}
          className="border-border size-6 rounded-sm border"
          style={{ background: `var(${token.name})` }}
        />
      </span>
    </span>
  );
}

function TokenPalette() {
  const groups = useMemo(() => {
    const map = new Map<string, UiToken[]>();
    for (const token of UI_CATALOG.tokens) {
      const list = map.get(token.group);
      if (list) list.push(token);
      else map.set(token.group, [token]);
    }
    return [...map.entries()];
  }, []);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {groups.map(([group, tokens]) => (
        <div key={group} className="bg-card flex min-w-0 flex-col gap-2 rounded-lg border p-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{group}</h3>
            <Badge variant="outline">{tokens.length} 个 token</Badge>
          </div>
          <ul className="flex min-w-0 flex-col">
            {tokens.map((token) => (
              <li key={token.name} className="border-border flex min-w-0 flex-wrap items-center gap-3 border-b py-2 last:border-b-0">
                <code className="min-w-0 flex-1 truncate font-mono text-xs">{token.name}</code>
                <TokenPreview token={token} />
                <span
                  className="text-muted-foreground hidden min-w-0 flex-1 truncate font-mono text-xs lg:block"
                  title={token.dark ? `${token.light} → ${token.dark}` : token.light}
                >
                  {token.light}
                </span>
                <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-xs">
                  {token.utilities.length > 0 ? token.utilities.join(' / ') : '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function NotesBlock({ component }: { component: UiComponent }) {
  // 注记由人手写，可能出现重复条目（生成器不去重）；渲染前去重，避免 React 重复 key。
  const antiPatterns = [...new Set(component.notes.antiPatterns)];
  const related = [...new Set(component.notes.related)];
  const { when, avoid } = component.notes;
  const hasNotes = Boolean(when || avoid || antiPatterns.length > 0 || related.length > 0);
  if (!hasNotes) {
    return (
      <p className="text-muted-foreground text-xs">
        尚未补语义注记 —— 在 {NOTES_FILE} 的 ## {component.name} 段补「分类 / 何时用 / 别用 / 反例 / 相关」，
        再跑 npm run ui:generate。
      </p>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {when ? (
        <MetaRow label="何时用">
          <span className="text-xs">{when}</span>
        </MetaRow>
      ) : null}
      {avoid ? (
        <MetaRow label="别用">
          <span className="text-xs">{avoid}</span>
        </MetaRow>
      ) : null}
      {antiPatterns.length > 0 ? (
        <MetaRow label="反例">
          {antiPatterns.map((item) => (
            <Chip key={item} mono={false}>
              {item}
            </Chip>
          ))}
        </MetaRow>
      ) : null}
      {related.length > 0 ? (
        <MetaRow label="相关">
          {related.map((item) => (
            <Chip key={item}>{item}</Chip>
          ))}
        </MetaRow>
      ) : null}
    </div>
  );
}

function DemoBlock({ component }: { component: UiComponent }) {
  const demo = UI_DEMOS[component.name];
  if (!demo) {
    return (
      <div className="border-destructive/40 bg-destructive/5 flex min-w-0 flex-col gap-1 rounded-md border border-dashed p-4">
        <span className="text-destructive text-sm font-medium">待补 demo</span>
        <span className="text-muted-foreground text-xs">
          在 {DEMOS_DIR}/&lt;分类&gt;.tsx 里加一条 “{component.name}”: (&lt;… /&gt;)，
          再跑 npm run ui:generate —— 缺 demo 会让 npm run ui:check 变红。
        </span>
      </div>
    );
  }
  return <div className="bg-muted/40 min-w-0 rounded-md border p-4">{demo}</div>;
}

function ComponentCard({ component }: { component: UiComponent }) {
  return (
    <Card id={component.name} className="min-w-0 scroll-mt-24">
      <CardHeader>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <CardTitle className="font-mono text-lg">{component.name}</CardTitle>
          {component.dead ? (
            <Badge variant="destructive">零引用</Badge>
          ) : (
            <Badge variant="secondary" title={component.usage.files.join('\n')}>
              引用 {component.usage.count}
            </Badge>
          )}
          <Badge variant="outline">{component.category}</Badge>
          {component.asChild ? <Badge variant="outline">asChild</Badge> : null}
          {component.primitives.map((primitive) => (
            <Badge key={primitive} variant="outline">
              {primitive}
            </Badge>
          ))}
        </div>
        <CardDescription className="font-mono text-xs">
          {component.file} · {component.lines} 行
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-3">
          <MetaRow label={`导出（${component.exports.length}）`}>
            {component.exports.map((name) => (
              <Chip key={name}>{name}</Chip>
            ))}
          </MetaRow>
          <MetaRow label="变体 / 尺寸">
            {component.variants.length === 0 ? (
              <span className="text-muted-foreground text-xs">无 cva 变体</span>
            ) : (
              component.variants.map((variant) => (
                <span
                  key={`${variant.name}-${variant.values.join('-')}`}
                  className="flex min-w-0 flex-wrap items-center gap-1"
                >
                  <Chip>{variant.name}</Chip>
                  {variant.values.map((value) => (
                    <Badge
                      key={value}
                      variant={value === variant.defaultValue ? 'default' : 'outline'}
                    >
                      {value}
                      {value === variant.defaultValue ? '（默认）' : ''}
                    </Badge>
                  ))}
                </span>
              ))
            )}
          </MetaRow>
          <MetaRow label="Props">
            {component.props.length === 0 ? <span className="text-muted-foreground text-xs">—</span> : component.props.map((prop) => <Chip key={prop}>{prop}</Chip>)}
          </MetaRow>
          <MetaRow label="data-slot">
            {component.slots.length === 0 ? <span className="text-muted-foreground text-xs">—</span> : component.slots.map((slot) => <Chip key={slot}>{slot}</Chip>)}
          </MetaRow>
          <MetaRow label="使用 token">
            {component.tokens.length === 0 ? <span className="text-muted-foreground text-xs">—</span> : component.tokens.map((token) => <Chip key={token}>{token}</Chip>)}
          </MetaRow>
        </div>
        <Separator />
        <NotesBlock component={component} />
        <DemoBlock component={component} />
      </CardContent>
    </Card>
  );
}

export default function UiKitPage() {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();

  const navGroups = useMemo(() => buildGroups(UI_CATALOG.components), []);
  const groups = useMemo(
    () => buildGroups(UI_CATALOG.components.filter((c) => matchesQuery(c, normalizedQuery))),
    [normalizedQuery],
  );

  const { stats } = UI_CATALOG;
  const tokenList = UI_CATALOG.tokens;
  const demoCovered = UI_CATALOG.components.filter((c) => Boolean(UI_DEMOS[c.name])).length;
  const notesPercent = stats.components > 0 ? Math.round((stats.withNotes / stats.components) * 100) : 0;
  const maxLines = UI_CATALOG.components.reduce((max, c) => Math.max(max, c.lines), 0);

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col pb-16">
      <nav className="bg-background/95 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-wrap items-center gap-2 px-6 py-3">
          <span className="text-muted-foreground text-xs font-medium">分类导航</span>
          <a href="#tokens" className="bg-muted hover:bg-accent rounded-md px-2 py-1 text-xs font-medium">
            设计 token（{tokenList.length}）
          </a>
          <a href="#utilities" className="bg-muted hover:bg-accent rounded-md px-2 py-1 text-xs font-medium">
            工具类映射（{UI_CATALOG.themeUtilityCount}）
          </a>
          {navGroups.map((group) => (
            <a
              key={group.id}
              href={`#${group.id}`}
              className="bg-muted hover:bg-accent rounded-md px-2 py-1 text-xs font-medium"
            >
              {group.category}（{group.components.length}）
            </a>
          ))}
          <a href="#components" className="text-muted-foreground ml-auto flex items-center gap-1 text-xs font-medium">
            <BookOpenIcon className="size-3.5" /> 全部组件
          </a>
        </div>
      </nav>

      <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-8 px-6 py-8">
        <header className="flex min-w-0 flex-col gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">组件库总览 · UI Kit</h1>
            <Badge variant="secondary">仅开发环境</Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            全部结构事实（组件、variants、引用、token、分类）由{' '}
            <code className="font-mono text-xs">scripts/ui-inventory.mjs</code> 从代码抽取到{' '}
            <code className="font-mono text-xs">src/generated/ui-catalog.ts</code>；语义注记在{' '}
            <code className="font-mono text-xs">{NOTES_FILE}</code>。新增组件后跑{' '}
            <code className="font-mono text-xs">npm run ui:generate</code>，漏补注记或 demo 会被{' '}
            <code className="font-mono text-xs">npm run ui:check</code> 拦下。
          </p>
          <div className="grid min-w-0 grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="组件" value={String(stats.components)} hint={`${navGroups.length} 个分类`} />
            <StatCard label="组件代码行数" value={String(stats.lines)} hint={`最大单文件 ${maxLines} 行`} />
            <StatCard label="设计 token" value={String(stats.tokens)} hint={`${UI_CATALOG.themeUtilityCount} 条 Tailwind 映射`} />
            <StatCard label="零引用组件" value={String(stats.dead)} hint="死组件棘轮基线" />
            <StatCard label="语义注记覆盖" value={`${stats.withNotes}/${stats.components}`} hint={`${notesPercent}% · 缺 ${stats.components - stats.withNotes} 个`} />
            <StatCard
              label="demo 覆盖"
              value={`${demoCovered}/${stats.components}`}
              hint={demoCovered === stats.components ? '已覆盖全部组件' : `缺 ${stats.components - demoCovered} 个`}
            />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                aria-label="按组件名或导出名过滤"
                placeholder="按组件名 / 导出名过滤，例如 button、AlertDialog…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 pl-8"
              />
            </div>
            <span className="text-muted-foreground text-xs">
              {groups.reduce((sum, group) => sum + group.components.length, 0)} 个组件匹配
            </span>
          </div>
        </header>

        <section id="tokens" className="flex min-w-0 scroll-mt-24 flex-col gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold">设计 token 色板</h2>
            <Badge variant="outline">{tokenList.length} 个</Badge>
            <span className="text-muted-foreground text-xs">
              左：浅色（当前主题）· 右：深色（.dark 作用域）· 非色彩 token 的色块为空属正常
            </span>
          </div>
          <TokenPalette />
        </section>

        <section id="utilities" className="flex min-w-0 scroll-mt-24 flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-xl font-semibold tracking-tight">Tailwind 工具类映射与排版</h2>
            <p className="text-muted-foreground text-sm">
              权威表来自 <code className="font-mono text-xs">@theme inline</code> 与{' '}
              <code className="font-mono text-xs">typography.css</code>（插件{' '}
              <code className="font-mono text-xs">{UI_CATALOG.typography.plugin ?? '—'}</code>）：写 UI 用工具类，不要硬编码数值（V-002）。
            </p>
          </div>
          <div className="bg-card min-w-0 overflow-x-auto rounded-lg border">
            <table className="w-full min-w-0 text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-xs">
                <tr>
                  <th className="px-3 py-2 text-left">@theme token</th>
                  <th className="px-3 py-2 text-left">值</th>
                  <th className="px-3 py-2 text-left">分类</th>
                  <th className="px-3 py-2 text-left">对应工具类</th>
                </tr>
              </thead>
              <tbody>
                {UI_CATALOG.themeUtilities.map((u) => (
                  <tr key={u.name} className="border-border border-t">
                    <td className="px-3 py-1.5 font-mono text-xs">{u.name}</td>
                    <td className="text-muted-foreground truncate px-3 py-1.5 font-mono text-xs" title={u.value}>{u.value}</td>
                    <td className="px-3 py-1.5 text-xs">{u.group}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">
                      {u.name.startsWith('--color-')
                        ? `bg-${u.name.slice(8)} / text-${u.name.slice(8)} / border-${u.name.slice(8)}`
                        : u.name.startsWith('--radius-')
                          ? `rounded-${u.name.slice(9)}`
                          : u.name.startsWith('--shadow-')
                            ? `shadow-${u.name.slice(9)}`
                            : u.name.startsWith('--font-')
                              ? `font-${u.name.slice(7)}`
                              : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-card flex min-w-0 flex-col gap-2 rounded-lg border p-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">排版</h3>
              <Badge variant="outline">prose 映射 {UI_CATALOG.typography.prose.length} 条</Badge>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              {['--font-sans', '--font-mono', '--font-serif'].map((name) => (
                <div key={name} className="flex min-w-0 flex-wrap items-baseline gap-3">
                  <code className="text-muted-foreground w-28 shrink-0 font-mono text-xs">{name}</code>
                  <span className="min-w-0 truncate" style={{ fontFamily: `var(${name})` }}>Ag 漫剧导演工坊 12345</span>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              标题字号必须用尺度 token（禁 <code className="font-mono">text-[Npx]</code>，V-003）；长文正文用 <code className="font-mono">prose</code>。
            </p>
          </div>
        </section>

        <section id="components" className="flex min-w-0 scroll-mt-24 flex-col gap-8">
          {groups.length === 0 ? (
            <p className="text-muted-foreground text-sm">没有匹配「{query}」的组件。</p>
          ) : (
            groups.map((group) => (
              <div
                key={group.id}
                id={group.id}
                className="flex min-w-0 scroll-mt-24 flex-col gap-4"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold">{group.category}</h2>
                  <Badge variant="outline">{group.components.length} 个组件</Badge>
                </div>
                <Separator />
                <div className="flex min-w-0 flex-col gap-4">
                  {group.components.map((component) => (
                    <ComponentCard key={component.name} component={component} />
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
