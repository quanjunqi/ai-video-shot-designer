// 服务端资产生成任务适配器。
// 保留旧 Hook 名称以减少页面改动；任务状态权威来自 execution service，
// 资产审核状态仍由 asset store 管理。
// 真实链路：generate 改为同步真实图片调用（/tasks/run，阶段图片模型），
// 成功即新增资产候选版本（URL），质量交给用户评审；失败不伪造、提示换模型/重试。
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, type ServerTask } from '@/lib/api/client';
import { useAssetStore } from '@/stores/useAssetStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useStyleStore } from '@/stores/useStyleStore';
import { DEFAULT_STYLE_OPTIONS } from '@/mocks/styles';

const POLL_INTERVAL_MS = 2000;

export function useFakeGeneration() {
  const [tasks, setTasks] = useState<ServerTask[]>([]);
  const [loading, setLoading] = useState(false);
  const pendingAssets = useRef(new Set<string>());

  const loadTasks = useCallback(async () => {
    try {
      const result = await api.listTasks(undefined, 'image');
      setTasks(result.items);
      // outbox relay 可能比提交请求晚到，任务出现后再解除本地提交锁。
      result.items.forEach((task) => {
        if (task.asset_id && !['queued', 'running'].includes(task.status)) {
          pendingAssets.current.delete(task.asset_id);
        }
      });
    } catch {
      // 页面仍可编辑本地资产；任务中心会显示服务端错误，避免每次轮询弹 toast。
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      if (disposed) return;
      await loadTasks();
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [loadTasks]);

  const getTaskByAsset = useCallback(
    (assetId: string) => {
      const task = tasks.find(
        (item) => item.asset_id === assetId && ['queued', 'running'].includes(item.status),
      );
      return task;
    },
    [tasks],
  );

  const generate = useCallback(
    async (assetId: string, opts?: { modelId?: string; modelName?: string }) => {
      const assetState = useAssetStore.getState?.();
      const asset = assetState?.assets?.find((item) => item.id === assetId);
      if (!asset || getTaskByAsset(assetId) || pendingAssets.current.has(assetId)) return;
      if (!opts?.modelId) {
        toast.error('未找到可用的图片生成模型，请先在模型配置启用图片模型');
        return;
      }

      pendingAssets.current.add(assetId);
      setLoading(true);
      try {
        // 注入项目全局风格：角色/场景/道具 prompt + 项目风格 prompt
        const projectState = useProjectStore.getState?.();
        const project = projectState?.projects?.find((p) => p.id === asset.projectId);
        // 优先从 useStyleStore 查找，兜底从 DEFAULT_STYLE_OPTIONS 查找
        let style = null;
        if (project) {
          const styleState = useStyleStore.getState?.();
          style = styleState?.styles?.find((s) => s.id === project.styleId) ?? null;
          if (!style) {
            style = DEFAULT_STYLE_OPTIONS.find((s) => s.id === project.styleId) ?? null;
          }
        }
        // 风格 prompt 优先，缺省用 description
        const stylePrompt = (style?.prompt?.trim() || style?.description?.trim());
        const finalPrompt = stylePrompt ? `${asset.prompt}, ${stylePrompt}` : asset.prompt;
        console.log('[风格注入调试]', {
          assetProjectId: asset.projectId,
          projectFound: !!project,
          projectStyleId: project?.styleId,
          styleFound: !!style,
          styleName: style?.name,
          stylePrompt,
          finalPromptLength: finalPrompt.length,
        });

        const res = await api.runModelTest(opts.modelId, {
          prompt: finalPrompt,
        });
        const url = res.run?.extracted?.['data.0.url'];
        if (!res.ok || typeof url !== 'string' || !url) {
          toast.error(`真实生成失败：${res.run?.error ?? '响应未包含图片地址'}`);
          return;
        }
        // 真实生成成功 → 新增候选版本（AWAITING_USER，用户评审后 approve）
        useAssetStore.getState().addAssetVersion(assetId, {
          prompt: asset.prompt,
          negativePrompt: asset.negativePrompt,
          imageUrl: url,
        });
        useAssetStore.getState().updateAsset(assetId, {
          model: opts.modelName ?? asset.model,
          stale: false,
        });
        toast.success(`「${asset.name}」真实生成完成（${opts.modelName ?? '图片模型'}），请评审`);
      } catch (cause) {
        toast.error(cause instanceof Error ? `真实生成失败：${cause.message}` : '真实生成失败');
      } finally {
        pendingAssets.current.delete(assetId);
        setLoading(false);
      }
    },
    [getTaskByAsset],
  );

  return { generate, tasks, getTaskByAsset, loading };
}
