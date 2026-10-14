import type { ReactNode } from 'react';

import { BASICS_DEMOS } from './basics';
import { DATADISPLAY_DEMOS } from './datadisplay';
import { FEEDBACK_DEMOS } from './feedback';
import { FORMS_DEMOS } from './forms';
import { LAYOUT_DEMOS } from './layout';
import { NAVIGATION_DEMOS } from './navigation';

// 展示页的 demo 注册表。生成器（scripts/ui-inventory.mjs）会扫描 demos/ 下的
// `"<组件名>": (` 键作为覆盖率事实源：**必须覆盖 src/components/ui/*.tsx 全部组件**，
// 缺一个 `npm run ui:check` 就红。新增组件时在对应分类文件里加一条即可。
export const UI_DEMOS: Record<string, ReactNode> = {
  ...BASICS_DEMOS,
  ...LAYOUT_DEMOS,
  ...NAVIGATION_DEMOS,
  ...FORMS_DEMOS,
  ...DATADISPLAY_DEMOS,
  ...FEEDBACK_DEMOS,
};
