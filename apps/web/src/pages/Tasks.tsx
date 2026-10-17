// EXPORTS: default TasksPage
// 任务中心读取服务端 Execution Service，浏览器只负责展示和发起控制命令。
// TASK-IA-001 v14（Owner 确认）：用量/审计唯一入口=模型中心 —— 「账目」页签移除；
// 旧深链 /tasks?tab=ledger 重定向到 /models/costs（不 404）。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { RotateCw, ArrowUpRight, CheckCircle2, XCircle, Loader2, Clock, RefreshCw, Ban, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TaskDetailSheet from '@/features/tasks/TaskDetailSheet';
import { kindMeta, statusMeta } from '@/features/tasks/task-meta';
import { api, type ServerTask } from '@/lib/api/client';
import { cn } from '@/lib/utils';

// kind/status 的展示元数据（含未枚举值的兜底访问器）已抽到 features/tasks/task-meta.ts，
// 与详情抽屉共用一份 —— 否则两处标签各写一遍必然漂移（TASK-FIX-004 的兜底口径也在那里）。
function formatUpdatedAt(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }

export default function TasksPage() {
  // 账目页签已移除：?tab=ledger 旧深链统一落到模型中心成本页（用量唯一入口，IA v14）
  // ★ hooks 必须在任何条件返回之前调用（规则-of-hooks）；重定向判断放 render 尾部
  const [searchParams] = useSearchParams();

  const navigate = useNavigate();
  const [tasks, setTasks] = useState<ServerTask[]>([]); const [status, setStatus] = useState('all'); const [kind, setKind] = useState('all'); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState<string>(); const [busyId, setBusyId] = useState<string>();
  // 详情抽屉只记 taskId（不存对象）：详情数据必须来自 api.getTask 的实时单任务结果，
  // 若存列表快照，2s 轮询期间抽屉里会显示过期状态。
  const [detailTaskId, setDetailTaskId] = useState<string>();
  const load = useCallback(async (background = false) => { if (background) setRefreshing(true); else setLoading(true); try { const result = await api.listTasks(); setTasks(result.items); setError(undefined); } catch (cause) { setError(cause instanceof Error ? cause.message : '任务服务暂时不可用'); } finally { setLoading(false); setRefreshing(false); } }, []);
  useEffect(() => { const boot = window.setTimeout(() => void load(), 0); const timer = window.setInterval(() => void load(true), 2000); return () => { window.clearTimeout(boot); window.clearInterval(timer); }; }, [load]);
  const runAction = async (id: string, action: 'cancel' | 'retry') => { setBusyId(id); try { const updated = action === 'cancel' ? await api.cancelTask(id) : await api.retryTask(id); setTasks((current) => current.map((task) => task.id === id ? updated : task)); setError(undefined); } catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败'); } finally { setBusyId(undefined); } };
  const filtered = useMemo(() => tasks.filter((task) => (status === 'all' || task.status === status) && (kind === 'all' || task.kind === kind)), [kind, status, tasks]);

  if (searchParams.get('tab') === 'ledger') return <Navigate to="/models/costs" replace />;

  return <div className="mx-auto w-full max-w-[1100px] px-6 py-6">
    <div className="mb-4 flex flex-wrap items-center gap-2"><h1 className="text-lg font-semibold">任务中心</h1><Badge variant="outline" className="font-mono text-3xs">{tasks.length}</Badge><div className="ml-auto flex flex-wrap items-center gap-2">
      <Select value={status} onValueChange={setStatus}><SelectTrigger className="h-9 w-32"><SelectValue placeholder="全部状态" /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="running">运行中</SelectItem><SelectItem value="queued">排队中</SelectItem><SelectItem value="succeeded">成功</SelectItem><SelectItem value="failed">失败</SelectItem><SelectItem value="cancelled">已取消</SelectItem></SelectContent></Select>
      <Select value={kind} onValueChange={setKind}><SelectTrigger className="h-9 w-36"><SelectValue placeholder="全部类型" /></SelectTrigger><SelectContent><SelectItem value="all">全部类型</SelectItem><SelectItem value="split">拆集</SelectItem><SelectItem value="interpret">导演解读</SelectItem><SelectItem value="image">图片生成</SelectItem><SelectItem value="video">视频拍摄</SelectItem><SelectItem value="audio">音频</SelectItem><SelectItem value="canvas_export">画布导出</SelectItem><SelectItem value="text">文本生成</SelectItem></SelectContent></Select>
      <Button type="button" variant="outline" size="sm" onClick={() => void load(true)} disabled={refreshing}><RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />刷新</Button>
    </div></div>
    {error && <div className="mb-3 flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"><span>{error}</span><Button type="button" variant="ghost" size="sm" onClick={() => void load()}>重试</Button></div>}
    {loading ? <div className="rounded-xl border border-border bg-card py-14 text-center text-xs text-muted-foreground"><Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />正在加载任务</div> : filtered.length === 0 ? <div className="rounded-xl border border-border bg-card py-14 text-center text-xs text-muted-foreground">暂无任务。新建项目、进入剧集工坊或发起生成后，任务会显示在这里。</div> : <div className="space-y-2">
      {filtered.map((task) => { const km = kindMeta(task.kind); const sm = statusMeta(task.status); const Icon = km.icon; const canCancel = task.status === 'queued' || task.status === 'running'; const canRetry = task.status === 'failed' || task.status === 'cancelled'; return <div key={task.id} className={cn('flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors', task.context_path && 'cursor-pointer hover:border-primary/40')} onClick={() => task.context_path && navigate(task.context_path)}>
        <span className={cn('rounded-lg bg-accent/60 p-2', km.tone)}><Icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-sm font-medium">{task.label}</span><Badge variant="outline" className="font-mono text-4xs">{km.label}</Badge><span className={cn('rounded px-1.5 py-px text-3xs', sm.className)}>{sm.label}</span>{task.attempt > 1 && <span className="font-mono text-4xs text-muted-foreground">尝试 {task.attempt}</span>}</div><div className="mt-1.5 flex items-center gap-3">{task.status === 'running' || task.status === 'queued' ? <Progress value={task.progress} className="h-1 flex-1" /> : <div className="h-1 flex-1 rounded-full bg-muted" />}<span className="font-mono text-3xs text-muted-foreground">{task.status === 'running' || task.status === 'queued' ? `${Math.round(task.progress)}%` : task.cost_estimate || '—'}</span></div><div className="mt-1 text-3xs text-muted-foreground">更新于 {formatUpdatedAt(task.updated_at)}</div>{task.error && <div className="mt-1 truncate text-2xs text-destructive">{task.error}</div>}</div>
        <div className="flex shrink-0 items-center gap-1"><Button type="button" variant="ghost" size="sm" title="查看详情" onClick={(event) => { event.stopPropagation(); setDetailTaskId(task.id); }}><Eye className="h-3.5 w-3.5" /></Button>{canCancel && <Button type="button" variant="ghost" size="sm" title="取消任务" disabled={busyId === task.id} onClick={(event) => { event.stopPropagation(); void runAction(task.id, 'cancel'); }}><Ban className="h-3.5 w-3.5" /></Button>}{canRetry && <Button type="button" variant="outline" size="sm" disabled={busyId === task.id} onClick={(event) => { event.stopPropagation(); void runAction(task.id, 'retry'); }}><RotateCw className="h-3.5 w-3.5" />重试</Button>}{task.status === 'running' && <Loader2 className="ml-1 h-4 w-4 animate-spin text-primary" />}{task.status === 'succeeded' && <CheckCircle2 className="ml-1 h-4 w-4 text-success" />}{task.status === 'failed' && <XCircle className="ml-1 h-4 w-4 text-destructive" />}{task.status === 'cancelled' && <Ban className="ml-1 h-4 w-4 text-muted-foreground" />}{task.status === 'queued' && <Clock className="ml-1 h-4 w-4 text-muted-foreground" />}</div>{task.context_path && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      </div>; })}
    </div>}
    {/* 详情抽屉：关闭时清空 taskId（下次打开重新拉取，不显示旧数据） */}
    <TaskDetailSheet taskId={detailTaskId} open={detailTaskId !== undefined} onOpenChange={(open) => { if (!open) setDetailTaskId(undefined); }} />
  </div>;
}
