// 拆集任务流（4.2：projectId + sourceVersion 幂等；刷新/离开/再次进入不重复提交）
import { useEffect, useRef } from 'react';
import { useProjectStore } from '@/stores/useProjectStore';
import { useEpisodeStore, buildSplitCandidates } from '@/stores/useEpisodeStore';
import { useRuleTemplateStore } from '@/stores/useRuleTemplateStore';
import { resolveSplitOverrides } from '@/lib/ruleResolver';

const SPLIT_STEPS = [
  { label: '上传源文件并计算哈希' },
  { label: '提取剧本文本' },
  { label: '标注候选剧集边界 / 标题 / 顺序' },
  { label: '完整性校验（覆盖与顺序）' },
];

export function useSplitFlow(projectId: string) {
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const startSplit = useProjectStore((s) => s.startSplit);
  const updateProject = useProjectStore((s) => s.updateProject);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!project) return;
    if (project.split?.locked) return;

    // A persisted local project can be rendered before its source body is
    // hydrated from the detail endpoint. Do not start a split against an
    // empty source; the source length dependency below re-runs this effect
    // after hydration completes.
    const source = project.sourceVersions.find((item) => item.version === project.currentSourceVersion)?.text ?? '';
    if (!source.trim()) return;

    if (project.status === 'pending_parse') {
      startSplit(projectId);
      return;
    }

    if (project.status === 'parsing') {
      const split = project.split;
      if (!split) return;
      // 已完成全部步骤（刷新恢复边界情况）→ 生成候选并转待核对
      if (split.step >= split.totalSteps) {
        const text = project.sourceVersions.find((item) => item.version === project.currentSourceVersion)?.text ?? '';
        const cands = buildSplitCandidates(text, projectId.length * 7 + project.currentSourceVersion, resolveSplitOverrides(project, useRuleTemplateStore.getState().templates));
        useEpisodeStore.getState().splitToCandidates(projectId, cands);
        updateProject(projectId, { status: 'awaiting_confirm' });
        return;
      }
      if (runningRef.current) return;
      runningRef.current = true;
      const timer = window.setInterval(() => {
        const p = useProjectStore.getState().getProject(projectId);
        if (!p || !p.split) {
          window.clearInterval(timer);
          runningRef.current = false;
          return;
        }
        const next = p.split.step + 1;
        if (next >= p.split.totalSteps) {
          window.clearInterval(timer);
          runningRef.current = false;
          const text = p.sourceVersions.find((item) => item.version === p.currentSourceVersion)?.text ?? '';
          const cands = buildSplitCandidates(text, projectId.length * 7 + p.currentSourceVersion, resolveSplitOverrides(p, useRuleTemplateStore.getState().templates));
          useEpisodeStore.getState().splitToCandidates(projectId, cands);
          updateProject(projectId, {
            status: 'awaiting_confirm',
            split: { ...p.split, step: next },
          });
        } else {
          updateProject(projectId, { split: { ...p.split, step: next } });
        }
      }, 800);
      return () => {
        window.clearInterval(timer);
        runningRef.current = false;
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.status, project?.split?.locked, project?.currentSourceVersion, project?.sourceVersions.find((item) => item.version === project.currentSourceVersion)?.text.length, projectId]);

  return { steps: SPLIT_STEPS, step: project?.split?.step ?? 0, totalSteps: SPLIT_STEPS.length };
}
