import { useEffect, useState } from 'react';
import { RefreshCw, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { api, type AuditLog } from '@/lib/api/client';
import { cn } from '@/lib/utils';

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  success: { label: '成功', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  queued: { label: '排队中', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  running: { label: '执行中', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  failed: { label: '失败', className: 'bg-red-500/15 text-red-400 border-red-500/30' },
  rate_limited: { label: '限流', className: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  cancelled: { label: '已取消', className: 'bg-gray-500/15 text-gray-400 border-gray-500/30' },
};

const PRODUCT_MAP: Record<string, string> = {
  comic: '漫剧工坊',
  canvas: '无限画布',
  create: '智能创造',
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatLatency(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * D7b：把服务端返回的 stats 归一化为界面计数。
 * 缺失时回退 0 —— 【不假装有数据】：与服务端未聚合时的行为一致（stats 为 undefined）。
 */
function statsFrom(res: { total: number; stats?: { byStatus?: Record<string, number>; avgLatencyMs?: number } }) {
  return {
    total: res.total,
    success: res.stats?.byStatus?.success ?? 0,
    failed: res.stats?.byStatus?.failed ?? 0,
    avgLatencyMs: res.stats?.avgLatencyMs ?? 0,
  };
}

export default function SettingsAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filter, setFilter] = useState('');
  // D7b：统计来自服务端（筛选后全集），不再是前端在当前页上算的
  const [stats, setStats] = useState<{ total: number; success: number; failed: number; avgLatencyMs: number } | null>(null);

  const loadLogs = async () => {
    try {
      const res = await api.listAuditLogs({ limit: 100 });
      setLogs(res.items || []);
      setStats(statsFrom(res));
    } catch (e) {
      console.error('Failed to load audit logs', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    // 初始加载：setState 全部落在异步回调中，避免 effect 内同步 setState 触发级联渲染
    api.listAuditLogs({ limit: 100 })
      .then((res) => { if (!cancelled) { setLogs(res.items || []); setStats(statsFrom(res)); } })
      .catch((e) => console.error('Failed to load audit logs', e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filteredLogs = logs.filter((log) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (
      log.model_id.toLowerCase().includes(f) ||
      log.product.toLowerCase().includes(f) ||
      log.mode.toLowerCase().includes(f) ||
      log.request_id.toLowerCase().includes(f) ||
      (log.project_id || '').toLowerCase().includes(f)
    );
  });

  // Stats —— D7b：一律用【服务端】在【筛选后全集】上的结果。
  // 此前这里是 logs.filter(...) / reduce(...)，而 logs 是"当前页"(limit:100)
  // ⇒ 翻页或筛选后"统计"会变，是【假统计】。回退值只用于 stats 尚未返回的首次渲染。
  const totalCalls = stats?.total ?? logs.length;
  const successCount = stats?.success ?? 0;
  const failedCount = stats?.failed ?? 0;
  const avgLatency = stats?.avgLatencyMs ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">调用审计日志</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">记录所有AI模型调用的完整审计信息，可追溯、可排查</p>
        </div>
        <button
          onClick={() => { setLoading(true); loadLogs(); }}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          刷新
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">总调用数</div>
          <div className="mt-1 text-xl font-bold text-foreground">{totalCalls}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">成功</div>
          <div className="mt-1 text-xl font-bold text-emerald-400">{successCount}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">失败</div>
          <div className="mt-1 text-xl font-bold text-red-400">{failedCount}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">平均耗时</div>
          <div className="mt-1 text-xl font-bold text-blue-400">{formatLatency(avgLatency)}</div>
        </div>
      </div>

      {/* Filter */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="搜索模型ID、产品、模式、请求ID、项目ID..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Log list */}
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              加载中...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">暂无审计日志</div>
          ) : (
            <div className="divide-y divide-border">
              {filteredLogs.map((log) => {
                const status = STATUS_MAP[log.status] || { label: log.status, className: 'bg-gray-500/15 text-gray-400 border-gray-500/30' };
                const isExpanded = expandedId === log.id;
                return (
                  <div key={log.id} className="bg-card transition-colors hover:bg-accent/30">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    >
                      <span className={cn('shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium', status.className)}>
                        {status.label}
                      </span>
                      <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        {PRODUCT_MAP[log.product] || log.product || '未知'}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{log.model_id}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{log.mode}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{formatLatency(log.latency_ms)}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{formatTime(log.created_at)}</span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                    {isExpanded && (
                      <div className="border-t border-border bg-background/50 px-4 py-3">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs md:grid-cols-3">
                          <div>
                            <span className="text-muted-foreground">请求ID：</span>
                            <span className="font-mono text-foreground">{log.request_id}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">用户：</span>
                            <span className="text-foreground">{log.user_id || '-'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">项目：</span>
                            <span className="text-foreground">{log.project_id || '-'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">剧集：</span>
                            <span className="text-foreground">{log.episode_id || '-'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">资产：</span>
                            <span className="text-foreground">{log.asset_id || '-'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">任务ID：</span>
                            <span className="font-mono text-foreground">{log.job_id || '-'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">输入Token：</span>
                            <span className="text-foreground">{log.token_input}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">输出Token：</span>
                            <span className="text-foreground">{log.token_output}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">成本：</span>
                            <span className="text-foreground">{log.cost_amount} {log.cost_currency}</span>
                          </div>
                        </div>
                        {log.error_message && (
                          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">
                            <span className="font-medium">错误信息：</span>{log.error_message}
                          </div>
                        )}
                        <div className="mt-3">
                          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">请求参数</div>
                          <pre className="max-h-40 overflow-auto rounded-lg border border-border bg-background p-2 font-mono text-[10px] text-muted-foreground">
                            {JSON.stringify(log.request_payload, null, 2)}
                          </pre>
                        </div>
                        {log.response_payload && (
                          <div className="mt-3">
                            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">响应结果</div>
                            <pre className="max-h-40 overflow-auto rounded-lg border border-border bg-background p-2 font-mono text-[10px] text-muted-foreground">
                              {JSON.stringify(log.response_payload, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
