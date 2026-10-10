// EXPORTS: ReferenceBar, type RefItem
// 参考图附件条（对标即梦输入框：缩略图贴在提示词输入区上方，最后一张叠圆形 + 继续添加；
// 上传即自动编号为 @本图N，用途写在提示词正文里用 @ 引用，不设权重/用途下拉）。
import { useRef } from 'react';
import { Plus, X, Upload, Library, Film } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAssetStore } from '@/stores/useAssetStore';
import { useShallow } from 'zustand/react/shallow';
import type { Asset } from '@/types';
import { cn } from '@/lib/utils';

export interface RefItem {
  id: string;
  slot: 'first' | 'last' | 'free';
  url: string;
  assetId?: string;
  assetName?: string;
}

let seq = 0;
const nextId = () => `ref-${Date.now()}-${seq++}`;

export default function ReferenceBar({
  mode,
  refs,
  onChange,
}: {
  mode: 'image' | 'video';
  refs: RefItem[];
  onChange: (next: RefItem[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const pickableAssets = useAssetStore(
    useShallow((s) =>
      s.assets.filter((a) => a.imageUrl && (a.status === 'USER_APPROVED' || a.status === 'AWAITING_USER')),
    ),
  );

  const addUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onChange([...refs, { id: nextId(), slot: 'free', url: reader.result }]);
      }
    };
    reader.readAsDataURL(file);
  };

  const addAsset = (a: Asset) => {
    if (refs.some((r) => r.assetId === a.id)) return;
    onChange([...refs, { id: nextId(), slot: 'free', url: a.imageUrl!, assetId: a.id, assetName: a.name }]);
  };

  const remove = (id: string) => onChange(refs.filter((r) => r.id !== id));

  const first = refs.find((r) => r.slot === 'first');
  const last = refs.find((r) => r.slot === 'last');
  const free = refs.filter((r) => r.slot === 'free');

  // + 按钮：即梦风格，圆形深色叠加在缩略图列表末尾
  const addButton = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="添加参考图"
          className="relative flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
          <Upload className="mr-2 h-3.5 w-3.5" /> 上传图片
        </DropdownMenuItem>
        <Dialog>
          <DialogTrigger asChild>
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
              <Library className="mr-2 h-3.5 w-3.5" /> 从资产库选择
            </DropdownMenuItem>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>从项目资产库选择参考</DialogTitle></DialogHeader>
            <AssetGrid assets={pickableAssets} onPick={addAsset} />
          </DialogContent>
        </Dialog>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // 单张缩略图：hover 出删除 X，左下编号角标
  const thumb = (r: RefItem, label: string) => (
    <div key={r.id} className="group relative h-11 w-11 shrink-0">
      <img src={r.url} alt="" className="h-full w-full rounded-lg border border-border object-cover" />
      <button
        type="button"
        onClick={() => remove(r.id)}
        title="移除"
        className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-black/80 text-white group-hover:flex"
      >
        <X className="h-2.5 w-2.5" />
      </button>
      <span className="absolute bottom-0.5 left-0.5 rounded bg-primary/90 px-1 text-[8px] leading-[12px] text-primary-foreground">
        @{label}
      </span>
    </div>
  );

  return (
    <div className="space-y-1.5">
      {/* 视频首帧/尾帧槽位（小尺寸） */}
      {mode === 'video' && (
        <div className="flex gap-2">
          <SlotChip
            icon={<Film className="h-3.5 w-3.5" />}
            label="首帧"
            thumb={first?.url}
            onRemove={first ? () => remove(first.id) : undefined}
            onPick={(a) => onChange([...refs.filter((r) => r.slot !== 'first'), { id: nextId(), slot: 'first' as const, url: a.imageUrl!, assetName: a.name }])}
            assets={pickableAssets}
          />
          <SlotChip
            icon={<Film className="h-3.5 w-3.5" />}
            label="尾帧"
            thumb={last?.url}
            onRemove={last ? () => remove(last.id) : undefined}
            onPick={(a) => onChange([...refs.filter((r) => r.slot !== 'last'), { id: nextId(), slot: 'last' as const, url: a.imageUrl!, assetName: a.name }])}
            assets={pickableAssets}
          />
        </div>
      )}

      {/* 自由参考图缩略图横排 + 末尾 + */}
      <div className="flex flex-wrap items-center gap-1.5">
        {free.map((r, i) => thumb(r, `本图${i + 1}`))}
        {addButton}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) addUpload(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function SlotChip({
  label,
  thumb,
  onRemove,
  onPick,
  assets,
  icon,
}: {
  label: string;
  thumb?: string;
  onRemove?: () => void;
  onPick: (a: Asset) => void;
  assets: Asset[];
  icon: React.ReactNode;
}) {
  return (
    <div className="relative inline-flex">
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={thumb ? `更换${label}参考图` : `选择${label}参考图`}
          className={cn(
            'flex h-11 items-center gap-1.5 rounded-lg border border-dashed border-border px-2 text-[10px] text-muted-foreground hover:bg-muted',
            thumb && 'border-solid border-border pr-7',
          )}
        >
          {thumb ? (
            <>
              <img src={thumb} alt="" className="h-9 w-14 rounded object-cover" />
              <span className="text-[9px]">@{label}</span>
            </>
          ) : (
            <>
              {icon}
              <span>{label}（可选）</span>
            </>
          )}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>选择资产作为{label}</DialogTitle></DialogHeader>
        <AssetGrid assets={assets} onPick={onPick} />
      </DialogContent>
    </Dialog>
      {thumb && onRemove && (
        <button
          type="button"
          aria-label={`移除${label}参考图`}
          onClick={onRemove}
          className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function AssetGrid({ assets, onPick }: { assets: Asset[]; onPick: (a: Asset) => void }) {
  if (assets.length === 0) {
    return <div className="py-8 text-center text-xs text-muted-foreground">资产库暂无带图的已批准/候选资产</div>;
  }
  return (
    <div className="grid max-h-[360px] grid-cols-3 gap-2 overflow-auto">
      {assets.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onPick(a)}
          className="group overflow-hidden rounded-lg border border-border text-left hover:border-primary"
        >
          <div className="aspect-square overflow-hidden bg-muted">
            {a.imageUrl && <img src={a.imageUrl} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="p-1.5">
            <div className="truncate text-[10px] font-medium">{a.name}</div>
            <div className="text-[9px] text-muted-foreground">v{a.currentVersion} · {a.kind === 'character' ? '角色' : a.kind === 'scene' ? '场景' : '道具'}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
