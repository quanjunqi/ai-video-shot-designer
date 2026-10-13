// EXPORTS: default ModelCostsPage
// 成本与用量（高保真稿 GATE-2 成本页，T2-2）：4 KPI + ECharts 成本/调用趋势 +
// 四维排行 + 粒度/归因筛选 + 预算只读占位（T3 前）。数据源 = T2-1 聚合 API（经 BFF 透传）。
import { useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { RefreshCw } from 'lucide-react';
import { api, type AuditStat, type AuditTrendPoint } from '@/lib/api/client';
import { cn } from '@/lib/utils';

type Granularity = 'day' | 'week' | 'month';
type Dimension = 'channel' | 'model' | 'project' | 'member';

const GRANULARITIES: { key: Granularity; label: string }[] = [
  { key: 'day', label: '日' },
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
];

const DIMENSIONS: { key: Dimension; label: string }[] = [
  { key: 'channel', label: '渠道' },
  { key: 'model', label: '模型' },
  { key: 'project', label: '项目' },
  { key: 'member', label: '成员' },
];

const WINDOW_DAYS = 30;
const SERIES_TEAL = '#14b8a6';

function fmtMoney(n: number) {
  if (!n) return '¥0';
  if (n < 1) return `¥${n.toFixed(4)}`;
  return `¥${n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

function fmtNum(n: number) {
  return n.toLocaleString('zh-CN');
}

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}

function fmtLatency(ms: number) {
  if (!ms) return '—';
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function lastNDays(n: number) {
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - n);
  const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return { since: iso(since), until: iso(until) };
}

export default function ModelCostsPage() {
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [dimension, setDimension] = useState<Dimension>('channel');
  const [featureDraft, setFeatureDraft] = useState('');
  const [feature, setFeature] = useState('');
  const [trend, setTrend] = useState<AuditTrendPoint[]>([]);
  const [stats, setStats] = useState<AuditStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const { since, until } = lastNDays(WINDOW_DAYS);
    Promise.all([
      api.listAuditTrend({ granularity, dimension, since, until, feature: feature || undefined }),
      api.listAuditStats({ dimension, since, until, feature: feature || undefined, limit: 8 }),
    ])
      .then(([t, s]) => {
        if (cancelled) return;
        setTrend(t.items ?? []);
        setStats(s.items ?? []);
        setError('');
      })
      .catch(() => {
        if (!cancelled) setError('数据加载失败：请确认 execution 服务可用');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [granularity, dimension, feature]);

  const last = trend[trend.length - 1];
  const totalCalls = trend.reduce((acc, p) => acc + (p.calls ?? 0), 0);
  const totalSuccess = trend.reduce((acc, p) => acc + (p.success_calls ?? 0), 0);

  const option = useMemo(() => {
    const labels = trend.map((p) => p.bucket.slice(5));
    const cost = trend.map((p) => Number(p.cost_calibrated ?? 0));
    const calls = trend.map((p) => p.calls ?? 0);
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' as const },
      legend: { data: ['成本（已校准）', '调用量'], top: 0, textStyle: { fontSize: 11 } },
      grid: { left: 8, right: 12, top: 30, bottom: 0, containLabel: true },
      xAxis: { type: 'category' as const, data: labels, axisLabel: { fontSize: 10 } },
      yAxis: [
        { type: 'value' as const, name: '成本(¥)', axisLabel: { fontSize: 10 } },
        { type: 'value' as const, name: '调用', axisLabel: { fontSize: 10 } },
      ],
      series: [
        {
          name: '成本（已校准）',
          type: 'line' as const,
          data: cost,
          smooth: true,
          symbolSize: 4,
          lineStyle: { color: SERIES_TEAL, width: 2 },
          itemStyle: { color: SERIES_TEAL },
          areaStyle: {
            color: {
              type: 'linear' as const,
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(20,184,166,0.25)' },
                { offset: 1, color: 'rgba(20,184,166,0)' },
              ],
            },
          },
        },
        {
          name: '调用量',
          type: 'bar' as const,
          yAxisIndex: 1,
          data: calls,
          barWidth: '40%',
          itemStyle: { color: 'rgba(245,158,11,0.55)' },
        },
      ],
    };
  }, [trend]);

  return (
    <div className="space-y-5">
      {/* KPI 行（高保真稿：4 列，窄屏 2 列） */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="今日成本（已校准）" value={fmtMoney(last?.cost_calibrated ?? 0)} hint="近30日趋势末点" />
        <KpiCard label="近30日调用量" value={fmtNum(totalCalls)} hint={`成功率 ${totalCalls ? fmtPct((totalSuccess / totalCalls) * 100) : '—'}`} />
        <KpiCard label="P95 延迟" value={fmtLatency(last?.p95_latency_ms ?? 0)} hint="仅成功调用计" />
        <KpiCard label="预估口径调用" value={fmtNum(last?.cost_estimated_calls ?? 0)} hint="价格未校准的行数" />
      </div>

      {/* 筛选行：粒度 chips + 维度 chips + 归因 feature */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          {GRANULARITIES.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setGranularity(g.key)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                granularity === g.key ? 'border-primary/40 bg-primary/10 font-medium text-primary' : 'border-border text-muted-foreground hover:bg-accent/60',
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-1">
          {DIMENSIONS.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => setDimension(d.key)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                dimension === d.key ? 'border-primary/40 bg-primary/10 font-medium text-primary' : 'border-border text-muted-foreground hover:bg-accent/60',
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            setFeature(featureDraft.trim());
          }}
        >
          <input
            value={featureDraft}
            onChange={(e) => setFeatureDraft(e.target.value)}
            placeholder="按功能归因筛选（如 text2img）"
            className="h-7 w-44 rounded-lg border border-border bg-background px-2.5 text-xs outline-none placeholder:text-muted-foreground/70 focus:border-primary/50"
          />
          <button type="submit" className="h-7 rounded-lg border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground">
            应用
          </button>
        </form>
        <button
          type="button"
          onClick={() => setLoading(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          aria-label="刷新数据"
          title="刷新数据"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          刷新
        </button>
      </div>

      {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        {/* 趋势图（高保真稿 .chart：圆角边框 + 白底） */}
        <section className="rounded-xl border border-card-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-foreground">成本与调用趋势（近 {WINDOW_DAYS} 天）</h2>
            {loading && <span className="text-xs text-muted-foreground">加载中…</span>}
          </div>
          {trend.length ? (
            <ReactECharts option={option} style={{ height: 280 }} notMerge />
          ) : (
            <div className="flex h-[280px] items-center justify-center text-xs text-muted-foreground">
              {loading ? '加载中…' : '暂无数据'}
            </div>
          )}
        </section>

        {/* 当前维度排行（高保真稿 .panel-box + .bar-row） */}
        <section className="rounded-xl border border-card-border bg-card p-4">
          <h2 className="mb-3 text-sm font-medium text-foreground">{DIMENSIONS.find((d) => d.key === dimension)?.label}排行（成本降序）</h2>
          {stats.length ? (
            <ul className="space-y-2.5">
              {stats.map((s) => (
                <li key={s.key} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate text-muted-foreground" title={s.key}>
                      {s.key || '（未归因）'}
                    </span>
                    <span className="shrink-0 font-medium text-foreground">{fmtMoney(s.cost_calibrated)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{fmtNum(s.calls)} 次</span>
                    <span>P95 {fmtLatency(s.p95_latency_ms)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">暂无数据</p>
          )}
        </section>
      </div>

      {/* 预算只读占位（T3 预算拦截实现前的显式占位；超管可见，普通成员不可见待 T10 权限矩阵） */}
      <section className="rounded-xl border border-dashed border-border bg-accent/30 px-4 py-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">月度预算</span>
          <span className="text-muted-foreground">未配置 · T3 开放</span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">预算拦截只基于已校准价格，配置功能随 T3 上线。</p>
      </section>

      <p className="border-t border-dashed border-border pt-2 text-[11px] text-muted-foreground">
        成本双口径：已校准（权威价格回写）与预估（价格未校准的调用计数）。预算拦截只基于已校准价格。
      </p>
    </div>
  );
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-3.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
