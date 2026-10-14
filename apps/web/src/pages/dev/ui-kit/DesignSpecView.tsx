// 视图 2「设计规范」：一份设计规范稿（不是开发者工具页）。
// 编号小节 01–08，每节都是「样本 + 名称 + 值 + 用途」；同类样本铺成细线样本板，
// 而不是卡片流。左目录与画廊同一套「规范目录」样式。
import type { UiCatalog, UiComponent, UiToken } from '@/generated/ui-catalog';

import { SPEC_SECTIONS } from './specSections';
import { SpecColorSection } from './SpecColorBars';
import { SpecMotionSection, SpecShapeSection } from './SpecShapeMotion';
import { SpecScenariosSection } from './SpecScenarios';
import { SpecStatesSection } from './SpecStates';
import { SpecSpacingSection, SpecTypographySection } from './SpecTypeSpacing';

type DesignSpecViewProps = {
  tokens: UiToken[];
  components: UiComponent[];
  catalog: UiCatalog;
};

function SpecNav() {
  const itemClass =
    'text-muted-foreground hover:text-foreground flex min-w-0 items-baseline gap-3 rounded-md px-2 py-1.5 text-sm transition-colors';
  return (
    <aside className="flex min-w-0 flex-col gap-0.5 lg:sticky lg:top-24 lg:z-10 lg:w-56 lg:shrink-0">
      <p className="text-muted-foreground px-2 pb-2 text-xs font-medium">规范目录</p>
      {SPEC_SECTIONS.map((section) => (
        <a key={section.id} href={`#${section.id}`} className={itemClass}>
          <span className="font-mono text-xs tabular-nums">{section.number}</span>
          <span className="min-w-0 flex-1 truncate">{section.title}</span>
        </a>
      ))}
    </aside>
  );
}

export function DesignSpecView({ tokens, components, catalog }: DesignSpecViewProps) {
  const utilities = catalog.themeUtilities;

  return (
    <div className="flex min-w-0 flex-col gap-12 lg:flex-row lg:items-start">
      <SpecNav />
      <div className="flex min-w-0 flex-1 flex-col gap-12">
        <SpecColorSection tokens={tokens} />
        <SpecTypographySection tokens={tokens} catalog={catalog} />
        <SpecSpacingSection catalog={catalog} />
        <SpecShapeSection tokens={tokens} utilities={utilities} catalog={catalog} />
        <SpecMotionSection tokens={tokens} />
        <SpecStatesSection components={components} />
        <SpecScenariosSection />
      </div>
    </div>
  );
}
