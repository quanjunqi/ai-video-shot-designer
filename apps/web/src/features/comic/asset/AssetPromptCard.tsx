// EXPORTS: default AssetPromptCard
// 提示词编辑（5.2：手动编辑保存新版本并重新校验；不允许直接修改已批准产物）
import { useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAssetStore } from '@/stores/useAssetStore';
import { buildAssetsFromInterpret } from '@/mocks/assets';
import type { Asset } from '@/types';

const MODELS = ['SDXL', 'Flux', 'MJ-V6', 'SDXL-Turbo'];

// 父组件用 key={asset.id} 挂载，切换资产时整体重置
export default function AssetPromptCard({ asset, episode }: { asset: Asset; episode: { id: string; index: number } }) {
  const addAssetVersion = useAssetStore((s) => s.addAssetVersion);
  const updateAsset = useAssetStore((s) => s.updateAsset);
  const [prompt, setPrompt] = useState(asset.prompt);
  const [negative, setNegative] = useState(asset.negativePrompt);
  const [model, setModel] = useState(asset.model);
  const [dirty, setDirty] = useState(false);

  const approved = asset.status === 'USER_APPROVED';

  const handleSave = () => {
    if (!prompt.trim()) return;
    addAssetVersion(asset.id, { prompt: prompt.trim(), negativePrompt: negative.trim(), userStatement: '手工编辑保存新版本' });
    updateAsset(asset.id, { model });
    setDirty(false);
    toast.success(`已保存 v${asset.currentVersion + 1}（旧版 SUPERSEDED）`);
  };

  const handleReinterpret = () => {
    // 演示：用导演规则重新生成草案（正式为服务端重跑分析）
    const fresh = buildAssetsFromInterpret(episode as Parameters<typeof buildAssetsFromInterpret>[0]).find(
      (a) => a.kind === asset.kind && a.id === asset.id,
    );
    const newPrompt = fresh?.prompt ?? prompt;
    setPrompt(newPrompt);
    setDirty(true);
    toast.info('已按导演规则重新生成草案，保存后成为新版本');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input value={asset.name} disabled className="h-8 text-xs" />
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          v{asset.currentVersion}
        </span>
        {approved && <span className="shrink-0 rounded bg-success/15 px-1.5 py-0.5 text-[10px] text-success">已批准</span>}
        {asset.stale && <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">STALE</span>}
      </div>
      {asset.sourceScene && (
        <p className="text-[11px] text-muted-foreground">来源场次：{asset.sourceScene} · {asset.description}</p>
      )}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">图片提示词（可编辑）</Label>
        <Textarea
          value={prompt}
          rows={4}
          onChange={(e) => {
            setPrompt(e.target.value);
            setDirty(true);
          }}
          className="text-xs"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">负面提示词</Label>
        <Textarea
          value={negative}
          rows={2}
          onChange={(e) => {
            setNegative(e.target.value);
            setDirty(true);
          }}
          className="text-xs"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">生成模型（已配置且能力兼容）</Label>
        <Select value={model} onValueChange={(v) => setModel(v as string)}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODELS.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={handleReinterpret}>
          <RefreshCw className="h-3.5 w-3.5" />
          按导演规则重新解读
        </Button>
        <Button type="button" size="sm" className="flex-1" disabled={!dirty} onClick={handleSave}>
          <Save className="h-3.5 w-3.5" />
          保存新版本
        </Button>
      </div>
      {approved && (
        <p className="text-[10px] text-muted-foreground">已批准产物不可直接修改，请保存新版本后重新走候选确认。</p>
      )}
    </div>
  );
}
