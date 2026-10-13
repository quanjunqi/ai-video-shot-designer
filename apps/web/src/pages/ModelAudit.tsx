// EXPORTS: default ModelAuditPage
// 审计日志（高保真稿 GATE-2，T2-2）：调用记录表格 + T1 业务归因列（项目/剧集/分镜/功能）+
// 服务端筛选（状态/操作者/项目/功能）+ 行展开详情。替代旧 SettingsAudit（371 行超 ADR-005 ≤300 约束）。
import { useEffect, useState } from 'react';
import { RefreshCw, Download } from 'lucide-react';
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
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatLatency(ms: number) {
  if (!ms) return '—';
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** 归因合并展示：project/episode/shot/feature 任一存在即显示，否则「未归因」 */
function attributionOf(log: AuditLog) {
  const parts = [log.project_id, log.episode_id, log.shot_id].filter(Boolean);
  const base = parts.length ? parts.join(' / ') : '未归因';
  return log.feature ? `${base} · ${log.feature}` : base;
}

export default function ModelAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [userIdDraft, setUserIdDraft] = useState('');
  const [projectDraft, setProjectDraft] = useState('');
  const [featureDraft, setFeatureDraft] = useState('');
  const [userId, setUserId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [feature, setFeature] = useState('');

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await api.listAuditLogs({
        limit: 100,
        status: status || undefined,
        user_id: userId || undefined,
        project_id: projectId || undefined,
        feature: feature || undefined,
      });
      setLogs(res.items || []);
      setTotal(res.total);
    } catch (e) {
      console.error('Failed to load audit logs', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    api
      .listAuditLogs({
        limit: 100,
        status: status || undefined,
        user_id: userId || undefined,
        project_id: projectId || undefined,
        feature: feature || undefined,
      })
      .then((res) => {
        if (!cancelled) {
          setLogs(res.items || []);
          setTotal(res.total);
        }
      })
      .catch((e) => console.error('Failed to load audit logs', e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, userId, projectId, feature]);

  return (
    <div className="space-y-4">
      {/* 筛选行：操作者 / 项目 / 功能（草稿+回车应用两态）+ 状态 + 导出 */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={userIdDraft}
          onChange={(e) => setUserIdDraft(e.target.value)}
          onBlur={() => setUserId(userIdDraft.trim())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setUserId(userIdDraft.trim());
          }}
          placeholder="按操作者（回车应用）"
          aria-label="按操作者筛选"
          className="h-7 w-36 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
        />
        <input
          value={projectDraft}
          onChange={(e) => setProjectDraft(e.target.value)}
          onBlur={() => setProjectId(projectDraft.trim())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setProjectId(projectDraft.trim());
          }}
          placeholder="按项目（回车应用）"
          aria-label="按项目筛选"
          className="h-7 w-36 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
        />
        <input
          value={featureDraft}
          onChange={(e) => setFeatureDraft(e.target.value)}
          onBlur={() => setFeature(featureDraft.trim())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setFeature(featureDraft.trim());
          }}
          placeholder="按功能（回车应用）"
          aria-label="按功能筛选"
          className="h-7 w-36 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="按状态筛选"
          className="h-7 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
        >
          <option value="">全部状态</option>
          <option value="success">成功</option>
          <option value="failed">失败</option>
          <option value="queued">排队中</option>
        </select>
        <a
          href={api.auditExportUrl({
            status: status || undefined,
            user_id: userId || undefined,
            project_id: projectId || undefined,
            feature: feature || undefined,
          })}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Download className="h-3.5 w-3.5" />
          导出 CSV
        </a>
        <button
          onClick={loadLogs}
          disabled={loading}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          刷新
        </button>
        <span className="ml-auto text-xs text-muted-foreground">共 {total} 条（展示最近 {logs.length} 条）</span>
      </div>

      {/* 表格：时间 / 状态 / 模型 / 渠道 / 归因 / 耗时 */}
      <div className="overflow-hidden rounded-xl border border-card-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-medium">时间</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 font-medium">模型</th>
                <th className="px-3 py-2 font-medium">渠道</th>
                <th className="px-3 py-2 font-medium">归因（项目/剧集/分镜·功能）</th>
                <th className="px-3 py-2 font-medium">耗时</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const st = STATUS_MAP[log.status] ?? { label: log.status, className: 'bg-gray-500/15 text-gray-400 border-gray-500/30' };
                const expanded = expandedId === log.id;
                return (
                  <AuditRow
                    key={log.id}
                    log={log}
                    st={st}
                    expanded={expanded}
                    onToggle={() => setExpandedId(expanded ? null : log.id)}
                  />
                );
              })}
              {!loading && logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                    暂无记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AuditRow({
  log,
  st,
  expanded,
  onToggle,
}: {
  log: AuditLog;
  st: { label: string; className: string };
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={cn('cursor-pointer border-b border-border/60 transition-colors hover:bg-accent/40', expanded && 'bg-accent/30')}
        onClick={onToggle}
      >
        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatTime(log.created_at)}</td>
        <td className="px-3 py-2">
          <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium', st.className)}>{st.label}</span>
        </td>
        <td className="max-w-44 truncate px-3 py-2 font-mono text-foreground" title={log.model_id}>
          {log.model_id}
        </td>
        <td className="max-w-36 truncate px-3 py-2 font-mono text-muted-foreground" title={log.channel_id ?? ''}>
          {log.channel_id || '—'}
        </td>
        <td className="max-w-56 truncate px-3 py-2" title={attributionOf(log)}>
          {attributionOf(log)}
        </td>
        <td className="px-3 py-2 font-mono text-muted-foreground">{formatLatency(log.latency_ms)}</td>
      </tr>
      {expanded && (
        <tr className="border-b border-border/60 bg-accent/20">
          <td colSpan={6} className="px-3 py-3">
            <div className="space-y-1.5 text-xs">
              <Row label="请求 ID" value={log.request_id} mono />
              <Row label="产品线" value={PRODUCT_MAP[log.product] ?? log.product} />
              <Row label="模式" value={log.mode} />
              <Row label="操作者" value={log.user_id || '—'} mono />
              {log.job_id && <Row label="任务 ID" value={log.job_id} mono />}
              {log.error_message && <Row label="错误" value={log.error_message} mono />}
              {log.response_payload && (
                <Row label="响应摘要" value={JSON.stringify(log.response_payload).slice(0, 240)} mono />
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <p className="flex gap-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn('min-w-0 break-all text-foreground', mono && 'font-mono')}>{value}</span>
    </p>
  );
}
