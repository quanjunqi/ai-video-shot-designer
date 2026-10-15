// EXPORTS: default ModelHealthPage
// 渠道健康面板（T11 高保真稿 v1 评审通过）：KPI 概览 + 供给单元健康卡片网格
// （成功率/调用量/错误码分布迷你条/熔断徽标）+ 时间筛选 + 告警配置折叠区。
// 数据源 = T11 聚合 API（execution /internal/v1/audit/health 经 BFF 透传）。
import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import { api, type AlertConfig, type UnitHealth } from '@/lib/api/client';
import { cn } from '@/lib/utils';

const WINDOW_DAYS = 30;
const DEFAULT_ALERT: AlertConfig = {
  workspace_id: '',
  enabled: true,
  error_rate_threshold_pct: 20,
  error_rate_window_min: 5,
  cooldown_min: 10,
  webhook_url: '',
};

const ERROR_BUCKETS = [
  { key: 'hard_4xx', label: '硬4xx', color: '#ef4444' },
  { key: 'soft_4xx', label: '软4xx', color: '#f59e0b' },
  { key: 'server_5xx', label: '5xx', color: '#f97316' },
  { key: 'network', label: '网络', color: '#3b82f6' },
  { key: 'content_safety', label: '内容安全', color: '#a855f7' },
  { key: 'other', label: '其他', color: '#64748b' },
] as const;

function lastNDays(n: number) {
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - n);
  const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return { since: iso(since), until: iso(until) };
}

function fmtNum(n: number) {
  return n.toLocaleString('zh-CN');
}

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}

function fmtWhen(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function ModelHealthPage() {
  const [units, setUnits] = useState<UnitHealth[]>([]);
  const [alertCfg, setAlertCfg] = useState<AlertConfig>(DEFAULT_ALERT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertSaved, setAlertSaved] = useState(false);
  const [alertOpen, setAlertOpen] = useState(true);

  // 加载（首次 effect 与手动刷新共用；setLoading 只在事件回调里置 true，effect 内不同步 setState）
  const fetchData = () => {
    const { since, until } = lastNDays(WINDOW_DAYS);
    Promise.all([api.listUnitHealth({ since, until }), api.getAlertConfig()])
      .then(([h, cfg]) => {
        setUnits(h.units ?? []);
        setAlertCfg(cfg ?? DEFAULT_ALERT);
        setError('');
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : '健康数据加载失败');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const refresh = () => {
    setLoading(true);
    setError('');
    fetchData();
  };

  const totals = useMemo(() => {
    let calls = 0;
    let success = 0;
    let cooling = 0;
    for (const u of units) {
      calls += u.calls;
      success += u.success_calls;
      if (u.cooling) cooling += 1;
    }
    return { calls, success, cooling };
  }, [units]);

  const saveAlert = async (patch: Partial<AlertConfig>) => {
    setAlertSaving(true);
    setAlertSaved(false);
    try {
      const next = { ...alertCfg, ...patch };
      const saved = await api.saveAlertConfig(next);
      setAlertCfg(saved);
      setAlertSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '告警配置保存失败');
    } finally {
      setAlertSaving(false);
    }
  };

  const kpi = [
    { label: '调用单元', value: fmtNum(units.length), hint: `近 ${WINDOW_DAYS} 天有调用的供给单元` },
    { label: '总调用量', value: fmtNum(totals.calls), hint: `成功率 ${totals.calls ? fmtPct((totals.success / totals.calls) * 100) : '—'}` },
    { label: '冷却中单元', value: fmtNum(totals.cooling), hint: totals.cooling ? '熔断中，候选被剔除' : '全部单元健康' },
    { label: '告警开关', value: alertCfg.enabled ? '开启' : '关闭', hint: alertCfg.webhook_url ? 'webhook 已配置' : '未配置 webhook 地址' },
  ];

  return (
    <div className="space-y-5">
      {/* 顶部错误提示（三态：error） */}
      {error && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
          <p className="text-xs text-destructive">{error}</p>
          <button
            type="button"
            onClick={refresh}
            className="rounded-md border border-destructive/40 px-2 py-0.5 text-2xs text-destructive transition-colors hover:bg-destructive/10"
          >
            重试
          </button>
        </div>
      )}

      {/* KPI 概览（高保真稿：4 卡） */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpi.map((k) => (
          <div key={k.label} className="rounded-xl border border-card-border bg-card p-3.5">
            <p className="text-2xs text-muted-foreground">{k.label}</p>
            <p className="mt-1.5 text-xl font-semibold tracking-tight text-foreground">{k.value}</p>
            <p className="mt-1 text-2xs text-muted-foreground">{k.hint}</p>
          </div>
        ))}
      </div>

      {/* 筛选行：时间窗口 + 刷新 */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted-foreground">近 {WINDOW_DAYS} 天 · 按单元聚合（渠道 × 模型）</span>
        {loading && <span className="text-xs text-muted-foreground">加载中…</span>}
        <button
          type="button"
          onClick={refresh}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          aria-label="刷新健康数据"
          title="刷新健康数据"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          刷新
        </button>
      </div>

      {/* 单元健康卡片网格（三态：loading 骨架 / empty / data） */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl border border-card-border bg-card" />
          ))}
        </div>
      ) : units.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-accent/30 text-center">
          <ShieldAlert className="h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm font-medium text-foreground">暂无调用数据</p>
          <p className="max-w-72 text-xs text-muted-foreground">近 {WINDOW_DAYS} 天没有审计调用，健康面板将随首次调用生成。</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {units.map((u) => (
            <UnitCard key={`${u.channel_id}|${u.provider_model}`} unit={u} />
          ))}
        </div>
      )}

      {/* 告警配置折叠区（高保真稿：默认展开，底部） */}
      <section className="rounded-xl border border-card-border bg-card">
        <button
          type="button"
          onClick={() => setAlertOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
          aria-expanded={alertOpen}
        >
          <div>
            <h2 className="text-sm font-medium text-foreground">告警配置（三类最小告警 → webhook）</h2>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              错误率突增：最近 {alertCfg.error_rate_window_min} 分钟错误率 &gt; {alertCfg.error_rate_threshold_pct}% 触发；
              熔断发生 / 同步失败复用同一 webhook 与冷却（{alertCfg.cooldown_min} 分钟）。
            </p>
          </div>
          <span className="text-xs text-muted-foreground">{alertOpen ? '收起' : '展开'}</span>
        </button>
        {alertOpen && (
          <div className="space-y-3 border-t border-border px-4 py-3">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={alertCfg.enabled}
                  onChange={(e) => void saveAlert({ enabled: e.target.checked })}
                  className="h-3.5 w-3.5 accent-primary"
                />
                启用告警
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                错误率阈值
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={alertCfg.error_rate_threshold_pct}
                  onChange={(e) => setAlertCfg({ ...alertCfg, error_rate_threshold_pct: Number(e.target.value) })}
                  onBlur={() => void saveAlert({ error_rate_threshold_pct: alertCfg.error_rate_threshold_pct })}
                  className="h-7 w-16 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-primary/50"
                />
                %
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                滚动窗口
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={alertCfg.error_rate_window_min}
                  onChange={(e) => setAlertCfg({ ...alertCfg, error_rate_window_min: Number(e.target.value) })}
                  onBlur={() => void saveAlert({ error_rate_window_min: alertCfg.error_rate_window_min })}
                  className="h-7 w-16 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-primary/50"
                />
                分钟
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                冷却
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={alertCfg.cooldown_min}
                  onChange={(e) => setAlertCfg({ ...alertCfg, cooldown_min: Number(e.target.value) })}
                  onBlur={() => void saveAlert({ cooldown_min: alertCfg.cooldown_min })}
                  className="h-7 w-16 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-primary/50"
                />
                分钟
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex flex-1 items-center gap-2 text-xs text-muted-foreground">
                Webhook URL
                <input
                  type="url"
                  value={alertCfg.webhook_url}
                  onChange={(e) => setAlertCfg({ ...alertCfg, webhook_url: e.target.value })}
                  placeholder="https://hooks.example.com/alert"
                  className="h-7 min-w-48 flex-1 rounded-lg border border-border bg-background px-2.5 text-xs outline-none placeholder:text-muted-foreground/70 focus:border-primary/50"
                />
              </label>
              <button
                type="button"
                disabled={alertSaving}
                onClick={() => void saveAlert({ webhook_url: alertCfg.webhook_url })}
                className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
              >
                {alertSaving ? '保存中…' : '保存'}
              </button>
              {alertSaved && <span className="text-2xs text-emerald-600">已保存</span>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/** 单元健康卡片：成功率 + 调用量 + 错误码分布迷你条 + 熔断徽标（三态） */
function UnitCard({ unit }: { unit: UnitHealth }) {
  const failed = unit.failed_calls ?? 0;
  const total = unit.calls ?? 0;
  const failedPct = total ? (failed / total) * 100 : 0;
  const buckets = ERROR_BUCKETS.map((b) => ({
    ...b,
    count: unit.error_codes?.[b.key] ?? 0,
    pct: failed ? ((unit.error_codes?.[b.key] ?? 0) / failed) * 100 : 0,
  })).filter((b) => b.count > 0);

  const state = unit.breaker_state ?? (unit.cooling ? 'cooling' : 'normal');
  const badge =
    state === 'cooling'
      ? { text: '冷却中', cls: 'bg-red-500/15 text-red-500', title: '熔断冷却中，候选被剔除' }
      : state === 'half_open'
        ? { text: '半开探活', cls: 'bg-amber-500/15 text-amber-600', title: '冷却到期，单飞探活中' }
        : { text: '正常', cls: 'bg-emerald-500/15 text-emerald-600', title: '供给单元健康' };
  const cardBorder = state === 'cooling' ? 'border-red-500/40' : state === 'half_open' ? 'border-amber-500/40' : 'border-card-border';

  return (
    <div className={cn('rounded-xl border bg-card p-3.5', cardBorder)}>
      {/* 头部：单元名 + 熔断徽标 */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground" title={`${unit.channel_id} · ${unit.provider_model}`}>
            {unit.channel_id}
          </p>
          <p className="truncate text-2xs text-muted-foreground">{unit.provider_model}</p>
        </div>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium', badge.cls)} title={badge.title}>
          {badge.text}
        </span>
      </div>

      {/* 指标行：成功率 + 调用量 + 失败量 */}
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className={cn('font-semibold', unit.success_rate >= 95 ? 'text-emerald-600' : unit.success_rate >= 80 ? 'text-amber-600' : 'text-red-500')}>
          {total ? fmtPct(unit.success_rate) : '—'}
        </span>
        <span className="text-2xs text-muted-foreground">
          {fmtNum(total)} 次 · 失败 {fmtNum(failed)} 次
        </span>
      </div>
      {/* 成功率条 */}
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', unit.success_rate >= 95 ? 'bg-emerald-500' : unit.success_rate >= 80 ? 'bg-amber-500' : 'bg-red-500')}
          style={{ width: `${Math.min(100, unit.success_rate)}%` }}
        />
      </div>

      {/* 错误码分布（失败行占比） */}
      <div className="mb-2 flex items-center justify-between text-2xs text-muted-foreground">
        <span>错误码分布（占失败）</span>
        <span>{failed ? fmtPct(failedPct) + ' 失败率' : '无失败'}</span>
      </div>
      {buckets.length === 0 ? (
        <p className="text-2xs text-muted-foreground">—</p>
      ) : (
        <div className="space-y-1">
          {buckets.map((b) => (
            <div key={b.key} className="flex items-center gap-2 text-2xs">
              <span className="w-12 shrink-0 text-muted-foreground">{b.label}</span>
              <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, b.pct)}%`, backgroundColor: b.color }} />
              </div>
              <span className="w-12 shrink-0 text-right text-muted-foreground">{fmtPct(b.pct)}</span>
            </div>
          ))}
        </div>
      )}

      {/* 底部：最近活动 */}
      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 text-2xs text-muted-foreground">
        <span>成功 {fmtWhen(unit.last_success_at)}</span>
        <span>失败 {fmtWhen(unit.last_failure_at)}</span>
      </div>
    </div>
  );
}
