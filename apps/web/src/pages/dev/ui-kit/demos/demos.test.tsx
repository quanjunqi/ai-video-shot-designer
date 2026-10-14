// 组件库展示页 demo 的冒烟测试：**结构覆盖 + 逐个真实渲染**
// 为什么必须有：生成器的 demo 覆盖门只看「key 是否存在」，看不出「一渲染就崩」；
// 展示页是设计系统的门面，崩了却没人发现，就是典型的假绿。
// jsdom 缺失的浏览器 API（ResizeObserver/matchMedia/scrollIntoView 等）统一在 vitest.setup.ts 补齐。
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { UI_DEMOS } from './index';
import { UI_CATALOG } from '@/generated/ui-catalog';

describe('UI 展示页 demo', () => {
  it('清单里每个组件都有 demo（与 ui:check 同口径）', () => {
    const missing = UI_CATALOG.components.filter((c) => !UI_DEMOS[c.name]).map((c) => c.name);
    expect(missing).toEqual([]);
  });

  it.each(UI_CATALOG.components.map((c) => c.name))('%s 的 demo 能真实渲染', (name) => {
    expect(() => render(<div>{UI_DEMOS[name]}</div>)).not.toThrow();
  });
});
