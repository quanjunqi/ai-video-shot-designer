// EXPORTS: default TaskDetailSheet
//
// 任务详情抽屉（TASK-OBS-001）：任务中心每行的「详情」入口打开本抽屉，展示已落库的
// 请求参数（intent_payload）、产物（result_payload，含 010 之前历史行）、步骤与错误。
//
// 为什么详情要单独取数：列表接口只给最多 50 条的任务快照，完整的 intent_payload / steps 未必在
// 列表里；因此打开时以 `api.getTask(id)` 的单任务结果为准（列表数据只用于渲染行）。
//
// 为什么解析全部复用共享纯函数：`result-utils.ts` 已经收敛了「结果存在哪一代列里」
// （result_payload 优先、回退 intent_payload.result）与 jsonb「对象 / JSON 字符串 / null」三形态。
// 本组件若自己再解析一遍，这份知识就会分叉成两份，历史任务迟早有一边读不出来。
//
// 状态为什么按 id 存（`{ id, task }` 而非直接存 task）：
//   1) 「关闭即重置」不能靠 effect 里同步 setState —— 本仓库 `react-hooks/set-state-in-effect`
//      是 **error**（级联渲染）。故不在 effect 里清状态，而是把状态与它所属的 taskId 绑在一起，
//      渲染期只认「id 与当前 taskId 相同」的那份数据 ⇒ 换任务时旧数据天然失效，无需手动清空，
//      也不存在"先闪一下上一个任务"的窗口。
//   2) 打开/切换任务一律重新拉取（重新挂载或 taskId 变化都会跑 effect），所以详情始终是实时的。
//
// 三态（R-CRUD-001）与空态口径：
//   · loading：打开即拉取，转圈 + 文案（不留白）；
//   · error：**如实展示根因**（`cause.message`），不写"加载失败"这类掩盖真实原因的通用文案；
//   · empty：无参数 → 明确文案；无产物 / 无步骤 → 该区块整体不渲染（不出现空壳标题）。
import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { api, type ServerTask } from '@/lib/api/client';
import { attemptsNote, extractResultUrl, formatTaskTime, parseTaskPayload } from '@/features/genworkbench/result-utils';
import { parameterRows } from '@/features/tasks/task-detail-utils';
import { kindMeta, statusMeta } from '@/features/tasks/task-meta';

interface TaskDetailSheetProps {
  taskId: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 信息网格的一行（与 CreateWorkbench 的 DetailRow 同款两列：label 固定宽、value 可截断） */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-mono">{value}</span>
    </div>
  );
}

export default function TaskDetailSheet({ taskId, open, onOpenChange }: TaskDetailSheetProps) {
  // 成功与失败都带上"这份结果属于哪个 taskId"，渲染期据此判定是否仍然有效
  const [loaded, setLoaded] = useState<{ id: string; task: ServerTask }>();
  const [failure, setFailure] = useState<{ id: string; message: string }>();

  useEffect(() => {
    if (!open || !taskId) return;
    // cancelled 丢弃晚到的响应：快速连点两行时，先发的请求不得覆盖后选中的任务
    let cancelled = false;
    void api.getTask(taskId)
      .then((detail) => {
        if (cancelled) return;
        setFailure(undefined);
        setLoaded({ id: taskId, task: detail });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setLoaded(undefined);
        setFailure({ id: taskId, message: cause instanceof Error ? cause.message : '详情加载失败' });
      });
    return () => {
      cancelled = true;
    };
  }, [open, taskId]);

  // —— 以下三个派生值只看"当前 taskId 的数据"，故关闭/换任务后不会残留旧结果 ——
  const task = loaded && loaded.id === taskId ? loaded.task : undefined;
  const error = failure && failure.id === taskId ? failure.message : undefined;
  const loading = open && taskId !== undefined && task === undefined && error === undefined;

  // 全部取自服务端返回值；负载缺失时 parseTaskPayload 返回 {}，后续各区自行走空态
  const payload = task ? parseTaskPayload(task) : undefined;
  const resultUrl = payload ? extractResultUrl(payload) : undefined;
  const parameters = payload ? parameterRows(payload) : [];
  const steps = task?.steps ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {loading ? (
          <div className="flex items-center gap-2 px-4 py-10 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载任务详情
          </div>
        ) : null}

        {!loading && error !== undefined ? (
          <div className="px-4 py-10 text-xs text-destructive">{error}</div>
        ) : null}

        {!loading && error === undefined && task ? (
          <>
            <SheetHeader>
              <SheetTitle className="pr-6 text-sm">{task.label}</SheetTitle>
              <SheetDescription className="font-mono text-3xs">任务 {task.id}</SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-4 px-4 pb-6">
              <div className="grid grid-cols-2 gap-2 text-2xs">
                <DetailRow label="状态" value={statusMeta(task.status).label} />
                <DetailRow label="类型" value={kindMeta(task.kind).label} />
                <DetailRow label="费用" value={task.cost_estimate ?? '—'} />
                <DetailRow label="尝试" value={attemptsNote(task.attempt) ?? '1 次'} />
                <DetailRow label="创建" value={formatTaskTime(task.created_at)} />
                <DetailRow label="更新" value={formatTaskTime(task.updated_at)} />
              </div>

              {task.error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-2xs text-destructive">
                  {task.error}
                </div>
              ) : null}

              {resultUrl ? (
                <div className="space-y-1">
                  <div className="text-2xs font-medium">产物地址</div>
                  <a
                    href={resultUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate font-mono text-3xs text-primary underline"
                  >
                    {resultUrl}
                  </a>
                </div>
              ) : null}

              <div className="space-y-1">
                <div className="text-2xs font-medium">提交时的参数快照</div>
                {parameters.length === 0 ? (
                  <p className="text-3xs text-muted-foreground">该任务没有记录参数快照。</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-border">
                    {parameters.map((row) => (
                      <div key={row.key} className="flex gap-2 border-b border-border px-2 py-1 text-3xs last:border-b-0">
                        <span className="w-24 shrink-0 truncate font-mono text-muted-foreground">{row.key}</span>
                        <span className="min-w-0 flex-1 break-words">{row.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 步骤为空时整块不渲染（含标题）——空壳标题会被误读成"步骤丢了" */}
              {steps.length > 0 ? (
                <div className="space-y-1">
                  <div className="text-2xs font-medium">步骤</div>
                  <div className="overflow-hidden rounded-lg border border-border">
                    {steps.map((step, index) => (
                      // 步骤是服务端给的定序快照，不重排/不筛选；标签可能重复，
                      // 故用「标签 + 序号」复合 key（重复标签下仍唯一），不用裸 index 作 key
                      <div
                        key={`${step.label}-${index}`}
                        className="flex items-center gap-2 border-b border-border px-2 py-1 text-3xs last:border-b-0"
                      >
                        {step.done ? (
                          <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
                        ) : (
                          <Circle className="h-3 w-3 shrink-0 text-muted-foreground" />
                        )}
                        {/* 完成态原先只靠图标颜色传达，色觉障碍/读屏用户读不出来 —— 补一段屏读文本 */}
                        <span className="sr-only">{step.done ? '已完成' : '未完成'}</span>
                        <span className="min-w-0 flex-1 truncate">{step.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {/* 兜底：open 但没给 taskId（调用方协议外用法）也不留白 */}
        {open && taskId === undefined ? (
          <div className="px-4 py-10 text-xs text-muted-foreground">未指定任务。</div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
