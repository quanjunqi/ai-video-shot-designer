// EXPORTS: default ScriptReview
// analyze 第 1 步：本集剧本查看/编辑。源剧本为不可变源版本（切片展示）；
// 编辑保存 = 同步到源剧本（产生新版本 v+1 留档，后续剧集 span 自动重映射）；已有解读产物时展示下游影响预览并让用户决定是否重试解读。
import { useState } from 'react';
import { FileText, Pencil, Check, Save, X, AlertTriangle, RefreshCw, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useEpisodeStore } from '@/stores/useEpisodeStore';
import { useProjectStore } from '@/stores/useProjectStore';
import type { Episode } from '@/types';

export default function ScriptReview({
  episode,
  projectId,
  onRetry,
  readOnly = false,
}: {
  episode: Episode;
  projectId: string;
  onRetry?: () => void;
  readOnly?: boolean;
}) {
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const updateEpisode = useEpisodeStore((s) => s.updateEpisode);
  const reviseEpisodeScript = useEpisodeStore((s) => s.reviseEpisodeScript);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [showImpact, setShowImpact] = useState(false);

  const source = project?.sourceVersions.find((v) => v.version === project.currentSourceVersion);
  const sliceText = source ? source.text.slice(episode.sourceSpan.start, episode.sourceSpan.end) : '';
  const fallback = source ? source.text.slice(0, 600) : '（项目源剧本缺失）';
  const baseText = sliceText.length >= 40 ? sliceText : fallback; // 范围过短/越界时兜底展示
  const display = episode.scriptDraft ?? baseText;
  const sourceHash = source?.hash.slice(0, 12) ?? '—';

  // 下游影响清单：仅列出本集已存在的产物（剧本变更是事实源变更 → 全部依赖产物需重跑）
  const impactItems = [
    episode.interpretation && {
      label: '导演解读',
      desc: 'EV/DLG/LOCK 提取、场次清单与覆盖两段式基于原剧本',
      status: episode.interpretationConfirmed ? '已确认 → 将失效' : '待确认',
    },
    episode.performance && { label: '角色表演基调', desc: '由解读派生，每角色一条', status: '待复核' },
    episode.sceneVariants && { label: '场次状态变体', desc: '时间 / 天气 / 光线 / 氛围差异', status: '待复核' },
    episode.directing && { label: '分镜设计', desc: '走位 / 机位 / 剪辑 / 节奏表', status: '待复核' },
    episode.executableUnits && { label: '可执行单元与 Prompt', desc: '单元打包与目标模型 Prompt', status: '待复核' },
    episode.production && { label: '生产 Take', desc: '已采纳 Take 与连续性台账', status: '受上游影响' },
  ].filter(Boolean) as { label: string; desc: string; status: string }[];

  const startEdit = () => {
    setDraft(episode.scriptDraft ?? baseText);
    setEditing(true);
  };

  const saveDraft = () => {
    if (!draft.trim()) {
      toast.error('剧本内容不能为空');
      return;
    }
    // 同步到源剧本：产生新版本 v+1 留档，该集 span 更新，后续剧集 span 自动重映射
    reviseEpisodeScript(episode.id, draft);
    updateEpisode(episode.id, { scriptChecked: false });
    setEditing(false);
    if (episode.interpretation) {
      // 已有解读产物：展示影响预览，由用户决定是否重试解读
      setShowImpact(true);
      toast.warning('剧本已更新并同步到源剧本（新版本留档）；本集已有解读产物，请检查下游影响并决定是否重新解读');
    } else {
      toast.success('剧本已更新并同步到源剧本（新版本留档）');
    }
  };

  const confirmScript = () => {
    updateEpisode(episode.id, { scriptChecked: true });
    toast.success(episode.interpretation ? '剧本已重新核对；如需同步解读请重试解读' : '剧本已核对，可继续设置执行目标');
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium">
        <FileText className="h-3.5 w-3.5 text-primary" />
        剧本核对
        <span className="text-muted-foreground">{episode.title}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <Badge variant="outline" className="font-mono text-4xs">
            源版本 v{project?.currentSourceVersion} · {sourceHash}
          </Badge>
          {episode.scriptDraft && (
            <Badge variant="outline" className="border-amber-500/40 font-mono text-4xs text-amber-600 dark:text-amber-400">
              草稿（未锁版）
            </Badge>
          )}
          {episode.scriptChecked ? (
            <Badge className="bg-success/15 text-success">
              <Check className="h-3 w-3" />
              已核对
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              未核对
            </Badge>
          )}
        </span>
      </div>

      <div className="mb-2 flex items-center gap-3 text-3xs text-muted-foreground">
        <span>原文范围 L{episode.sourceSpan.start}–L{episode.sourceSpan.end}</span>
        {episode.scriptDraft && (
          <span className="text-amber-600 dark:text-amber-400">
            已编辑：草稿优先于源版本切片展示；编辑后需重新核对
          </span>
        )}
      </div>

      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={10}
          className="w-full resize-y rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed outline-none focus:border-primary/50"
          placeholder="本集剧本正文（保存为草稿新版本，不影响源版本）"
        />
      ) : (
        <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
          {display}
        </pre>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {readOnly ? (
          <span className="text-3xs text-muted-foreground">只读浏览 · 编辑剧本请到首次解读阶段</span>
        ) : editing ? (
          <>
            <Button type="button" size="sm" onClick={saveDraft}>
              <Save className="h-3.5 w-3.5" />
              保存草稿
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
              <X className="h-3.5 w-3.5" />
              取消
            </Button>
          </>
        ) : (
          <>
            <Button type="button" size="sm" variant="outline" onClick={startEdit}>
              <Pencil className="h-3.5 w-3.5" />
              编辑
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={confirmScript}>
              <Check className="h-3.5 w-3.5" />
              {episode.scriptChecked ? '重新核对剧本' : '剧本已核对，继续'}
            </Button>
          </>
        )}
        {!readOnly && (
          <span className="ml-auto text-3xs text-muted-foreground">
            源剧本为不可变版本；本集编辑以草稿新版本记录，不覆盖源文本
          </span>
        )}
      </div>

      {showImpact && !readOnly && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-2xs font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            剧本草稿变更影响预览
            <span className="font-normal text-muted-foreground">本集已有解读产物，以下下游项基于旧剧本，需同步</span>
          </div>
          <div className="space-y-1">
            {impactItems.map((it) => (
              <div key={it.label} className="flex items-center gap-2 rounded bg-muted/40 px-2.5 py-1 text-2xs">
                <span className="w-32 shrink-0 font-medium">{it.label}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{it.desc}</span>
                <span className="shrink-0 font-mono text-3xs text-amber-600 dark:text-amber-400">{it.status}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {onRetry ? (
              <Button type="button" size="sm" variant="outline" onClick={onRetry}>
                <RefreshCw className="h-3.5 w-3.5" />
                重新解读本集（清解读与导演产物，资产标 STALE）
              </Button>
            ) : (
              <span className="text-2xs text-muted-foreground">解读产物重置需回到解读页执行</span>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowImpact(false)}>
              <EyeOff className="h-3.5 w-3.5" />
              暂不处理，保留现状
            </Button>
            <span className="ml-auto text-3xs text-muted-foreground">
              系统不自动清空产物；由用户决定何时同步，未同步前解读与草稿不一致
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
