// 「设计规范」01 色彩：长条色带（整行）+ 名称 + 取值，按用途分组。
// 左半条用清单里的浅色字面值：本页跟随全局主题（可能是深色），左半条若也走 var()
// 深浅会变成同一个颜色，对比就假了；右半条包在 .dark 作用域里取深色定义。
import type { UiToken } from '@/generated/ui-catalog';

import { SpecSectionHeader } from './SpecSection';
import { groupColorTokens } from './uiKitModel';

function ColorBand({ token }: { token: UiToken }) {
  const darkValue = token.dark;
  return (
    <div className="flex min-w-0 items-center gap-4 py-2">
      <code className="w-40 min-w-0 shrink-0 truncate font-mono text-xs" title={token.name}>
        {token.name}
      </code>
      <span className="border-border/60 flex min-w-0 flex-1 overflow-hidden rounded-sm border">
        <span
          className="h-7 min-w-0 flex-1"
          title={`浅色：${token.light}`}
          style={{ background: token.light }}
        />
        <span className="dark bg-background flex h-7 min-w-0 flex-1">
          <span
            className="min-w-0 flex-1"
            title={`深色：${darkValue ?? '无深色覆盖（与浅色相同）'}`}
            style={{ background: `var(${token.name})` }}
          />
        </span>
      </span>
      <span
        className="text-muted-foreground hidden min-w-0 shrink-0 truncate font-mono text-xs lg:block lg:w-72"
        title={darkValue ? `${token.light} → ${darkValue}` : token.light}
      >
        {darkValue ? `${token.light} → ${darkValue}` : `${token.light}（无深色覆盖）`}
      </span>
    </div>
  );
}

export function SpecColorSection({ tokens }: { tokens: UiToken[] }) {
  const groups = groupColorTokens(tokens);
  const count = groups.reduce((sum, group) => sum + group.tokens.length, 0);

  return (
    <section id="spec-color" className="flex min-w-0 scroll-mt-24 flex-col gap-6">
      <SpecSectionHeader
        number="01"
        title="色彩"
        description="按用途分组的语义色带；左浅右深"
        meta={`${count} 个色板`}
      />
      {groups.map((group) => (
        <div key={group.id} className="flex min-w-0 flex-col">
          <div className="border-border/60 flex min-w-0 items-baseline gap-2 border-b py-2">
            <h3 className="text-sm font-medium">{group.label}</h3>
            <span className="text-muted-foreground text-xs tabular-nums">
              {group.tokens.length}
            </span>
          </div>
          <div className="divide-border/60 flex min-w-0 flex-col divide-y">
            {group.tokens.map((token) => (
              <ColorBand key={token.name} token={token} />
            ))}
          </div>
        </div>
      ))}
      <p className="text-muted-foreground text-xs">
        半透明叠加层（elevate、*-outline）色带偏淡属正常；右半条取 .dark 作用域的深色定义。
      </p>
    </section>
  );
}
