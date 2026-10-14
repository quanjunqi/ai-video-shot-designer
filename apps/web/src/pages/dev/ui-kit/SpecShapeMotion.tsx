// 「设计规范」04 圆角 + 05 阴影 + 06 动效：细线样本板 + 实际在用档位统计。
import type { UiThemeUtility, UiToken } from '@/generated/ui-catalog';

import { PlateCell, SampleLabel, ScaleList, SpecPlate, SpecSectionHeader } from './SpecSection';
import { motionTokens, radiusSamples, shadowSamples, utilityClassFor, type CssSample } from './uiKitModel';
import { readScales } from './uiKitScales';

type ShapeProps = { tokens: UiToken[]; utilities: UiThemeUtility[]; catalog: unknown };

function RadiusSample({ sample }: { sample: CssSample }) {
  return (
    <PlateCell className="items-center">
      <span
        className="bg-primary/25 border-primary/40 size-20 shrink-0 border"
        style={{ borderRadius: sample.css }}
      />
      <SampleLabel hint={utilityClassFor(sample.name)}>{sample.name}</SampleLabel>
      <code className="text-muted-foreground min-w-0 truncate font-mono text-xs" title={sample.value}>
        {sample.value}
      </code>
    </PlateCell>
  );
}

// 阴影样本按浅色表面渲染：--shadow-* 在深色主题不重定义，且本身是极低透明度的黑色投影，
// 铺在深色底上等于看不见。表面色取清单里 --card 的浅色值（与色带同一套做法）。
function ShadowSample({ sample, surface }: { sample: CssSample; surface: string | null }) {
  return (
    <PlateCell className="items-center">
      <span
        className="border-border/60 h-16 w-full min-w-0 rounded-lg border"
        style={{ boxShadow: sample.css, background: surface ?? undefined }}
        title={sample.value}
      />
      <SampleLabel hint={utilityClassFor(sample.name)}>{sample.name}</SampleLabel>
    </PlateCell>
  );
}

export function SpecShapeSection({ tokens, utilities, catalog }: ShapeProps) {
  const radius = radiusSamples(tokens, utilities);
  const shadows = shadowSamples(tokens, utilities);
  const { buckets } = readScales(catalog);
  const surfaceLight = tokens.find((token) => token.name === '--card')?.light ?? null;

  return (
    <>
      <section id="spec-radius" className="flex min-w-0 scroll-mt-24 flex-col gap-5">
        <SpecSectionHeader
          number="04"
          title="圆角"
          description="定义在 --radius 上的 5 档圆角"
          meta={`${radius.length} 档`}
        />
        <SpecPlate className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {radius.map((sample) => (
            <RadiusSample key={sample.name} sample={sample} />
          ))}
        </SpecPlate>
        <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
          <ScaleList
            title="实际在用的圆角档位"
            bucket="radius"
            entries={buckets.radius}
            emptyHint="暂无统计。"
            note="rounded-full 用于头像与胶囊标签；其余走 4 档 token。"
          />
          <ScaleList
            title="待收敛的离散步长"
            bucket="radiusArbitrary"
            entries={buckets.radiusArbitrary}
            emptyHint="无（很好）。"
            note="建议收敛到圆角 token。"
            tone="discrete"
          />
        </div>
      </section>

      <section id="spec-shadow" className="flex min-w-0 scroll-mt-24 flex-col gap-5">
        <SpecSectionHeader
          number="05"
          title="阴影"
          description="由 --shadow-* 变量定义的 8 档投影（按浅色表面渲染）"
          meta={`${shadows.length} 档`}
        />
        <SpecPlate className="grid-cols-2 sm:grid-cols-4 xl:grid-cols-8">
          {shadows.map((sample) => (
            <ShadowSample key={sample.name} sample={sample} surface={surfaceLight} />
          ))}
        </SpecPlate>
        <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
          <ScaleList
            title="实际在用的阴影档位"
            bucket="shadow"
            entries={buckets.shadow}
            emptyHint="暂无统计。"
            note="卡片默认 shadow-xs；浮层用 shadow-md / shadow-lg。"
          />
          <ScaleList
            title="待收敛的离散步长"
            bucket="shadowArbitrary"
            entries={buckets.shadowArbitrary}
            emptyHint="无（很好）。"
            note="建议收敛到阴影 token。"
            tone="discrete"
          />
        </div>
        <p className="text-muted-foreground text-xs">
          阴影是极低透明度的黑色投影，且深色主题不重定义 --shadow-*：样本统一铺在浅色表面上展示。
        </p>
      </section>
    </>
  );
}

export function SpecMotionSection({ tokens }: { tokens: UiToken[] }) {
  const motions = motionTokens(tokens);
  return (
    <section id="spec-motion" className="flex min-w-0 scroll-mt-24 flex-col gap-5">
      <SpecSectionHeader
        number="06"
        title="动效"
        description="过渡时长与缓动曲线"
        meta={motions.length > 0 ? `${motions.length} 个变量` : undefined}
      />
      {motions.length > 0 ? (
        <SpecPlate className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {motions.map((token) => (
            <PlateCell key={token.name}>
              <SampleLabel>{token.name}</SampleLabel>
              <code className="text-muted-foreground min-w-0 truncate font-mono text-xs">
                {token.light}
              </code>
            </PlateCell>
          ))}
        </SpecPlate>
      ) : (
        <div className="border-border/60 flex min-w-0 flex-col gap-2 rounded-lg border border-dashed p-5">
          <p className="text-sm font-medium">暂无统一动效 token</p>
          <p className="text-muted-foreground text-sm">
            当前过渡与进出场来自 Tailwind 默认工具类与 tw-animate-css，尚未沉淀成设计变量；
            补齐 --animate-* / --duration-* / --ease-* 后本小节会自动渲染。
          </p>
        </div>
      )}
    </section>
  );
}
