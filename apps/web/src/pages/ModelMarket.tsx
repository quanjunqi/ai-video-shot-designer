// EXPORTS: default ModelMarketPage
// 模型中心 > 模型广场（TASK-IA-001 v14 §2.2 / TASK-MARKET-M6 / TASK-MARKET-M8）：
// 真实调用模型 + 详情，可设为个人创作默认；数据源 = useSettingsStore.models（与创作流同源）。
// M8：模型目录撤销 → 启停归位广场卡片（Admin+）；空态文案不再引用「模型目录」。
import { useMemo, useState } from 'react';
import { Store } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useAuthStore, ROLE_RANK } from '@/stores/useAuthStore';
import type { CatalogModel } from '@/config/models/model-catalog';
import ModelMarketCard from '@/features/models/ModelMarketCard';
import { startPrice } from '@/features/models/modelPrice';
import ModelDetailSheet from '@/features/models/ModelDetailSheet';

type ModelType = 'text' | 'image' | 'video';
/** 个人创作默认写入键（按功能类型；Owner 确认：广场设默认=个人默认 defaultPrefs） */
const DEFAULT_KEY: Record<ModelType, 'defaultTextModel' | 'defaultImageModel' | 'defaultVideoModel'> = {
  text: 'defaultTextModel',
  image: 'defaultImageModel',
  video: 'defaultVideoModel',
};

export default function ModelMarketPage() {
  const models = useSettingsStore((s) => s.models);
  const channels = useSettingsStore((s) => s.channels);
  const preferences = useSettingsStore((s) => s.preferences);
  const catalogSource = useSettingsStore((s) => s.catalogSource);
  const update = useSettingsStore((s) => s.update);
  const toggleModel = useSettingsStore((s) => s.toggleModel);
  const role = useAuthStore((s) => s.role);
  const canDefault = (ROLE_RANK[role] ?? 0) >= ROLE_RANK.admin;
  /** M8：启停归位广场（Admin+，与设默认同权限级；Viewer/member 不渲染） */
  const canToggle = canDefault;

  const [typeFilter, setTypeFilter] = useState<'all' | ModelType>('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [detail, setDetail] = useState<CatalogModel | null>(null);

  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? id;
  const channelDisabled = (id: string) => channels.some((c) => c.id === id && !c.enabled);

  const list = useMemo(() => {
    return models
      .filter((m) => (typeFilter === 'all' ? true : m.type === typeFilter))
      .filter((m) => (channelFilter === 'all' ? true : m.channelId === channelFilter))
      .filter((m) => (statusFilter === 'all' ? true : m.status === statusFilter))
      .sort((a, b) => startPrice(a) - startPrice(b));
  }, [models, typeFilter, channelFilter, statusFilter]);

  const channelsOfModels = [...new Set(models.map((m) => m.channelId))].map((id) => ({ id, name: channelName(id) }));

  const isDefault = (m: CatalogModel) => preferences[DEFAULT_KEY[m.type]] === m.name;

  const setDefault = (m: CatalogModel) => {
    if (!canDefault) return;
    update({ preferences: { ...preferences, [DEFAULT_KEY[m.type]]: m.name } });
    setDetail(null);
  };

  return (
    <div className="space-y-4">
      {/* 筛选行：功能类型 · 渠道 · 状态（排序=同类型起步单价低到高） */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as 'all' | ModelType)}>
          <SelectTrigger className="h-9 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            <SelectItem value="text">文本</SelectItem>
            <SelectItem value="image">图片</SelectItem>
            <SelectItem value="video">视频</SelectItem>
          </SelectContent>
        </Select>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部渠道</SelectItem>
            {channelsOfModels.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'enabled' | 'disabled')}>
          <SelectTrigger className="h-9 w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="enabled">启用</SelectItem>
            <SelectItem value="disabled">停用</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-2xs text-muted-foreground">同类型按起步单价低到高排序</span>
      </div>

      {/* 来源状态条（TASK-MARKET-M1）：三态透明化，杜绝把演示目录当真实可调模型 */}
      {catalogSource === 'demo' && (
        <p className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-2 text-2xs text-amber-700">
          当前为本地演示目录（平台默认模型示意），并非真实接入模型；接入渠道并同步上游后，这里展示真实调用模型。
        </p>
      )}
      {catalogSource === 'server' && (
        <p className="rounded-lg border border-dashed border-border px-3 py-2 text-2xs text-muted-foreground">
          已连接模型中心，展示真实调用模型（平台目录 + 你接入并策展的模型）。
        </p>
      )}
      {catalogSource === 'offline-fallback' && (
        <p className="rounded-lg border border-dashed border-border px-3 py-2 text-2xs text-muted-foreground">
          当前展示离线缓存目录（后端不可达）；目录刷新后自动恢复平台数据。
        </p>
      )}

      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-10 text-center">
          <Store className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">暂无可用模型</p>
          <p className="max-w-80 text-2xs text-muted-foreground">
            先去「渠道」接入并提供凭据并同步上游，模型会出现在这里。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((m) => {
            const disabled = m.status !== 'enabled' || channelDisabled(m.channelId);
            // M8：启停按钮仅因「渠道停用」禁用（模型停用=可启用）；渠道停用无法从模型层复活
            const toggleDisabled = channelDisabled(m.channelId);
            return (
              <ModelMarketCard
                key={m.id}
                m={m}
                channelName={channelName}
                isDefault={isDefault(m)}
                disabled={disabled}
                catalogIsDemo={catalogSource === 'demo'}
                canDefault={canDefault}
                canToggle={canToggle}
                toggleDisabled={toggleDisabled}
                onOpen={() => setDetail(m)}
                onDefault={() => setDefault(m)}
                onToggle={() => {
                  if (!canToggle || toggleDisabled) return;
                  toggleModel(m.id);
                }}
              />
            );
          })}
        </div>
      )}

      {/* 详情抽屉：capability 全字段 + 协议模板 + 计费明细 + 能力依据 + 请求形状 + 试跑 */}
      <ModelDetailSheet
        m={detail}
        channelName={channelName}
        canDefault={canDefault}
        onClose={() => setDetail(null)}
        onDefault={setDefault}
      />
    </div>
  );
}
