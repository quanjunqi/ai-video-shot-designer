// EXPORTS: default BlockingStage
// 分镜设计工作台（参考 BigBanana 导演工作台）：顶部镜头网格 + 中间核心编辑器 + 右侧关键帧/提示词 + 底部时间轴
// 每个镜头卡是完整生产事实源，系统自动生成默认，用户只改关键项；质量交用户评审。
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Clapperboard,
  Check,
  CheckCircle2,
  X,
  ChevronDown,
  Info,
  Film,
  Mic,
  Link2,
  ClipboardCheck,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Camera,
  Wand2,
  Clock,
  Image,
  Sparkles,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useEpisodeStore } from '@/stores/useEpisodeStore';
import { useAssetStore } from '@/stores/useAssetStore';
import { buildDirecting } from '@/mocks/directing';
import { applyDefaultCamera, applyCannedCamera, CANNED_CAMERA_LANGUAGE } from '@/config/rules/camera-defaults';
import type { Episode, ShotCard, ArtifactStatus } from '@/types';
import { cn } from '@/lib/utils';

const HARD_CONSTRAINTS = [
  '镜头独立渲染：所有关键信息写在本镜头内，禁止依赖「上一镜/下一幕」记忆',
  '人物视觉以三视图为最高标准；场景/道具/材质以对应参考图为最高标准',
  '仅执行本镜头写明的视觉事件，动作必须完整跑完，禁止中途中断',
  '人物位置/朝向/道具状态必须明确，禁止无依据的随机改动或凭空新增',
  '对白为普通话，严格使用原文，不可增删、改写、翻译',
  '画面事件与音效必须因果同步；不可逆状态（受伤/打碎/易手）不得回退',
];

const SHOT_SIZE_OPTS = ['远景', '全景', '中景', '近景', '特写'];
const MOVEMENT_OPTS = ['固定机位', '推', '拉', '摇', '移', '跟随', '缓推', '缓拉', '手持'];
const COMPOSITION_OPTS = ['中心构图', '三分构图', '对称构图', '对角线构图', '框架构图', '过肩构图', '动势构图'];
const LENS_OPTS = ['广角', '标准', '中长焦', '长焦', '微距'];

function statusBadge(s: ArtifactStatus) {
  if (s === 'USER_APPROVED') return 'bg-success/15 text-success';
  if (s === 'USER_REJECTED') return 'bg-destructive/10 text-destructive';
  return 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
}
function statusLabel(s: ArtifactStatus) {
  if (s === 'USER_APPROVED') return '已确认';
  if (s === 'USER_REJECTED') return '已退回';
  return '待确认';
}

function Editable({ label, value, onChange, rows = 1 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] text-muted-foreground">{label}</span>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-y rounded border border-border bg-muted/30 px-2 py-1 font-sans text-[11px] leading-relaxed text-foreground outline-none transition-colors focus:border-primary/50 focus:bg-accent/20"
      />
    </label>
  );
}

function FieldSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-border bg-muted/30 px-2 py-1 text-[11px] text-foreground outline-none transition-colors focus:border-primary/50"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function SectionHead({ icon: Icon, title, hint }: { icon: typeof Info; title: string; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-foreground">
      <Icon className="h-3 w-3 text-primary" />
      {title}
      {hint && <span className="font-normal text-muted-foreground">{hint}</span>}
    </div>
  );
}

// 镜头网格卡片（顶部总览用）
function ShotGridCard({ card, active, onClick }: { card: ShotCard; active: boolean; onClick: () => void }) {
  const hasNewAssets = card.world.characters.length > 0;
  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative w-[150px] shrink-0 cursor-pointer rounded-lg border p-2 transition-all hover:border-primary/40 hover:shadow-sm',
        active ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border bg-card',
      )}
    >
      <div className="mb-1 flex items-center gap-1">
        <span className="font-mono text-[11px] font-bold text-primary">S{String(card.index).padStart(2, '0')}</span>
        <span className="ml-auto font-mono text-[9px] text-muted-foreground">{card.base.estSeconds}s</span>
      </div>
      <div className="mb-1 flex flex-wrap items-center gap-0.5">
        <span className={cn(
          'rounded px-1 py-0.5 text-[8px] font-medium',
          card.camera.shotSize === '特写' ? 'bg-rose-500/10 text-rose-400' :
          card.camera.shotSize === '近景' ? 'bg-amber-500/10 text-amber-400' :
          card.camera.shotSize === '中景' ? 'bg-blue-500/10 text-blue-400' :
          'bg-emerald-500/10 text-emerald-400'
        )}>{card.camera.shotSize}</span>
        {card.acting.dialog.length > 0 && <span className="rounded bg-violet-500/10 px-1 py-0.5 text-[8px] text-violet-400">对白</span>}
        {hasNewAssets && <span className="rounded bg-rose-500/10 px-1 py-0.5 text-[8px] text-rose-400" title="需新建资产">🔴资产</span>}
      </div>
      <p className="line-clamp-2 text-[9px] leading-relaxed text-foreground/60">{card.event.main}</p>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[8px] text-muted-foreground">{card.sceneLabel}</span>
        {card.status === 'USER_APPROVED' && <Check className="h-3 w-3 text-success" />}
        {card.status === 'USER_REJECTED' && <X className="h-3 w-3 text-destructive" />}
      </div>
    </div>
  );
}

// 核心字段编辑器（中间区域）
function CoreEditor({ card, onPatch, onConfirm }: { card: ShotCard; onPatch: (p: Partial<ShotCard>) => void; onConfirm: () => void }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [cannedId, setCannedId] = useState<string>('');

  const applyCanned = (id: string) => {
    setCannedId(id);
    if (!id) return;
    onPatch(applyCannedCamera(card, id));
    toast.info('已引用镜头语言条目，可继续微调');
  };

  return (
    <div className="flex h-full flex-col">
      {/* 编辑器头部 */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="font-mono text-sm font-bold text-primary">S{String(card.index).padStart(2, '0')}</span>
        <span className="text-[10px] text-muted-foreground">{card.sceneLabel}</span>
        <Badge className={cn('ml-auto text-[9px]', statusBadge(card.status))}>{statusLabel(card.status)}</Badge>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {/* 核心事件 */}
        <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
          <SectionHead icon={Film} title="核心视觉事件" hint="本镜头唯一主线" />
          <Editable label="主事件（一句话概括镜头核心）" value={card.event.main} rows={2} onChange={(v) => onPatch({ event: { ...card.event, main: v } })} />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-0.5 block text-[10px] text-muted-foreground">预计时长（秒）</span>
              <input
                type="number"
                min={1}
                max={60}
                value={card.base.estSeconds}
                onChange={(e) => onPatch({ base: { ...card.base, estSeconds: Number(e.target.value) || 1 } })}
                className="w-full rounded border border-border bg-muted/30 px-2 py-1 text-[11px] text-foreground outline-none focus:border-primary/50"
              />
            </label>
            <FieldSelect label="故事地点" value={card.base.location} options={[card.base.location, '室内', '室外', '游戏内']} onChange={(v) => onPatch({ base: { ...card.base, location: v } })} />
          </div>
        </div>

        {/* 摄影语言 */}
        <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
          <SectionHead icon={Camera} title="摄影语言" hint="景别/运镜/构图" />
          <label className="mb-2 block">
            <span className="mb-0.5 block text-[10px] text-muted-foreground">引用镜头语言（选择即填充）</span>
            <select value={cannedId} onChange={(e) => applyCanned(e.target.value)} className="w-full rounded border border-border bg-muted/30 px-2 py-1 text-[11px] text-foreground outline-none focus:border-primary/50">
              <option value="">— 手动设置 —</option>
              {CANNED_CAMERA_LANGUAGE.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.desc}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <FieldSelect label="标准景别" value={card.camera.shotSize} options={SHOT_SIZE_OPTS} onChange={(v) => onPatch({ camera: { ...card.camera, shotSize: v } })} />
            <FieldSelect label="相机运动" value={card.camera.movement} options={MOVEMENT_OPTS} onChange={(v) => onPatch({ camera: { ...card.camera, movement: v } })} />
            <FieldSelect label="构图方案" value={card.camera.composition} options={COMPOSITION_OPTS} onChange={(v) => onPatch({ camera: { ...card.camera, composition: v } })} />
            <FieldSelect label="镜头焦段" value={card.camera.lens} options={LENS_OPTS} onChange={(v) => onPatch({ camera: { ...card.camera, lens: v } })} />
          </div>
          <div className="mt-2">
            <Editable label="运镜目的" value={card.camera.movePurpose} onChange={(v) => onPatch({ camera: { ...card.camera, movePurpose: v } })} />
          </div>
        </div>

        {/* 表演与对白 */}
        <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
          <SectionHead icon={Mic} title="表演与对白" hint="情绪/台词" />
          <div className="grid grid-cols-2 gap-2">
            <Editable label="当前情绪" value={card.acting.emotion} onChange={(v) => onPatch({ acting: { ...card.acting, emotion: v } })} />
            <Editable label="肢体表现" value={card.acting.physical} onChange={(v) => onPatch({ acting: { ...card.acting, physical: v } })} />
          </div>
          {card.acting.dialog.length > 0 && (
            <div className="mt-2 space-y-1">
              <span className="text-[10px] text-muted-foreground">对白（原文不可改）</span>
              {card.acting.dialog.map((d, i) => (
                <div key={i} className="rounded bg-violet-500/5 px-2 py-1 text-[10px]">
                  <span className="font-medium text-violet-400">{d.speaker}：</span>
                  <span className="text-foreground/80">{d.line}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 高级设置（折叠） */}
        <div className="rounded-lg border border-border/70">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="flex w-full items-center gap-1.5 px-3 py-2 text-left"
          >
            <Sparkles className="h-3 w-3 text-primary" />
            <span className="text-[11px] font-medium">高级设置（世界状态/光影/因果链/自检）</span>
            <ChevronDown className={cn('ml-auto h-3 w-3 text-muted-foreground transition-transform', advancedOpen && 'rotate-180')} />
          </button>
          {advancedOpen && (
            <div className="space-y-3 border-t border-border/60 p-3">
              {/* 世界状态 */}
              <div>
                <SectionHead icon={Info} title="镜头内世界状态" />
                <Editable label="前置因果（进入本镜前发生了什么）" value={card.world.priorCause} rows={2} onChange={(v) => onPatch({ world: { ...card.world, priorCause: v } })} />
                <div className="mt-2 space-y-1">
                  {card.world.characters.map((c, i) => (
                    <div key={i} className="rounded bg-muted/30 px-2 py-1 text-[10px]">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground"> · {c.position} · 朝向{c.bodyFacing} · {c.emotion}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 光影色彩 */}
              <div>
                <SectionHead icon={Camera} title="光影色彩" />
                <div className="grid grid-cols-2 gap-2">
                  <Editable label="主光方向" value={card.visual.keyLight} onChange={(v) => onPatch({ visual: { ...card.visual, keyLight: v } })} />
                  <Editable label="色温" value={card.visual.colorTemp} onChange={(v) => onPatch({ visual: { ...card.visual, colorTemp: v } })} />
                  <Editable label="光线质感" value={card.visual.lightQuality} onChange={(v) => onPatch({ visual: { ...card.visual, lightQuality: v } })} />
                  <Editable label="整体色调" value={card.visual.overallTone} onChange={(v) => onPatch({ visual: { ...card.visual, overallTone: v } })} />
                </div>
              </div>

              {/* 剧情因果链 */}
              <div>
                <SectionHead icon={Link2} title="剧情因果链与收尾" />
                <div className="grid grid-cols-2 gap-2">
                  <Editable label="镜头产生结果" value={card.causal.outcome} onChange={(v) => onPatch({ causal: { ...card.causal, outcome: v } })} />
                  <Editable label="后续状态走向" value={card.causal.nextAffect} onChange={(v) => onPatch({ causal: { ...card.causal, nextAffect: v } })} />
                  <Editable label="镜头收尾快照（下镜继承源）" value={card.causal.endState} rows={2} onChange={(v) => onPatch({ causal: { ...card.causal, endState: v } })} />
                  <Editable label="前置必要状态" value={card.causal.priorNeeded} onChange={(v) => onPatch({ causal: { ...card.causal, priorNeeded: v } })} />
                </div>
              </div>

              {/* 自检清单 */}
              <div>
                <SectionHead icon={ClipboardCheck} title="镜头自检清单" />
                <div className="grid grid-cols-2 gap-1">
                  {card.checklist.map((c, i) => (
                    <label key={c.label} className="flex cursor-pointer items-center gap-1 text-[10px]">
                      <input
                        type="checkbox"
                        checked={c.ok}
                        onChange={() => {
                          const checklist = card.checklist.map((x, idx) => (idx === i ? { ...x, ok: !x.ok } : x));
                          onPatch({ checklist });
                        }}
                        className="h-3 w-3 accent-primary"
                      />
                      <span className={cn(c.ok ? 'text-success line-through' : 'text-muted-foreground')}>{c.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 底部操作 */}
      <div className="flex gap-2 border-t border-border p-3">
        <Button
          type="button"
          size="sm"
          className="flex-1"
          disabled={card.status === 'USER_APPROVED'}
          onClick={onConfirm}
        >
          <Check className="h-3.5 w-3.5" />
          确认镜头
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onPatch({ status: 'USER_REJECTED' })}>
          <X className="h-3.5 w-3.5" />
          退回
        </Button>
      </div>
    </div>
  );
}

// 右侧：资产需求 + 连续性 + 镜头卡摘要
function RightPanel({ card, prevCard, nextCard }: { card: ShotCard; prevCard: ShotCard | null; nextCard: ShotCard | null }) {
  const [tab, setTab] = useState<'assets' | 'continuity' | 'summary'>('assets');

  // 资产需求分析
  const characterAssets = card.world.characters.map((c) => ({ name: c.name, type: 'character', status: '需新建' as const }));
  const sceneAsset = { name: card.base.location, type: 'scene' as const, status: '需新建' as const };

  // 连续性检查
  const continuityMatch = prevCard ? prevCard.causal.endState === card.world.priorCause : true;

  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-border">
        {([
          { key: 'assets', label: '资产需求', icon: Film },
          { key: 'continuity', label: '连续性', icon: Link2 },
          { key: 'summary', label: '镜头卡', icon: Sparkles },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn('flex flex-1 items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium', tab === key ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground')}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {/* 资产需求 */}
        {tab === 'assets' && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-medium text-foreground/80">角色资产（{characterAssets.length}）</span>
                <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[9px] text-rose-400">需新建</span>
              </div>
              <div className="space-y-1">
                {characterAssets.map((c, i) => (
                  <div key={i} className="flex items-center gap-1.5 rounded bg-card px-2 py-1.5">
                    <div className="h-5 w-5 shrink-0 rounded bg-muted flex items-center justify-center">
                      <span className="text-[8px] text-muted-foreground">{c.name[0]}</span>
                    </div>
                    <span className="flex-1 truncate text-[10px]">{c.name}</span>
                    <span className="text-[8px] text-rose-400">待制作</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-medium text-foreground/80">场景资产</span>
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-400">需新建</span>
              </div>
              <div className="flex items-center gap-1.5 rounded bg-card px-2 py-1.5">
                <div className="h-5 w-5 shrink-0 rounded bg-muted flex items-center justify-center">
                  <Image className="h-3 w-3 text-muted-foreground" />
                </div>
                <span className="flex-1 truncate text-[10px]">{sceneAsset.name}</span>
                <span className="text-[8px] text-amber-400">待制作</span>
              </div>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5">
              <div className="mb-1 flex items-center gap-1">
                <Info className="h-3 w-3 text-primary" />
                <span className="text-[10px] font-medium text-primary">下游影响</span>
              </div>
              <p className="text-[9px] leading-relaxed text-muted-foreground">
                本镜需 {characterAssets.length} 个角色 + 1 个场景资产。确认分镜后，资产阶段将自动生成制作清单。
              </p>
            </div>
          </div>
        )}

        {/* 连续性 */}
        {tab === 'continuity' && (
          <div className="space-y-3">
            {/* 上镜收尾 */}
            {prevCard && (
              <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5">
                <div className="mb-1.5 flex items-center gap-1">
                  <ChevronLeft className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] font-medium text-foreground/70">上镜收尾（S{String(prevCard.index).padStart(2, '0')}）</span>
                </div>
                <p className="text-[9px] leading-relaxed text-muted-foreground">{prevCard.causal.endState || '未定义'}</p>
              </div>
            )}

            {/* 本镜前置 */}
            <div className={cn('rounded-lg border p-2.5', continuityMatch ? 'border-success/30 bg-success/5' : 'border-destructive/30 bg-destructive/5')}>
              <div className="mb-1.5 flex items-center gap-1">
                <span className="font-mono text-[10px] font-bold text-primary">S{String(card.index).padStart(2, '0')}</span>
                <span className="text-[10px] font-medium">本镜前置因果</span>
                {!continuityMatch && <span className="ml-auto text-[8px] text-destructive">⚠ 与上镜收尾不匹配</span>}
              </div>
              <p className="text-[9px] leading-relaxed text-foreground/80">{card.world.priorCause || '未定义'}</p>
            </div>

            {/* 本镜收尾 */}
            <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5">
              <div className="mb-1.5 flex items-center gap-1">
                <span className="font-mono text-[10px] font-bold text-primary">S{String(card.index).padStart(2, '0')}</span>
                <span className="text-[10px] font-medium text-foreground/70">本镜收尾（下镜继承源）</span>
              </div>
              <p className="text-[9px] leading-relaxed text-muted-foreground">{card.causal.endState || '未定义'}</p>
            </div>

            {/* 下一镜前置 */}
            {nextCard && (
              <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5">
                <div className="mb-1.5 flex items-center gap-1">
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] font-medium text-foreground/70">下一镜前置（S{String(nextCard.index).padStart(2, '0')}）</span>
                </div>
                <p className="text-[9px] leading-relaxed text-muted-foreground">{nextCard.world.priorCause || '未定义'}</p>
              </div>
            )}

            {/* 不可逆状态 */}
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-2.5">
              <div className="mb-1 flex items-center gap-1">
                <ShieldAlert className="h-3 w-3 text-destructive" />
                <span className="text-[10px] font-medium text-destructive">不可逆状态</span>
              </div>
              <p className="text-[9px] leading-relaxed text-muted-foreground">
                {card.causal.outcome || '本镜无不可逆状态变化'}
              </p>
            </div>
          </div>
        )}

        {/* 镜头卡摘要 */}
        {tab === 'summary' && (
          <div className="space-y-2">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5">
              <div className="mb-1.5 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-primary" />
                <span className="text-[10px] font-medium text-primary">镜头卡摘要（生产事实源）</span>
              </div>
              <p className="text-[10px] leading-relaxed text-foreground/80">
                本镜是完整的生产事实源，独立渲染不依赖AI记忆。视频生成阶段将根据选择的模型契约（MiniMax H3 / Seedance 2.5）转译为最终提示词。
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 rounded bg-muted/30 px-2 py-1">
                <Camera className="h-3 w-3 text-muted-foreground" />
                <span className="w-12 text-[9px] text-muted-foreground">摄影</span>
                <span className="text-[9px] text-foreground/70">{card.camera.shotSize} · {card.camera.movement} · {card.camera.composition}</span>
              </div>
              <div className="flex items-center gap-2 rounded bg-muted/30 px-2 py-1">
                <Film className="h-3 w-3 text-muted-foreground" />
                <span className="w-12 text-[9px] text-muted-foreground">人物</span>
                <span className="text-[9px] text-foreground/70">{card.world.characters.map((c) => c.name).join('、')}</span>
              </div>
              <div className="flex items-center gap-2 rounded bg-muted/30 px-2 py-1">
                <Mic className="h-3 w-3 text-muted-foreground" />
                <span className="w-12 text-[9px] text-muted-foreground">表演</span>
                <span className="text-[9px] text-foreground/70">{card.acting.emotion} · {card.acting.physical}</span>
              </div>
              <div className="flex items-center gap-2 rounded bg-muted/30 px-2 py-1">
                <span className="w-12 text-[9px] text-muted-foreground">光影</span>
                <span className="text-[9px] text-foreground/70">{card.visual.keyLight} · {card.visual.colorTemp}</span>
              </div>
              <div className="flex items-center gap-2 rounded bg-muted/30 px-2 py-1">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="w-12 text-[9px] text-muted-foreground">时长</span>
                <span className="text-[9px] text-foreground/70">{card.base.estSeconds}s · {card.base.location}</span>
              </div>
            </div>

            {card.acting.dialog.length > 0 && (
              <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-2">
                <div className="mb-1 text-[9px] font-medium text-violet-400">对白（原文不可改）</div>
                {card.acting.dialog.map((d, i) => (
                  <p key={i} className="text-[9px] text-foreground/70">{d.speaker}: {d.line}</p>
                ))}
              </div>
            )}

            <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
              <div className="mb-1 text-[9px] font-medium text-muted-foreground">核心视觉事件</div>
              <p className="text-[9px] leading-relaxed text-foreground/60">{card.event.main}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// 底部时间轴
function Timeline({ cards, activeId, onSelect }: { cards: ShotCard[]; activeId: string | null; onSelect: (id: string) => void }) {
  const total = cards.reduce((s, c) => s + (c.base.estSeconds || 0), 0);
  const approved = cards.filter((c) => c.status === 'USER_APPROVED').length;
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <Clock className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-medium">时间轴</span>
        <span className="text-[10px] text-muted-foreground">总时长 {total}s · {cards.length} 镜</span>
        <div className="ml-auto flex items-center gap-3 text-[9px]">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-success" />已确认 {approved}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-muted" />待确认 {cards.length - approved}</span>
        </div>
      </div>
      <div className="flex h-12 items-stretch gap-0.5 overflow-x-auto rounded-lg bg-muted/30 p-1">
        {cards.map((c) => {
          const width = Math.max((c.base.estSeconds / total) * 100, 4);
          const isActive = c.id === activeId;
          const isApproved = c.status === 'USER_APPROVED';
          const isRejected = c.status === 'USER_REJECTED';
          return (
            <div
              key={c.id}
              onClick={() => onSelect(c.id)}
              style={{ width: `${width}%` }}
              className={cn(
                'group relative flex min-w-[50px] cursor-pointer flex-col items-center justify-center rounded transition-all hover:opacity-80',
                isActive ? 'bg-primary ring-2 ring-primary/40' : isApproved ? 'bg-success/30 hover:bg-success/40' : isRejected ? 'bg-destructive/20' : 'bg-muted hover:bg-muted/80',
              )}
              title={`S${String(c.index).padStart(2, '0')} · ${c.base.estSeconds}s · ${c.event.main}`}
            >
              <span className={cn('font-mono text-[10px] font-bold', isActive ? 'text-primary-foreground' : 'text-foreground/70')}>
                S{String(c.index).padStart(2, '0')}
              </span>
              <span className={cn('text-[8px]', isActive ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                {c.base.estSeconds}s
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function BlockingStage({ episode }: { episode: Episode }) {
  const updateEpisode = useEpisodeStore((s) => s.updateEpisode);
  const upsertAssets = useAssetStore((s) => s.upsertAssets);
  const raw = episode.directing ?? [];
  if (raw.length > 0 && !('camera' in raw[0])) {
    updateEpisode(episode.id, { directing: buildDirecting(episode, episode.executionTarget) });
  }
  const cards: ShotCard[] = raw.filter((d): d is ShotCard => 'camera' in d);

  const [selectedId, setSelectedId] = useState<string | null>(cards[0]?.id ?? null);
  const [constraintsOpen, setConstraintsOpen] = useState(false);

  const counts = useMemo(() => {
    const c = { all: cards.length, USER_APPROVED: 0, AWAITING_USER: 0, USER_REJECTED: 0 };
    cards.forEach((x) => { c[x.status] += 1; });
    return c;
  }, [cards]);

  const activeCard = cards.find((c) => c.id === selectedId) ?? null;
  const activeIdx = activeCard ? cards.findIndex((c) => c.id === activeCard.id) : -1;

  // 分镜全部确认后，自动派生角色资产清单
  const allConfirmed = cards.length > 0 && counts.USER_APPROVED === cards.length;
  useEffect(() => {
    if (!allConfirmed) return;
    // 从分镜数据提取角色（过滤群体角色：队友/对手/敌人/群众/行人等泛指）
    const isGroupCharacter = (name: string) => {
      const groupPatterns = [
        '若干', '群', '众', '们', '路人', '观众', '士兵',
        '队友', '对手', '敌人', '敌方', '我方', '群众', '行人',
        '背景', 'NPC', 'npc', '路人甲', '路人乙', '配角',
        '其他', '其余', '剩下', '旁边', '周围',
      ];
      return groupPatterns.some((p) => name.includes(p));
    };
    const charMap = new Map<string, {
      count: number; scenes: Set<string>; emotions: Set<string>;
      bodyStates: Set<string>; costumeStates: Set<string>; positions: Set<string>;
    }>();
    cards.forEach((shot) => {
      shot.world.characters.forEach((ch) => {
        if (isGroupCharacter(ch.name)) return; // 过滤群体角色，不生成独立资产
        if (!charMap.has(ch.name)) {
          charMap.set(ch.name, { count: 0, scenes: new Set(), emotions: new Set(), bodyStates: new Set(), costumeStates: new Set(), positions: new Set() });
        }
        const entry = charMap.get(ch.name)!;
        entry.count += 1;
        entry.scenes.add(shot.sceneLabel);
        if (ch.emotion && ch.emotion !== '正常') entry.emotions.add(ch.emotion);
        if (ch.bodyState && ch.bodyState !== '正常') entry.bodyStates.add(ch.bodyState);
        if (ch.costumeState && ch.costumeState !== '正常') entry.costumeStates.add(ch.costumeState);
        if (ch.position) entry.positions.add(ch.position);
      });
    });
    if (charMap.size === 0) return;
    // 检查是否已存在同名资产
    const existing = useAssetStore.getState().assets.filter((a) => a.episodeId === episode.id && a.kind === 'character');
    const existingNames = new Set(existing.map((a) => a.name));
    const newAssets = Array.from(charMap.entries())
      .filter(([name]) => !existingNames.has(name))
      .map(([name, data], i) => {
        // 出场统计信息（从分镜提取，作为参考，不是角色描述）
        const appearanceInfo = [
          data.emotions.size > 0 ? `情绪变化：${Array.from(data.emotions).join('、')}` : '',
          data.costumeStates.size > 0 ? `服装变化：${Array.from(data.costumeStates).join('、')}` : '',
          data.bodyStates.size > 0 ? `身体状态：${Array.from(data.bodyStates).join('、')}` : '',
        ].filter(Boolean).join('；');

        // 通用提示词模板（不含风格，风格由项目全局风格统一注入）
        const prompt = [
          `${name}，角色立绘设定图`,
          '四视图身份资产：正面全身、90度侧面全身、背面全身、正面胸部以上脸部特写',
          '完整服装造型，细节清晰',
          '中性表情基线',
          '纯白色背景，Studio Lighting，无阴影，专业设定图风格',
          '双脚完全入镜，绝不裁切，横向多视图无分割线呈现',
          'masterpiece, best quality, ultra detailed, 8k',
        ].join(', ');

        // 负面提示词（规避常见瑕疵）
        const negativePrompt = [
          'low quality, blurry, distorted, deformed, watermark, text, signature',
          'extra fingers, missing fingers, fused fingers, too many fingers',
          'bad anatomy, bad proportions, missing limbs, extra limbs',
          'cropped, out of frame, cut off',
          'ugly, duplicate, morbid, mutilated',
          'shadow, dark background, cluttered background',
          'dynamic pose, action scene, environment, props',
        ].join(', ');

        return {
          id: `${episode.id}-char-auto-${Date.now().toString(36)}-${i}`,
          projectId: episode.projectId,
          episodeId: episode.id,
          kind: 'character' as const,
          name,
          description: '', // 角色描述留空，需要用户手动填写外貌/服装/性格等固有属性
          scope: 'episode' as const,
          sourceScene: `分镜自动派生（出场${data.count}镜，覆盖${data.scenes.size}场次）${appearanceInfo ? `；${appearanceInfo}` : ''}`,
          currentVersion: 1,
          versions: [{
            version: 1,
            prompt,
            negativePrompt,
            sha256: `auto-derived-${Date.now()}-${i}`,
            status: 'DRAFT' as const,
            createdAt: Date.now(),
          }],
          prompt,
          negativePrompt,
          status: 'DRAFT' as const,
          model: 'auto-derived-from-storyboard',
          stale: false,
          createdAt: Date.now(),
          source: 'local' as const,
        };
      });
    if (newAssets.length > 0) {
      upsertAssets(newAssets);
      const groupCount = cards.reduce((sum, shot) => sum + shot.world.characters.filter((ch) => isGroupCharacter(ch.name)).length, 0);
      toast.success(`分镜已锁定，派生 ${newAssets.length} 个角色资产${groupCount > 0 ? `（已过滤 ${groupCount} 个群体角色）` : ''}，请填写角色描述后生成`);
    }
  }, [allConfirmed, cards, episode.id, episode.projectId, upsertAssets]);

  useEffect(() => {
    if (!activeCard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && activeIdx > 0) setSelectedId(cards[activeIdx - 1].id);
      if (e.key === 'ArrowRight' && activeIdx < cards.length - 1) setSelectedId(cards[activeIdx + 1].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeCard, activeIdx, cards]);

  if (cards.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">
        分镜表尚未生成
      </div>
    );
  }

  const patchCards = (ids: string[], patch: Partial<ShotCard>) => {
    const cur = (useEpisodeStore.getState().episodes.find((e) => e.id === episode.id)?.directing ?? []) as ShotCard[];
    const next = cur.map((c) => (ids.includes(c.id) ? { ...c, ...patch } : c));
    updateEpisode(episode.id, { directing: next });
  };
  const patchCard = (id: string, patch: Partial<ShotCard>) => patchCards([id], patch);

  const handleConfirm = (id: string) => {
    patchCard(id, { status: 'USER_APPROVED' });
    const cur = (useEpisodeStore.getState().episodes.find((e) => e.id === episode.id)?.directing ?? []) as ShotCard[];
    const nextPending = cur.find((c) => c.status !== 'USER_APPROVED' && c.id !== id);
    if (nextPending) setSelectedId(nextPending.id);
  };

  const applyAutoCamera = () => {
    const cur = (useEpisodeStore.getState().episodes.find((e) => e.id === episode.id)?.directing ?? []) as ShotCard[];
    const next = cur.map((c) => ({ ...c, ...applyDefaultCamera(c) }));
    updateEpisode(episode.id, { directing: next });
    toast.success(`已为 ${next.length} 镜生成默认镜头语言`);
  };

  // 创建空白镜头（继承当前镜头的场景/角色基础信息）
  const createEmptyShot = (after: ShotCard, newIndex: number): ShotCard => ({
    id: `${episode.id}-shot-${Date.now().toString(36)}`,
    index: newIndex,
    sceneId: after.sceneId,
    sceneLabel: after.sceneLabel,
    base: {
      storyTime: after.base.storyTime,
      location: after.base.location,
      weather: after.base.weather,
      ratio: after.base.ratio,
      estSeconds: 5,
    },
    refs: { characters: [], scene: after.base.location, props: [], style: '项目全局风格', other: [] },
    world: {
      characters: after.world.characters.map((c) => ({ ...c })),
      props: [],
      sceneState: after.world.sceneState,
      timeState: after.world.timeState,
      weatherState: after.world.weatherState,
      lightingState: after.world.lightingState,
      priorCause: `承接上镜：${after.causal.endState || '上一镜收尾状态'}`,
    },
    event: {
      main: '',
      trigger: '',
      steps: [],
      complete: '',
      endPose: '',
    },
    acting: {
      characterId: after.acting.characterId,
      emotion: after.acting.emotion,
      intensity: '轻微',
      expression: '',
      breathing: '平稳',
      gaze: '',
      physical: '',
      dialog: [],
    },
    camera: {
      shotSize: '中景',
      angle: '平视',
      movement: '固定机位',
      composition: '三分构图',
      lens: '标准镜头',
      focus: '主体清晰',
    },
    visual: {
      keyLight: after.visual.keyLight,
      colorTemp: after.visual.colorTemp,
      shadow: '自然阴影',
      atmosphere: after.visual.atmosphere,
      groundState: '',
      windEffect: '无风',
    },
    audio: {
      ambient: after.audio.ambient,
      sfx: [],
      dialogue: [],
      reverb: '自然混响',
      sourcePosition: '',
    },
    causal: {
      priorCause: `承接上镜：${after.causal.endState || '上一镜收尾状态'}`,
      outcome: '',
      endState: '',
      irreversible: [],
    },
    constraints: [],
    checklist: HARD_CONSTRAINTS.map((label) => ({ label, ok: false })),
    prompt: '',
    status: 'PENDING',
  });

  // 插入镜头（在当前选中镜头之后）
  const insertShot = () => {
    if (!activeCard) {
      toast.error('请先选择一个镜头');
      return;
    }
    const cur = (useEpisodeStore.getState().episodes.find((e) => e.id === episode.id)?.directing ?? []) as ShotCard[];
    const insertIdx = activeIdx + 1;
    const newShot = createEmptyShot(activeCard, insertIdx + 1);
    const next = [
      ...cur.slice(0, insertIdx),
      newShot,
      ...cur.slice(insertIdx),
    ].map((c, i) => ({ ...c, index: i + 1 }));
    updateEpisode(episode.id, { directing: next });
    setSelectedId(newShot.id);
    toast.success(`已在 S${String(activeCard.index).padStart(2, '0')} 之后插入新镜头 S${String(newShot.index).padStart(2, '0')}`);
  };

  // 删除镜头
  const deleteShot = () => {
    if (!activeCard) {
      toast.error('请先选择一个镜头');
      return;
    }
    if (cards.length <= 1) {
      toast.error('至少保留一个镜头');
      return;
    }
    const cur = (useEpisodeStore.getState().episodes.find((e) => e.id === episode.id)?.directing ?? []) as ShotCard[];
    const next = cur
      .filter((c) => c.id !== activeCard.id)
      .map((c, i) => ({ ...c, index: i + 1 }));
    // 选中前一个或后一个
    const newSelected = next[Math.max(0, activeIdx - 1)];
    updateEpisode(episode.id, { directing: next });
    setSelectedId(newSelected?.id ?? null);
    toast.success(`已删除镜头 S${String(activeCard.index).padStart(2, '0')}，剩余 ${next.length} 镜`);
  };

  return (
    <div className="flex h-[calc(100vh-180px)] min-h-[600px] flex-col gap-3">
      {/* 顶部工具栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <Clapperboard className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">分镜设计</span>
        <span className="text-[11px] text-muted-foreground">镜头卡工作台</span>
        <Badge variant="outline" className="ml-auto font-mono text-[9px]">{counts.USER_APPROVED}/{cards.length} 已确认</Badge>
        <Button type="button" size="sm" variant="outline" onClick={insertShot} disabled={!activeCard} title="在当前镜头之后插入新镜头">
          <Plus className="h-3.5 w-3.5" />插入镜头
        </Button>
        <Button type="button" size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={deleteShot} disabled={!activeCard || cards.length <= 1} title="删除当前镜头">
          <Trash2 className="h-3.5 w-3.5" />删除镜头
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => { updateEpisode(episode.id, { directing: buildDirecting(episode, episode.executionTarget) }); toast.success('已按最新剧本重新生成分镜'); }}>
          <Wand2 className="h-3.5 w-3.5" />重新生成分镜
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={applyAutoCamera}>
          <Camera className="h-3.5 w-3.5" />应用自动镜头语言
        </Button>
        <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setConstraintsOpen((v) => !v)}>
          <ShieldAlert className="mr-1 h-3.5 w-3.5" />硬约束<ChevronDown className={cn('ml-1 h-3 w-3 transition-transform', constraintsOpen && 'rotate-180')} />
        </Button>
      </div>

      {constraintsOpen && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-destructive"><ShieldAlert className="h-3.5 w-3.5" />生成硬性约束</div>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-[10.5px] text-muted-foreground sm:grid-cols-2">
            {HARD_CONSTRAINTS.map((c) => <li key={c} className="flex gap-1.5"><span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-current" />{c}</li>)}
          </ul>
        </div>
      )}

      {/* 完成状态提示：所有镜头确认后显示 */}
      {cards.length > 0 && counts.USER_APPROVED === cards.length && (
        <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
          <div className="flex-1">
            <div className="text-xs font-medium text-success">分镜设计已完成</div>
            <div className="text-[10px] text-muted-foreground">全部 {cards.length} 个镜头已确认，可以进入角色资产阶段生成角色立绘与表演基调</div>
          </div>
          <Link to={`/comic/projects/${episode.projectId}/episodes/${episode.id}/characters`}>
            <Button type="button" size="sm" className="bg-success hover:bg-success/90 text-success-foreground">
              进入角色资产
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      )}

      {/* 镜头网格总览（横向滚动） */}
      <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-border bg-card p-2">
        <div className="flex shrink-0 items-center gap-1 pr-2">
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">镜头</span>
        </div>
        <div className="flex gap-2">
          {cards.map((c) => (
            <ShotGridCard key={c.id} card={c} active={c.id === selectedId} onClick={() => setSelectedId(c.id)} />
          ))}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>

      {/* 主体：中间编辑器 + 右侧资产/连续性/镜头卡 */}
      <div className="flex min-h-0 flex-1 gap-3">
        {/* 中间：核心编辑器 */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card">
          {activeCard ? (
            <CoreEditor card={activeCard} onPatch={(p) => patchCard(activeCard.id, p)} onConfirm={() => handleConfirm(activeCard.id)} />
          ) : (
            <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">从上方选择一个镜头</div>
          )}
        </div>

        {/* 右侧：资产需求 + 连续性 + 镜头卡摘要 */}
        <div className="w-[280px] shrink-0 overflow-hidden rounded-xl border border-border bg-card">
          {activeCard ? (
            <RightPanel
              card={activeCard}
              prevCard={activeIdx > 0 ? cards[activeIdx - 1] : null}
              nextCard={activeIdx < cards.length - 1 ? cards[activeIdx + 1] : null}
            />
          ) : <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">选择镜头后查看</div>}
        </div>
      </div>

      {/* 底部时间轴 */}
      <Timeline cards={cards} activeId={selectedId} onSelect={setSelectedId} />
    </div>
  );
}
