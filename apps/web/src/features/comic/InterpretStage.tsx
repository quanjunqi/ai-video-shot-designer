// EXPORTS: default InterpretStage
// 首次解读（5.1）：剧本核对（解析事实）→ 导演解读规则 + 解读文本模型 → 生成导演解读 → 用户确认解读
import { Link, useNavigate } from 'react-router-dom';
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, Check, Loader2, RefreshCw, BookOpenCheck, ListOrdered } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ScriptReview from '@/features/comic/ScriptReview';
import { useInterpretFlow, INTERPRET_STEPS, stashRealDirectorNote, stashRealDirectorInterpretation, startInterpretation } from '@/hooks/useInterpretFlow';
import type { DirectorInterpretation } from '@/types';
import { useEpisodeStore } from '@/stores/useEpisodeStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { usePromptRuleStore } from '@/stores/usePromptRuleStore';
import { resolvePromptRule } from '@/lib/ruleResolver';
import { parseScript } from '@/config/script/script-parser';
import { useTaskStore } from '@/stores/useTaskStore';
import { useAssetStore } from '@/stores/useAssetStore';
import StageModelPicker from '@/features/comic/StageModelPicker';
import { api } from '@/lib/api/client';
import type { Episode } from '@/types';
import { cn } from '@/lib/utils';

const STEP_PROGRESS_FALLBACK = 100 / INTERPRET_STEPS.length;

/** 将导演解读规则文本解析为「解读重点」和「解读产出」两栏；无法解析时返回 null */
function parseDirectorRule(content: string): { inputs: string[]; outputs: string[] } | null {
  const outputMatch = content.match(/[输产]出\s*[:：]/);
  if (!outputMatch || outputMatch.index === undefined) return null;
  const inputRaw = content.slice(0, outputMatch.index).replace(/^[^：:]*[：:]\s*/, '').replace(/[。.]\s*$/, '');
  const outputRaw = content.slice(outputMatch.index + outputMatch[0].length).replace(/[。.]\s*$/, '');
  // 按顿号/逗号/分号拆分，但忽略括号（）()【】内的分隔符
  const split = (t: string) => {
    const items: string[] = [];
    let depth = 0;
    let current = '';
    for (const ch of t) {
      if ('（(['.includes(ch)) depth++;
      if (')）]'.includes(ch)) depth--;
      if (depth === 0 && '、，,；;'.includes(ch)) {
        if (current.trim()) items.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) items.push(current.trim());
    return items;
  };
  const inputs = split(inputRaw);
  const outputs = split(outputRaw);
  if (inputs.length === 0 || outputs.length === 0) return null;
  return { inputs, outputs };
}

/** 内部术语 → 用户可读语言 */
function translateTerm(text: string): string {
  return text
    .replace(/\bEV\b/g, '事件')
    .replace(/\bDLG\b/g, '对白')
    .replace(/\bLOCK\b/g, '状态锁定')
    .replace(/事实提取/g, '解读重点')
    .replace(/创作层节拍分段/g, '剧情节拍分段')
    .replace(/平台层容量映射/g, '生成单元映射')
    .replace(/连续性锁定项/g, '需跨镜头保持一致的项');
}

export default function InterpretStage({ episode, projectId }: { episode: Episode; projectId: string }) {
  const { steps } = useInterpretFlow(episode.id);
  const navigate = useNavigate();
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  // 执行目标视频模型选项：从模型目录读取（enabled 视频模型，按起步单价低到高）
  // 注意：selector 只取稳定引用（models），派生计算放 useMemo，避免 filter/sort 新数组引用触发无限重渲染
  const catalogModels = useSettingsStore((s) => s.models);
  const [generating, setGenerating] = useState(false);
  // 导演解读规则（内联展示生效规则全文，默认展开可见内容；规则编辑在规则中心）
  const [showRule, setShowRule] = useState(true);
  const [showFacts, setShowFacts] = useState(false);
  const promptTemplates = usePromptRuleStore((s) => s.templates);
  const directorRule = resolvePromptRule(project ?? { promptRuleOverrides: undefined }, 'interpretation', promptTemplates);
  const job = useTaskStore((s) =>
    s.jobs.find((j) => j.episodeId === episode.id && j.kind === 'interpret' && j.status === 'running'),
  );
  const updateEpisode = useEpisodeStore((s) => s.updateEpisode);
  const markStale = useAssetStore((s) => s.markStale);

  // 解读任务运行中才显示进度；pending=已锁定待解读（引导区），needs_review=解读完成待确认
  const running = episode.status === 'analyzing' || (job !== undefined && job.status === 'running');
  const interp = episode.interpretation;

  // 生效解读文本模型：阶段覆盖 → 目录文本首项（文本无项目默认，首项即 PearAPI GPT 测试等可执行模型）
  const textModelId = useMemo(() => {
    const slot = episode.stageModels?.analyze as { text?: string } | undefined;
    if (slot?.text) return slot.text;
    return (
      catalogModels.find((m) => m.type === 'text' && m.status === 'enabled')?.id ?? ''
    );
  }, [episode.stageModels, catalogModels]);

  // 本集剧本文本（草稿优先，否则源版本切片）
  const scriptText = useMemo(() => {
    const source = project?.sourceVersions.find((v) => v.version === project.currentSourceVersion);
    const slice = source ? source.text.slice(episode.sourceSpan.start, episode.sourceSpan.end) : '';
    const base = slice.length >= 40 ? slice : source?.text.slice(0, 600) ?? '';
    return episode.scriptDraft ?? base;
  }, [episode, project]);

  const confirmTarget = async () => {
    // 解读前置：真实文本模型同步产出导演解读（质量交用户评审）；执行目标/视频模型/衔接后移至视频生产阶段
    if (!textModelId) {
      toast.error('未找到可用的解读文本模型，请先在模型配置启用文本模型');
      return;
    }
    setGenerating(true);
    let directorNote = '';
    let directorDI: DirectorInterpretation | null = null;
    try {
      // 三层提示词：角色职责与边界（System）→ 生效导演解读规则 → 输出契约（JSON Schema）+ 剧本
      const roleSystem =
        '你是「漫剧导演工作台」的导演解读专家。职责边界：' +
        '1) 只做本集导演解读与创作规划，不生成任何图片/视频/资产；' +
        '2) 不得改变剧情因果、人物动机、关键动作与台词原文；剧本未提供的事实只能作为假设并显式标注；' +
        '3) 不评判剧本或成片质量（质量由用户评审，你只负责解读与制片规划）；' +
        '4) 必须严格按照下方 JSON Schema 输出，只输出 JSON，不要任何解释文字、Markdown 代码块标记或前后缀。';
      const activeRule = directorRule
        ? `\n\n【本集生效的导演解读规则（必须严格执行，影响各板块内容深度与侧重点）】\n${directorRule.content}`
        : '';
      // 剧本事实层（解析产出 · 确定性提取，只可引用与组织，不可改写/编造）
      const ir = scriptText.trim() ? parseScript(scriptText) : null;
      const factLayer = ir && (ir.evs.length > 0 || ir.dlg.length > 0 || ir.locks.length > 0)
        ? [
            `场次清单：${ir.scenes.map((s) => `${s.label}${s.location ? `（${s.location}${s.time ? `/${s.time}` : ''}）` : ''}`).join('；') || '（未识别场次标记）'}`,
            `EV 事件：${ir.evs.slice(0, 8).join('；') || '（无动作事件行）'}`,
            `DLG 对白：${ir.dlg.slice(0, 8).join('；') || '（无对白行）'}`,
            `LOCK 连续性：${ir.locks.map((l) => l.text).join('；') || '（无状态线索）'}`,
          ].join('\n')
        : '（剧本事实层未解析到内容，请先核对剧本格式）';
      const jsonSchema = `{
  "directorNote": "一句话本集解读总结（50字以内）",
  "directorInterpretation": {
    "themeAndConflict": { "theme": "核心主题", "coreConflict": "核心冲突", "subtext": "潜台词/隐喻（可选）" },
    "characterArc": [
      { "character": "主要人物", "startingState": "开场状态", "endingState": "结尾状态", "motivation": "核心动机", "keyDecision": "关键决策/转变点（可选）" }
    ],
    "emotionalArc": {
      "overallMood": "整体情绪基调",
      "climax": "高潮位置（可选）",
      "beats": [{ "label": "节点名称", "emotion": "情绪", "intensity": 5 }]
    },
    "visualTone": { "colorPalette": "色彩方案", "lighting": "光线风格", "atmosphere": "氛围", "keyVisualMotif": "核心视觉母题（可选）", "colorNarrative": "色彩叙事：色彩随情绪/剧情如何转变（可选）", "lightingNarrative": "光线叙事：关键场景光线如何变化（可选）" },
    "rhythmDesign": { "overallPace": "整体节奏", "fastScenes": ["快节奏场次"], "slowScenes": ["慢节奏/停顿场次"] },
    "keySceneFocus": [
      { "scene": "场次", "directorIntent": "导演意图", "performanceNote": "表演要求（可选）", "cameraSuggestion": "镜头建议（可选）" }
    ],
    "narrativeStructure": {
      "actBreakdown": [{ "act": "起/承/转/合或第一幕/第二幕/第三幕", "scenes": "对应场次范围", "description": "本段叙事功能" }],
      "keyNodes": [{ "type": "激励事件/第一转折/中点/第二转折/高潮/结局", "location": "场次位置", "description": "节点说明" }],
      "storylines": [{ "name": "故事线名称", "progression": "本集进展（可选）" }]
    },
    "scenePriorityAndTransitions": {
      "keyScenes": [{ "scene": "关键场次", "reason": "为什么必须精心设计" }],
      "transitionScenes": ["过渡/可简化场次（可选）"],
      "transitions": [{ "from": "出场次", "to": "入场次", "method": "硬切/叠化/声音桥/匹配剪辑" }]
    },
    "performanceDirection": {
      "characterTone": [{ "character": "角色", "tone": "表演基调（内敛/外放/克制/爆发等）", "keyMoment": "关键表演时刻（可选）" }],
      "interactionNotes": ["角色互动方式/对手戏张力方向（可选）"]
    },
    "soundDesign": { "ambient": "环境声", "keySoundEffects": ["关键音效（可选）"], "musicMood": "音乐情绪（可选）", "silenceMoments": ["静默时刻（可选）"] }
  }
}`;
      const outputContract =
        '\n\n【输出格式（严格输出以下 JSON，不要任何其他文字）】\n' +
        jsonSchema +
        '\n\n【导演决策原则】\n' +
        '1. 遇到剧本模糊点（如呈现方式、视觉细节、角色状态），直接做出合理决策并写入对应板块，不要列"待确认项"\n' +
        '2. 视觉呈现问题写入 visualTone；场景处理问题写入 keySceneFocus；节奏问题写入 rhythmDesign\n' +
        '3. 所有决策必须基于剧本事实层，不得编造剧本未提供的剧情事实\n' +
        '\n\n【剧本事实层（解析产出 · 只可引用与组织，不可改写/增删/编造）】\n' +
        factLayer +
        '\n\n【单集剧本】\n' +
        (scriptText || '（剧本缺失）');
      const prompt = roleSystem + activeRule + outputContract;
      const res = await api.runModelTest(textModelId, {
        messages: [{ role: 'user', content: prompt }],
      });
      const note = res.run?.extracted?.['choices.0.message.content'];
      if (res.ok && typeof note === 'string' && note.trim()) {
        const raw = note.trim();
        // 解析 JSON：支持纯 JSON 或被 ```json 包裹的情况
        const jsonStr = raw.startsWith('```')
          ? raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
          : raw;
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.directorNote) directorNote = String(parsed.directorNote);
          if (parsed.directorInterpretation && typeof parsed.directorInterpretation === 'object') {
            directorDI = parsed.directorInterpretation as DirectorInterpretation;
          }
          // 如果 JSON 解析成功但 directorNote 为空，用 JSON 整体作为备注
          if (!directorNote) directorNote = jsonStr.slice(0, 500);
        } catch {
          // JSON 解析失败：降级为自由文本，结构化板块留空（UI 会显示占位+降级）
          directorNote = raw;
        }
      }
    } catch {
      setGenerating(false);
      // 真实调用失败不伪造：中止，用户可换文本模型或稍后重试
      toast.error('导演解读文本模型调用失败，请检查渠道/模型配置后重试');
      return;
    }
    setGenerating(false);
    if (!directorNote || directorNote.trim().length < 10) {
      // 上游偶发输出截断（过短内容无解读价值）：不伪造，提示换模型/重试
      toast.error('解读结果异常（内容过短，可能被上游截断），请更换解读文本模型或稍后重试');
      return;
    }
    // 真实解读原文 + 结构化数据暂存，并直接启动解读任务
    stashRealDirectorNote(episode.id, directorNote);
    if (directorDI) stashRealDirectorInterpretation(episode.id, directorDI);
    const started = startInterpretation(episode.id);
    if (started) {
      toast.success(directorDI ? '导演解读已真实生成（结构化），正在整理解读产物' : '导演解读已真实生成，正在整理解读产物');
    } else {
      toast.success('导演解读已真实生成');
    }
  };

  const confirmInterpretation = () => {
    updateEpisode(episode.id, { interpretationConfirmed: true });
    toast.success('解读产物已确认，进入分镜设计阶段');
    navigate(`/comic/projects/${projectId}/episodes/${episode.id}/directing`);
  };

  const handleRetry = () => {
    // 重新解读：清解读产物与导演阶段产物 + 重置状态；旧资产标 STALE（下游影响）
    const staleAssets = useAssetStore.getState().assets.filter((a) => a.episodeId === episode.id);
    staleAssets.forEach((a) => markStale(a.id));
    updateEpisode(episode.id, {
      interpretation: undefined,
      interpretationConfirmed: false,
      executionTarget: undefined,
      performance: undefined,
      sceneVariants: undefined,
      directing: undefined,
      executableUnits: undefined,
      status: 'pending',
      counts: { scenes: 0, characters: 0, pendingReview: 0 },
    });
    toast.info('已重置解读，旧资产标记为 STALE');
  };

  // 未解读：第 1 步剧本核对 → 第 2 步导演解读规则 → 第 3 步解读文本模型 → 确认并生成解读
  if (!interp) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-6">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-3xs font-bold text-primary-foreground">1</span>
          <span className="text-sm font-medium">剧本核对</span>
          <span className="text-2xs text-muted-foreground">查看本集剧本，判断是否需要编辑；源剧本为不可变版本</span>
        </div>
        <ScriptReview episode={episode} projectId={projectId} />

        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-3xs font-bold text-primary-foreground">2</span>
          <span className="text-sm font-medium">导演解读规则</span>
          <span className="text-2xs text-muted-foreground">本次解读将按生效规则执行；编辑规则请到规则中心</span>
        </div>
        {directorRule && (() => {
          const parsed = parseDirectorRule(directorRule.content);
          const isBuiltin = directorRule.builtin && !project?.promptRuleOverrides?.interpretation;
          return (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {/* 标题行 */}
              <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5">
                <BookOpenCheck className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{directorRule.name}</span>
                <span className={cn(
                  'shrink-0 rounded px-1.5 py-0.5 text-3xs',
                  isBuiltin ? 'bg-muted/60 text-muted-foreground' : 'bg-primary/10 text-primary',
                )}>
                  {isBuiltin ? '平台默认' : '已覆盖'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowRule((v) => !v)}
                  className="shrink-0 text-3xs text-muted-foreground hover:text-foreground"
                >
                  {showRule ? '收起' : '完整规则'}
                </button>
              </div>

              {/* 结构化展示：解读重点 + 解读产出 */}
              {parsed ? (
                <div className="grid grid-cols-2 gap-0">
                  <div className="border-r border-border/60 p-3">
                    <div className="mb-1.5 flex items-center gap-1 text-3xs font-medium uppercase tracking-wide text-primary">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      解读重点
                    </div>
                    <ul className="space-y-1">
                      {parsed.inputs.map((item, i) => (
                        <li key={i} className="flex gap-1.5 text-2xs leading-relaxed text-muted-foreground">
                          <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
                          <span>{translateTerm(item)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-3">
                    <div className="mb-1.5 flex items-center gap-1 text-3xs font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      解读产出
                    </div>
                    <ul className="space-y-1">
                      {parsed.outputs.map((item, i) => (
                        <li key={i} className="flex gap-1.5 text-2xs leading-relaxed text-muted-foreground">
                          <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
                          <span>{translateTerm(item)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="p-3">
                  <p className="text-2xs leading-relaxed text-muted-foreground">{translateTerm(directorRule.content)}</p>
                </div>
              )}

              {/* 完整规则（折叠） */}
              {showRule && (
                <div className="border-t border-border/60 bg-muted/30 px-3 py-2.5">
                  <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap font-sans text-3xs leading-relaxed text-muted-foreground">
                    {directorRule.content}
                  </pre>
                </div>
              )}

              {/* 底部操作引导 */}
              <div className="flex items-center justify-between border-t border-border/60 px-3 py-2">
                <span className="text-3xs text-muted-foreground">想调整解读侧重点？</span>
                <Link to="/comic/rules" className="text-3xs font-medium text-primary hover:underline">
                  去规则中心自定义 →
                </Link>
              </div>
            </div>
          );
        })()}

        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-3xs font-bold text-primary-foreground">3</span>
          <span className="text-sm font-medium">解读文本模型</span>
          <span className="ml-auto text-2xs text-muted-foreground">每阶段可随时换模型</span>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <StageModelPicker
            stage="analyze"
            type="text"
            label="解读文本模型"
            episodeId={episode.id}
            hint="导演解读由真实文本模型生成，可随时更换"
          />
          <p className="mt-2 text-2xs text-muted-foreground">
            解读由所选文本模型真实调用生成；质量由你评审，系统只负责制片。
          </p>
        </div>
        <div className="flex items-center justify-end gap-3">
          {!episode.scriptChecked && (
            <span className="text-2xs text-amber-600 dark:text-amber-400">请先核对剧本（第 1 步）再生成解读</span>
          )}
          <Button type="button" size="sm" disabled={!episode.scriptChecked || generating} onClick={confirmTarget}>
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {generating ? '解读生成中…' : '确认并生成解读'}
            {!generating && <ArrowRight className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    );
  }

  if (running) {
    const progress = job?.progress ?? (episode.status === 'analyzing' ? STEP_PROGRESS_FALLBACK : 0);
    return (
      <div className="mx-auto max-w-lg py-10">
        <div className="mb-4 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-sm font-medium">正在运行导演解读任务</span>
          <span className="ml-auto font-mono text-3xs text-muted-foreground">{progress}%</span>
        </div>
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full bg-primary"
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ ease: 'easeOut', duration: 0.3 }}
          />
        </div>
        <div className="space-y-2">
          {steps.map((s, i) => {
            const done = progress >= (i + 1) * (100 / steps.length);
            const active = !done && progress < (i + 1) * (100 / steps.length) && (i === 0 || progress >= i * (100 / steps.length));
            return (
              <div
                key={s.label}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs',
                  done ? 'border-success/30 bg-success/5' : active ? 'border-primary/40 bg-accent/40' : 'border-border text-muted-foreground',
                )}
              >
                {done ? (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-success text-success-foreground">
                    <Check className="h-3 w-3" />
                  </span>
                ) : active ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <span className="h-4 w-4 rounded-full border border-border" />
                )}
                <span className={cn(done && 'text-success')}>{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (!interp) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        解读任务尚未开始或已重置
        <div className="mt-3">
          <Button type="button" variant="outline" size="sm" onClick={handleRetry}>
            <RefreshCw className="h-3.5 w-3.5" />
            重新解读
          </Button>
        </div>
      </div>
    );
  }

  const di = interp.directorInterpretation;

  return (
    <div className="space-y-4">
      {/* 顶部状态条 */}
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        <BookOpenCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
        导演解读已生成，请核对以下创作决策；确认后进入分镜设计
        {episode.interpretationConfirmed && (
          <Badge className="ml-auto bg-success/15 text-success">
            <Check className="h-3 w-3" />
            已确认
          </Badge>
        )}
      </div>

      {/* ═══════ 导演创作决策（6 个核心板块，直接服务分镜与视频生成）═══════ */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <span className="text-3xs font-bold uppercase tracking-widest text-primary">导演创作决策</span>
          <span className="h-px flex-1 bg-border" />
          <span className="text-3xs text-muted-foreground">文本模型产出 · 质量交用户评审</span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {/* 1. 主题与核心冲突 */}
          <InterpretCard icon="💡" title="主题与核心冲突" hasContent={Boolean(di?.themeAndConflict)}>
            {di?.themeAndConflict ? (
              <div className="space-y-2">
                <Field label="核心主题" value={di.themeAndConflict.theme} />
                <Field label="核心冲突" value={di.themeAndConflict.coreConflict} />
                {di.themeAndConflict.subtext && <Field label="潜台词" value={di.themeAndConflict.subtext} />}
              </div>
            ) : <EmptyHint />}
          </InterpretCard>

          {/* 2. 人物弧光与动机 */}
          <InterpretCard icon="🎭" title="人物弧光与动机" hasContent={Boolean(di?.characterArc?.length)}>
            {di?.characterArc?.length ? (
              <div className="space-y-2">
                {di.characterArc.map((c, i) => (
                  <div key={i} className="rounded-lg bg-muted/30 p-2">
                    <div className="mb-1 text-2xs font-medium">{c.character}</div>
                    <Field label="开场状态" value={c.startingState} />
                    <Field label="结尾状态" value={c.endingState} />
                    <Field label="核心动机" value={c.motivation} />
                    {c.keyDecision && <Field label="关键决策" value={c.keyDecision} />}
                  </div>
                ))}
              </div>
            ) : <EmptyHint />}
          </InterpretCard>

          {/* 3. 情绪弧线 */}
          <InterpretCard icon="🌊" title="情绪弧线" hasContent={Boolean(di?.emotionalArc || interp.lookAndFeel?.moodArc)}>
            {di?.emotionalArc ? (
              <div className="space-y-2">
                <Field label="整体情绪" value={di.emotionalArc.overallMood} />
                {di.emotionalArc.climax && <Field label="高潮位置" value={di.emotionalArc.climax} />}
                <div className="space-y-1">
                  {di.emotionalArc.beats.map((b, i) => (
                    <div key={i} className="flex items-center gap-2 text-2xs">
                      <span className="w-2 h-2 rounded-full bg-primary/60" />
                      <span className="font-medium">{b.label}</span>
                      <span className="text-muted-foreground">{b.emotion}</span>
                      <span className="ml-auto font-mono text-3xs">{b.intensity}/10</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : interp.lookAndFeel?.moodArc ? (
              <Field label="情绪弧线" value={interp.lookAndFeel.moodArc} />
            ) : <EmptyHint />}
          </InterpretCard>

          {/* 4. 视觉基调（直接指导图片/视频生成） */}
          <InterpretCard icon="🎨" title="视觉基调" hasContent={Boolean(di?.visualTone || interp.lookAndFeel)}>
            {di?.visualTone ? (
              <div className="space-y-2">
                <Field label="色彩方案" value={di.visualTone.colorPalette} />
                <Field label="光线风格" value={di.visualTone.lighting} />
                <Field label="氛围" value={di.visualTone.atmosphere} />
                {di.visualTone.keyVisualMotif && <Field label="视觉母题" value={di.visualTone.keyVisualMotif} />}
                {di.visualTone.colorNarrative && <Field label="色彩叙事" value={di.visualTone.colorNarrative} />}
                {di.visualTone.lightingNarrative && <Field label="光线叙事" value={di.visualTone.lightingNarrative} />}
              </div>
            ) : interp.lookAndFeel ? (
              <div className="space-y-2">
                <Field label="影调" value={interp.lookAndFeel.tone} />
                <Field label="节奏曲线" value={interp.lookAndFeel.rhythmCurve} />
              </div>
            ) : <EmptyHint />}
          </InterpretCard>

          {/* 5. 节奏设计（指导单元划分与剪辑） */}
          <InterpretCard icon="⏱️" title="节奏设计" hasContent={Boolean(di?.rhythmDesign || interp.coverage?.beats?.length)}>
            {di?.rhythmDesign ? (
              <div className="space-y-2">
                <Field label="整体节奏" value={di.rhythmDesign.overallPace} />
                {di.rhythmDesign.fastScenes.length > 0 && <Field label="快节奏场次" value={di.rhythmDesign.fastScenes.join('、')} />}
                {di.rhythmDesign.slowScenes.length > 0 && <Field label="慢节奏/停顿" value={di.rhythmDesign.slowScenes.join('、')} />}
              </div>
            ) : interp.coverage?.beats?.length ? (
              <div className="space-y-1">
                <p className="text-3xs text-muted-foreground mb-1">叙事节拍</p>
                {interp.coverage.beats.map((b, i) => (
                  <div key={b.id} className="flex items-center gap-2 text-2xs">
                    <span className="w-4 h-4 flex items-center justify-center rounded-full bg-muted font-mono text-4xs">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{b.label}</span>
                    <span className="font-mono text-3xs text-muted-foreground">{b.beatSeconds}s</span>
                  </div>
                ))}
              </div>
            ) : <EmptyHint />}
          </InterpretCard>

          {/* 6. 关键场景处理重点（直接指导分镜设计） */}
          <InterpretCard icon="🎯" title="关键场景处理重点" hasContent={Boolean(di?.keySceneFocus?.length)}>
            {di?.keySceneFocus?.length ? (
              <div className="space-y-2">
                {di.keySceneFocus.map((k, i) => (
                  <div key={i} className="rounded-lg bg-muted/30 p-2">
                    <div className="mb-1 text-2xs font-medium">{k.scene}</div>
                    <Field label="导演意图" value={k.directorIntent} />
                    {k.performanceNote && <Field label="表演要求" value={k.performanceNote} />}
                    {k.cameraSuggestion && <Field label="镜头建议" value={k.cameraSuggestion} />}
                  </div>
                ))}
              </div>
            ) : <EmptyHint />}
          </InterpretCard>

          {/* 7. 叙事结构与关键节点（指导分镜镜头量分配） */}
          <InterpretCard icon="🏗️" title="叙事结构与关键节点" hasContent={Boolean(di?.narrativeStructure)}>
            {di?.narrativeStructure ? (
              <div className="space-y-2">
                <div>
                  <div className="mb-1 text-3xs font-medium text-muted-foreground">起承转合</div>
                  <div className="space-y-1">
                    {di.narrativeStructure.actBreakdown.map((a, i) => (
                      <div key={i} className="flex gap-2 text-2xs">
                        <span className="w-12 shrink-0 font-medium text-primary">{a.act}</span>
                        <span className="w-16 shrink-0 font-mono text-3xs text-muted-foreground">{a.scenes}</span>
                        <span className="min-w-0 flex-1">{a.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-3xs font-medium text-muted-foreground">关键节点</div>
                  <div className="space-y-1">
                    {di.narrativeStructure.keyNodes.map((n, i) => (
                      <div key={i} className="flex gap-2 text-2xs">
                        <span className="w-16 shrink-0 rounded bg-primary/10 px-1 py-0.5 text-center text-3xs font-medium text-primary">{n.type}</span>
                        <span className="w-12 shrink-0 font-mono text-3xs text-muted-foreground">{n.location}</span>
                        <span className="min-w-0 flex-1">{n.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {di.narrativeStructure.storylines?.length > 0 && (
                  <div>
                    <div className="mb-1 text-3xs font-medium text-muted-foreground">故事线</div>
                    <div className="space-y-1">
                      {di.narrativeStructure.storylines.map((s, i) => (
                        <div key={i} className="flex gap-2 text-2xs">
                          <span className="w-16 shrink-0 font-medium">{s.name}</span>
                          <span className="min-w-0 flex-1 text-muted-foreground">{s.progression}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : <EmptyHint />}
          </InterpretCard>

          {/* 8. 场景优先级与转场策略 */}
          <InterpretCard icon="🎬" title="场景优先级与转场" hasContent={Boolean(di?.scenePriorityAndTransitions)}>
            {di?.scenePriorityAndTransitions ? (
              <div className="space-y-2">
                <div>
                  <div className="mb-1 text-3xs font-medium text-rose-600">关键场景（精心设计）</div>
                  <div className="space-y-1">
                    {di.scenePriorityAndTransitions.keyScenes.map((k, i) => (
                      <div key={i} className="flex gap-2 text-2xs">
                        <span className="w-20 shrink-0 font-medium">{k.scene}</span>
                        <span className="min-w-0 flex-1 text-muted-foreground">{k.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {di.scenePriorityAndTransitions.transitionScenes?.length > 0 && (
                  <Field label="过渡场景" value={di.scenePriorityAndTransitions.transitionScenes.join('、')} />
                )}
                <div>
                  <div className="mb-1 text-3xs font-medium text-muted-foreground">转场策略</div>
                  <div className="space-y-1">
                    {di.scenePriorityAndTransitions.transitions.map((t, i) => (
                      <div key={i} className="flex items-center gap-1 text-2xs">
                        <span className="font-medium">{t.from}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-medium">{t.to}</span>
                        <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-3xs">{t.method}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : <EmptyHint />}
          </InterpretCard>

          {/* 9. 表演指导要点 */}
          <InterpretCard icon="🎭" title="表演指导要点" hasContent={Boolean(di?.performanceDirection)}>
            {di?.performanceDirection ? (
              <div className="space-y-2">
                <div className="space-y-1">
                  {di.performanceDirection.characterTone.map((c, i) => (
                    <div key={i} className="rounded-lg bg-muted/30 p-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xs font-medium">{c.character}</span>
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-3xs text-primary">{c.tone}</span>
                      </div>
                      {c.keyMoment && <p className="mt-1 text-3xs text-muted-foreground">关键表演：{c.keyMoment}</p>}
                    </div>
                  ))}
                </div>
                {di.performanceDirection.interactionNotes?.length > 0 && (
                  <div>
                    <div className="mb-1 text-3xs font-medium text-muted-foreground">对手戏张力</div>
                    <ul className="space-y-0.5">
                      {di.performanceDirection.interactionNotes.map((n, i) => (
                        <li key={i} className="flex gap-2 text-2xs">
                          <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                          <span>{n}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : <EmptyHint />}
          </InterpretCard>
        </div>
      </div>

      {/* ═══════ 剧本事实依据（系统提取，折叠，不占主视觉）═══════ */}
      <div className="rounded-xl border border-border/60 bg-muted/20">
        <button
          type="button"
          onClick={() => setShowFacts((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs text-muted-foreground hover:text-foreground"
        >
          <ListOrdered className="h-3.5 w-3.5" />
          剧本事实依据（场次 / EV / DLG / LOCK · 系统提取）
          <span className="ml-auto text-3xs">{showFacts ? '收起' : '展开'}</span>
        </button>
        {showFacts && (
          <div className="border-t border-border/60 p-4 space-y-3">
            {/* 场次清单 */}
            <div>
              <div className="mb-1.5 text-3xs font-medium uppercase text-muted-foreground">场次清单（{interp.breakdown?.length ?? 0} 场）</div>
              <div className="space-y-1">
                {(interp.breakdown ?? []).map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2 rounded bg-card px-2 py-1.5 text-2xs">
                    <span className="w-8 shrink-0 font-mono text-3xs text-muted-foreground">{s.label.split('·')[0]?.trim() || `${i + 1}`}</span>
                    <span className="min-w-0 flex-1 truncate">{s.label.split('·').slice(1).join('·').trim() || s.label}</span>
                    <span className="shrink-0 font-mono text-3xs text-muted-foreground">{s.span}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* EV / DLG / LOCK 三栏 */}
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div className="rounded bg-card p-2">
                <div className="mb-1 text-3xs font-medium text-blue-600">EV 事件</div>
                <div className="space-y-0.5">
                  {interp.rawFacts?.filter((f) => f.label === 'EV').map((f, i) => (
                    <p key={i} className="text-3xs leading-relaxed text-muted-foreground">{f.text}</p>
                  ))}
                  {!interp.rawFacts?.some((f) => f.label === 'EV') && <p className="text-3xs text-muted-foreground/40">无</p>}
                </div>
              </div>
              <div className="rounded bg-card p-2">
                <div className="mb-1 text-3xs font-medium text-emerald-600">DLG 对白</div>
                <div className="space-y-0.5">
                  {interp.rawFacts?.filter((f) => f.label === 'DLG').map((f, i) => (
                    <p key={i} className="text-3xs leading-relaxed text-muted-foreground">{f.text}</p>
                  ))}
                  {!interp.rawFacts?.some((f) => f.label === 'DLG') && <p className="text-3xs text-muted-foreground/40">无</p>}
                </div>
              </div>
              <div className="rounded bg-card p-2">
                <div className="mb-1 text-3xs font-medium text-amber-600">LOCK 连续性</div>
                <div className="space-y-0.5">
                  {interp.rawFacts?.filter((f) => f.label === 'LOCK').map((f, i) => (
                    <p key={i} className="text-3xs leading-relaxed text-muted-foreground">{f.text}</p>
                  ))}
                  {!interp.rawFacts?.some((f) => f.label === 'LOCK') && <p className="text-3xs text-muted-foreground/40">无</p>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部操作 */}
      <div className="flex items-center gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" size="sm" onClick={handleRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          重新解读
        </Button>
        {episode.interpretationConfirmed ? (
          <Link to={`/comic/projects/${projectId}/episodes/${episode.id}/directing`} className="ml-auto">
            <Button type="button" size="sm">
              进入分镜设计
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        ) : (
          <>
            <span className="ml-auto text-2xs text-muted-foreground">确认创作决策后推进分镜设计</span>
            <Button type="button" size="sm" onClick={confirmInterpretation}>
              <Check className="h-3.5 w-3.5" />
              确认解读
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function InterpretCard({ icon, title, hasContent, children }: {
  icon: string;
  title: string;
  hasContent: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn(
      'rounded-xl border bg-card p-4 transition-colors',
      hasContent ? 'border-border' : 'border-border/40 opacity-70',
    )}>
      <div className="mb-3 flex items-center gap-2 text-xs font-medium">
        <span className="text-sm">{icon}</span>
        {title}
        {!hasContent && <span className="ml-auto text-4xs text-muted-foreground/50">待生成</span>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-2xs leading-relaxed">
      <span className="w-16 shrink-0 text-muted-foreground/70">{label}</span>
      <span className="min-w-0 flex-1 text-foreground/90">{value}</span>
    </div>
  );
}

function EmptyHint() {
  return <p className="text-2xs text-muted-foreground/40">后端结构化解读尚未输出，当前为占位状态</p>;
}
