// EXPORTS: MentionTextarea
// 提示词输入框（即梦风格，轻量版）：
// - 参考图在 textarea 里用一个不可见的私用区字符 \uE000 当占位（占一个字符宽）；
// - mirror 层把这个占位字符渲染成 16x16 缩略图，按出现顺序对应 localRefs；
// - Backspace 智能删除：光标前是占位时一次删整个引用；
// - 负面提示词用 disableMention 渲染纯 textarea。
import { useRef, useState } from 'react';
import { AtSign } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { type LocalRef } from '@/lib/mentions';

const REF_MARK = '\uE000';

export default function MentionTextarea({
  value,
  onChange,
  rows = 4,
  placeholder,
  localRefs = [],
  disableMention = false,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  localRefs?: LocalRef[];
  disableMention?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [atOpen, setAtOpen] = useState(false);
  const [atQuery, setAtQuery] = useState('');
  const [caret, setCaret] = useState(value.length);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const syncScroll = () => {
    if (taRef.current && mirrorRef.current) {
      mirrorRef.current.scrollTop = taRef.current.scrollTop;
    }
  };

  if (disableMention) {
    return (
      <Textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs"
      />
    );
  }

  // 检测光标前是否在输入 @xxx
  const detectAt = (text: string, pos: number) => {
    const before = text.slice(0, pos);
    const at = before.lastIndexOf('@');
    if (at === -1 || /\s/.test(before.slice(at + 1))) {
      setAtOpen(false);
      return;
    }
    setAtQuery(before.slice(at + 1));
    setAtOpen(true);
  };

  const q = atQuery.trim();
  const atList = localRefs.filter((r) => !q || r.name.includes(q));

  // 在光标处插入一个引用占位
  const insertRef = (ref: LocalRef, replaceTyping: boolean) => {
    void ref;
    const pos = caret;
    let insertAt = pos;
    let afterStart = pos;
    if (replaceTyping) {
      const before = value.slice(0, pos);
      const at = before.lastIndexOf('@');
      if (at !== -1) {
        insertAt = at;
        afterStart = at + 1; // 连同正在输入的 @ 一起替换
      }
    }
    const beforeText = value.slice(0, insertAt);
    const afterText = value.slice(afterStart);
    const needsSpace = insertAt > 0 && !/[\s]$/.test(beforeText);
    const piece = (needsSpace ? ' ' : '') + REF_MARK;
    const next = beforeText + piece + afterText;
    onChange(next);
    setCaret(insertAt + piece.length);
    setPickerOpen(false);
    setAtOpen(false);
  };

  // Backspace：光标前是引用占位时一次删掉
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Backspace') return;
    const el = e.currentTarget;
    const pos = el.selectionStart ?? value.length;
    if (el.selectionEnd !== pos) return;
    if (value[pos - 1] === REF_MARK) {
      e.preventDefault();
      const next = value.slice(0, pos - 1) + value.slice(pos);
      onChange(next);
      setCaret(pos - 1);
    }
  };

  // mirror：把 REF_MARK 按出现顺序替换成缩略图
  const renderMirror = () => {
    let idx = -1;
    const parts = value.split(REF_MARK);
    return parts.map((p, i) => {
      const nodes: React.ReactNode[] = [<span key={`t${i}`}>{p}</span>];
      if (i < parts.length - 1) {
        idx += 1;
        const ref = localRefs[idx];
        nodes.push(
          <img
            key={`r${i}`}
            src={ref?.thumb}
            alt={ref?.name ?? 'ref'}
            className="mx-px inline-block h-4 w-4 rounded-sm border border-border align-text-bottom object-cover"
          />,
        );
      }
      return nodes;
    });
  };

  return (
    <div className="space-y-1">
      <div className="relative">
        <div
          ref={mirrorRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-md border border-transparent px-3 py-2 text-xs leading-5"
        >
          {renderMirror() || <span>&nbsp;</span>}
        </div>
        <Textarea
          ref={taRef}
          value={value}
          rows={rows}
          placeholder={placeholder}
          onScroll={syncScroll}
          onKeyDown={onKeyDown}
          onChange={(e) => {
            onChange(e.target.value);
            const v = e.target.value;
            const pos = e.target.selectionStart ?? v.length;
            setCaret(pos);
            detectAt(v, pos);
          }}
          onSelect={(e) => {
            setCaret((e.target as HTMLTextAreaElement).selectionStart ?? caret);
          }}
          onKeyUp={(e) => {
            if (e.key === '@' || e.key === 'Backspace' || e.key === 'Process') {
              const el = e.target as HTMLTextAreaElement;
              detectAt(el.value, el.selectionStart ?? el.value.length);
            }
            if (e.key === 'Escape') setAtOpen(false);
          }}
          onBlur={() => window.setTimeout(() => setAtOpen(false), 150)}
          className="relative z-10 bg-transparent px-3 py-2 text-xs leading-5 text-transparent caret-foreground"
          style={{ WebkitTextFillColor: 'transparent' }}
        />

        {/* @ 下拉：只列本图参考 */}
        {atOpen && atList.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
            <div className="flex items-center gap-1 px-2 py-1 text-3xs text-muted-foreground">
              <AtSign className="h-3 w-3" /> 参考图
            </div>
            {atList.map((r) => (
              <button
                key={r.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertRef(r, true)}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent"
              >
                <img src={r.thumb} alt="" className="h-8 w-8 rounded object-cover" />
                <span>@{r.name}</span>
              </button>
            ))}
          </div>
        )}

        <Dialog open={pickerOpen} onOpenChange={(o) => { setPickerOpen(o); if (o) setCaret(value.length); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>引用参考图（{localRefs.length}）</DialogTitle>
            </DialogHeader>
            {localRefs.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                还没有参考图，先点输入框上方的 + 上传或从资产库选择
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {localRefs.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => insertRef(r, false)}
                    className="group overflow-hidden rounded-lg border border-border text-left hover:border-primary"
                  >
                    <img src={r.thumb} alt="" className="aspect-square w-full object-cover" />
                    <div className="truncate p-1.5 text-3xs font-medium">@{r.name}</div>
                  </button>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <button
        type="button"
        onClick={() => { setCaret(value.length); setPickerOpen(true); }}
        title="从参考图引用"
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-3xs text-primary hover:bg-primary/10"
      >
        <AtSign className="h-3.5 w-3.5" />
        引用参考图
      </button>
    </div>
  );
}
