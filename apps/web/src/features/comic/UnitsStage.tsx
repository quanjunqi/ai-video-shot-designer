// EXPORTS: default UnitsStage
// 单元规划（5.5）：镜头→单元三种映射（1镜=1单元/多镜=1单元/1镜=多单元）→ 连续性台账 → 目标模型 Prompt
// 容量由执行目标（模型上限）决定；资产与 Prompt 逐项由用户评审，系统不做质量判断
import { useState } from 'react';
import { Boxes, Check, X, Cpu, Layers, ChevronDown, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useEpisodeStore } from '@/stores/useEpisodeStore';
import { buildExecutableUnits } from '@/mocks/directing';
import StageModelPicker from '@/features/comic/StageModelPicker';
import type { ConfirmedItem, Episode, UnitItem } from '@/types';
import StageRuleBadge from '@/features/rules/StageRuleBadge';
import { cn } from '@/lib/utils';
import { TRANSITION_MODES, TRANSITION_POLICY, transitionLabel } from '@/config/rules/transition-policy';
import type { TransitionMode } from '@/types';

function statusBadge(s: ConfirmedItem['status'] | UnitItem['prompt']['status']) {
  if (s === 'USER_APPROVED') return 'bg-success/15 text-success';
  if (s === 'USER_REJECTED') return 'bg-destructive/10 text-destructive';
  return 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
}
function statusLabel(s: ConfirmedItem['status']) {
  if (s === 'USER_APPROVED') return '已确认';
  if (s === 'USER_REJECTED') return '已退回';
  return '待确认';
}

export default function UnitsStage({ episode }: { episode: Episode }) {
  const projectId = episode.projectId;
  const updateEpisode = useEpisodeStore((s) => s.updateEpisode);
  const rawUnits = episode.executableUnits ?? [];
  // 旧格式（无 shotIds/continuity 域）兼容：按当前容量重建单元（镜头→单元映射 + 连续性台账）
  if (rawUnits.length > 0 && !('shotIds' in rawUnits[0])) {
    updateEpisode(episode.id, { executableUnits: buildExecutableUnits(episode, episode.executionTarget) });
  }
  const units: UnitItem[] = rawUnits.filter((u): u is UnitItem => 'shotIds' in u);
  // L4 单元级视频衔接覆盖：u.transitionMode ?? 执行目标锁定 ?? 平台默认
  const [transitionOpen, setTransitionOpen] = useState<Record<string, boolean>>({});
  const targetMode: TransitionMode = episode.executionTarget?.transitionMode ?? TRANSITION_POLICY.defaultMode;
  const effectiveMode = (u: UnitItem): TransitionMode => u.transitionMode ?? targetMode;
  if (units.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">
        单元尚未编译（分镜表确认后按模型容量打包，正式为单元规划服务输出）
      </div>
    );
  }

  const patchUnits = (fn: (cur: UnitItem[]) => UnitItem[]) => {
    const cur = (useEpisodeStore.getState().episodes.find((e) => e.id === episode.id)?.executableUnits ?? []) as UnitItem[];
    updateEpisode(episode.id, { executableUnits: fn(cur) });
  };

  const decideAsset = (unitId: string, assetId: string, accept: boolean) => {
    patchUnits((cur) =>
      cur.map((u) =>
        u.id === unitId
          ? {
              ...u,
              assets: u.assets.map((a) =>
                a.id === assetId ? { ...a, status: accept ? ('USER_APPROVED' as const) : ('USER_REJECTED' as const) } : a,
              ),
            }
          : u,
      ),
    );
    toast[accept ? 'success' : 'info'](accept ? `已确认单元资产 ${assetId}` : '已退回，可更换资产后重新提交');
  };

  const decidePrompt = (unitId: string, accept: boolean) => {
    patchUnits((cur) =>
      cur.map((u) =>
        u.id === unitId
          ? { ...u, prompt: { ...u.prompt, status: accept ? ('USER_APPROVED' as const) : ('USER_REJECTED' as const) } }
          : u,
      ),
    );
    toast[accept ? 'success' : 'info'](accept ? `已确认 ${unitId} 目标模型 Prompt` : '已退回，可调整后重新提交');
  };

  const unitDone = (u: UnitItem) =>
    u.assets.length > 0 && u.assets.every((a) => a.status === 'USER_APPROVED') && u.prompt.status === 'USER_APPROVED';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
        <StageModelPicker
          stage="units"
          type="text"
          label="Prompt 文本模型"
          episodeId={episode.id}
          hint="单元 Prompt 由文本模型生成，可随时更换"
        />
      </div>
      <div className="flex items-center gap-2">
        <Boxes className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">单元规划</span>
        <StageRuleBadge projectId={projectId} stage="unit_prompt" />
        <span className="text-[11px] text-muted-foreground">
          EXECUTABLE：镜头/剪辑批准后编译 · 容量由执行目标决定 · 连续性 in/out 显式登记
        </span>
        <Badge variant="outline" className="ml-auto font-mono text-[9px]">
          {units.filter(unitDone).length}/{units.length} 单元就绪
        </Badge>
      </div>

      {units.map((u) => (
        <div key={u.id} className={cn('rounded-xl border bg-card p-4', unitDone(u) ? 'border-success/40' : 'border-border')}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{u.label}</span>
            <Badge variant="outline" className="font-mono text-[9px]">{u.durationSeconds}s</Badge>
            <Badge variant="outline" className="font-mono text-[9px]">{u.shotCount} 镜</Badge>
            {/* 镜头→单元映射方式 */}
            <Badge variant="outline" className="font-mono text-[9px] text-primary" title="镜头→单元映射：1镜=1单元 / 多镜=1单元 / 1镜=多单元">
              <Cpu className="mr-1 inline h-2.5 w-2.5" />
              映射：{u.shotIds.length > 1 ? '多镜→1单元' : '1镜→1单元'}
            </Badge>
            {/* 镜头卡引用 */}
            <span className="flex flex-wrap gap-1">
              {u.shotIds.map((sid, si) => {
                const n = Number(sid.split('-').pop());
                return (
                  <Badge key={sid} variant="outline" className="font-mono text-[9px] text-muted-foreground">
                    {Number.isFinite(n) ? `S${String(n).padStart(2, '0')}` : `S${String(si + 1).padStart(2, '0')}`}
                  </Badge>
                );
              })}
            </span>
            <span className="text-[11px] text-muted-foreground">
              覆盖：{u.coverage}
            </span>
            <Badge
              variant="outline"
              className={cn('font-mono text-[9px]', effectiveMode(u) === 'first_last_frame' ? 'border-primary/40 text-primary' : 'text-muted-foreground')}
              title={u.transitionMode ? '单元级覆盖' : `跟随执行目标（${transitionLabel(targetMode)}）`}
            >
              <Link2 className="mr-1 inline h-2.5 w-2.5" />
              衔接：{transitionLabel(effectiveMode(u))}
              {u.transitionMode && <span className="ml-0.5 text-primary">· 覆盖</span>}
            </Badge>
            <Badge className={cn('ml-auto', unitDone(u) ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground')}>
              {unitDone(u) ? '单元就绪' : '待确认'}
            </Badge>
          </div>

          {/* 连续性台账：in/out 显式登记（驱动跨单元视觉承接） */}
          <div className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-2">
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                <Link2 className="h-3 w-3 text-primary" />
                连续性台账 · in（进入本单元前的世界状态）
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{u.continuity.in}</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                <Link2 className="h-3 w-3 text-primary" />
                连续性台账 · out（本单元收尾快照，驱动下一单元）
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{u.continuity.out}</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-2">
            {u.assets.map((a) => (
              <div key={a.id} className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium">{a.label}</span>
                  <span className={cn('ml-auto rounded px-1.5 py-px text-[9px]', statusBadge(a.status))}>
                    {statusLabel(a.status)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{a.detail}</p>
                <div className="mt-2 flex gap-2">
                  <Button type="button" size="sm" className="flex-1" disabled={a.status === 'USER_APPROVED'} onClick={() => decideAsset(u.id, a.id, true)}>
                    <Check className="h-3.5 w-3.5" />
                    确认资产
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => decideAsset(u.id, a.id, false)}>
                    <X className="h-3.5 w-3.5" />
                    退回
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2 flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <Cpu className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">目标模型 Prompt</span>
                <span className={cn('rounded px-1.5 py-px text-[9px]', statusBadge(u.prompt.status))}>
                  {statusLabel(u.prompt.status)}
                </span>
              </div>
              <p className="mt-1 font-mono text-[11px] leading-relaxed text-muted-foreground">{u.prompt.text}</p>
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" className="flex-1" disabled={u.prompt.status === 'USER_APPROVED'} onClick={() => decidePrompt(u.id, true)}>
                  <Check className="h-3.5 w-3.5" />
                  确认 Prompt
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => decidePrompt(u.id, false)}>
                  <X className="h-3.5 w-3.5" />
                  退回
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-2 rounded-lg border border-dashed border-border">
            <button
              type="button"
              onClick={() => setTransitionOpen((o) => ({ ...o, [u.id]: !o[u.id] }))}
              className="flex w-full items-center gap-1.5 px-3 py-2 text-[10px] text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className={cn('h-3 w-3 transition-transform', transitionOpen[u.id] && 'rotate-180')} />
              高级 · 视频衔接
              <span className="ml-auto">
                当前：{transitionLabel(effectiveMode(u))}
                {u.transitionMode ? <span className="text-primary">（单元覆盖）</span> : <span className="text-muted-foreground/70">（跟随执行目标）</span>}
              </span>
            </button>
            {transitionOpen[u.id] && (
              <div className="border-t border-border px-3 py-2">
                <div className="grid gap-1.5 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => {
                      updateEpisode(episode.id, { executableUnits: units.map((x) => (x.id === u.id ? { ...x, transitionMode: undefined } : x)) });
                      toast.info('该单元已恢复为跟随执行目标');
                    }}
                    className={cn('rounded-lg border p-2 text-left', !u.transitionMode ? 'border-primary/50 bg-accent/40' : 'border-border hover:border-primary/30')}
                  >
                    <div className="text-[10px] font-medium">跟随执行目标</div>
                    <div className="mt-0.5 text-[9px] text-muted-foreground">用执行目标锁定的衔接（{transitionLabel(targetMode)}）</div>
                  </button>
                  {TRANSITION_MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        updateEpisode(episode.id, { executableUnits: units.map((x) => (x.id === u.id ? { ...x, transitionMode: m.id } : x)) });
                        toast.success(`单元已改为「${m.label}」（单元级覆盖）`);
                      }}
                      className={cn('rounded-lg border p-2 text-left', u.transitionMode === m.id ? 'border-primary/50 bg-accent/40' : 'border-border hover:border-primary/30')}
                    >
                      <div className="text-[10px] font-medium">{m.label}</div>
                      <div className="mt-0.5 line-clamp-2 text-[9px] text-muted-foreground">{m.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      <p className="text-[11px] text-muted-foreground">
        Prompt 面向目标模型，不反向定义事实；生成成功不等于用户批准。全部单元资产与 Prompt 确认后进入「视频生产」。
      </p>
    </div>
  );
}
