// 「设计规范」02 字体与 03 间距：逐行样本 + 标准档位 / 待收敛离散步长并列展示。
// 尺度统计来自生成物字段 UI_CATALOG.scales（scripts/ui-inventory.mjs 统计代码实际用法）。
import type { UiToken } from '@/generated/ui-catalog';

import { ScaleList, SpecSectionHeader } from './SpecSection';
import { fontPurpose, fontSamples } from './uiKitModel';
import { readScales, sumCounts, type ScaleBucket, type ScaleEntry } from './uiKitScales';

type ScalesProps = { catalog: unknown };

// 4px 节奏的可视刻度：类名写成静态字面量，Tailwind 才能扫到。
const SPACING_RULER = [
  { className: 'w-1', label: '1 · 4px' },
  { className: 'w-2', label: '2 · 8px' },
  { className: 'w-3', label: '3 · 12px' },
  { className: 'w-4', label: '4 · 16px' },
  { className: 'w-6', label: '6 · 24px' },
  { className: 'w-8', label: '8 · 32px' },
  { className: 'w-10', label: '10 · 40px' },
  { className: 'w-12', label: '12 · 48px' },
];

const STANDARD_HINT = '标准档位：直接用这些尺度 token，不要写任意值。';

function ScaleColumns({
  title,
  standard,
  discrete,
  standardBucket,
  discreteNote,
}: {
  title: string;
  standard: ScaleEntry[];
  discrete: ScaleEntry[];
  standardBucket: ScaleBucket;
  discreteNote: string;
}) {
  const discreteBucket = `${standardBucket}Arbitrary` as ScaleBucket;
  const standardTotal = sumCounts(standard);
  const discreteTotal = sumCounts(discrete);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
        <ScaleList
          title="标准档位"
          bucket={standardBucket}
          entries={standard}
          emptyHint="暂无统计。"
          note={
            discreteTotal > standardTotal
              ? `${STANDARD_HINT}注意：离散步长已多于标准档位，新增样式必须走尺度 token。`
              : STANDARD_HINT
          }
        />
        <ScaleList
          title="待收敛的离散步长"
          bucket={discreteBucket}
          entries={discrete}
          emptyHint="无（很好）。"
          note={discrete.length > 0 ? discreteNote : undefined}
          tone="discrete"
        />
      </div>
    </div>
  );
}

export function SpecTypographySection({ tokens, catalog }: ScalesProps & { tokens: UiToken[] }) {
  const fonts = fontSamples(tokens);
  const { buckets, scannedFiles } = readScales(catalog);

  return (
    <section id="spec-type" className="flex min-w-0 scroll-mt-24 flex-col gap-5">
      <SpecSectionHeader
        number="02"
        title="字体"
        description="三个字体族 + 实际在用的字号档位"
        meta={scannedFiles ? `扫过 ${scannedFiles} 个文件` : undefined}
      />
      <div className="border-border/60 divide-border/60 flex min-w-0 flex-col divide-y rounded-lg border">
        {fonts.map((font) => (
          <div
            key={font.name}
            className="flex min-w-0 flex-col gap-2 p-4 xl:flex-row xl:items-center xl:gap-6"
          >
            <div className="flex min-w-0 shrink-0 flex-col xl:w-52">
              <code className="min-w-0 truncate font-mono text-xs">{font.name}</code>
              <span className="text-muted-foreground text-xs">{fontPurpose(font.name)}</span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="min-w-0 truncate text-lg" style={{ fontFamily: `var(${font.name})` }}>
                漫剧导演工坊 Aa Bb 0123
              </p>
              <p
                className="text-muted-foreground min-w-0 truncate text-sm"
                style={{ fontFamily: `var(${font.name})` }}
              >
                分镜脚本 Storyboard · 提示词 42 条 · 1280×720
              </p>
            </div>
            <span
              className="text-muted-foreground min-w-0 truncate font-mono text-xs xl:w-64"
              title={font.light}
            >
              {font.light}
            </span>
          </div>
        ))}
      </div>

      <ScaleColumns
        title="字号档位"
        standard={buckets.text}
        discrete={buckets.textArbitrary}
        standardBucket="text"
        discreteNote="建议收敛到尺度 token（V-003）：标题用 text-lg 起，正文 text-sm / text-xs。"
      />

      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
        <ScaleList title="行高" bucket="leading" entries={buckets.leading} emptyHint="暂无统计。" />
        <ScaleList
          title="字距"
          bucket="tracking"
          entries={buckets.tracking}
          emptyHint="暂无统计。"
          note="字距只用于全大写小字，正文不加字距。"
        />
      </div>
    </section>
  );
}

export function SpecSpacingSection({ catalog }: ScalesProps) {
  const { buckets } = readScales(catalog);

  return (
    <section id="spec-space" className="flex min-w-0 scroll-mt-24 flex-col gap-5">
      <SpecSectionHeader
        number="03"
        title="间距"
        description="4px 节奏：只用间距 token"
        meta={`${sumCounts(buckets.spacing)} 处使用`}
      />
      <ul className="flex min-w-0 flex-wrap items-end gap-4">
        {SPACING_RULER.map((step) => (
          <li key={step.className} className="flex flex-col items-center gap-1">
            <span className={`bg-primary/30 h-6 rounded-sm ${step.className}`} />
            <span className="text-muted-foreground font-mono text-xs tabular-nums">
              {step.label}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-sm">
        间距以 4px 为节奏基准（1 档 = 4px）；0.5 / 1.5 / 2.5 / 3.5 是紧凑控件的半档（2px / 6px /
        10px / 14px），不落在 4px 倍数上，新增间距优先用整数档；任意值只允许 2px 这类细线场景（V-001）。
      </p>
      <ScaleColumns
        title="间距档位"
        standard={buckets.spacing}
        discrete={buckets.spacingArbitrary}
        standardBucket="spacing"
        discreteNote="建议收敛到间距 token（V-001）。"
      />
    </section>
  );
}
