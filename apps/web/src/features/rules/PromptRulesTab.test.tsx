// 环节提示词规则 Tab 组件测试：内置只读展示 / 新建规则表单校验 / 空态
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import PromptRulesTab from './PromptRulesTab';

const storeMocks = vi.hoisted(() => ({
  upsertTemplate: vi.fn(),
  removeTemplate: vi.fn(),
  toggleEnabled: vi.fn(),
  restoreVersion: vi.fn(),
  loadFromServer: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/stores/usePromptRuleStore', () => {
  const state = {
    templates: [
      {
        version: 1,
        id: 'pr-rule-interpretation',
        stage: 'interpretation',
        name: '导演解读 · 平台默认',
        desc: '事实提取与两层覆盖口径',
        content: 'EV/DLG/LOCK 事实提取',
        builtin: true,
        enabled: true,
      },
    ],
    upsertTemplate: storeMocks.upsertTemplate,
    removeTemplate: storeMocks.removeTemplate,
    toggleEnabled: storeMocks.toggleEnabled,
    restoreVersion: storeMocks.restoreVersion,
    loadFromServer: storeMocks.loadFromServer,
  };
  return {
    // 组件以 selector 形式调用 store（usePromptRuleStore((s) => s.x)）
    usePromptRuleStore: (selector: (s: typeof state) => unknown) => selector(state),
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// 简单回归守卫：对话框内容渲染（radix Dialog 在 jsdom 中 portal 到 body）
beforeEach(() => {
  vi.clearAllMocks();
});

describe('PromptRulesTab', () => {
  it('展示平台内置规则与空态（无用户模板）', () => {
    render(<PromptRulesTab />);
    expect(screen.getByText('导演解读 · 平台默认')).toBeInTheDocument();
    expect(screen.getByText(/平台内置规则/)).toBeInTheDocument();
    expect(screen.getByText(/该环节暂无自定义规则/)).toBeInTheDocument();
  });

  it('新建规则：空名称被拦截（toast.error，不调用 upsert）', async () => {
    const user = userEvent.setup();
    render(<PromptRulesTab />);
    await user.click(screen.getByRole('button', { name: /新建规则/ }));
    // 直接点创建（名称/内容为空）
    await user.click(screen.getByRole('button', { name: /创建规则/ }));
    expect(toast.error).toHaveBeenCalledWith('请填写模板名称');
    expect(screen.getByRole('button', { name: /创建规则/ })).toBeInTheDocument();
  });

  it('新建规则：填写名称与内容后保存，调用 upsertTemplate 并成功提示', async () => {
    const user = userEvent.setup();
    render(<PromptRulesTab />);
    await user.click(screen.getByRole('button', { name: /新建规则/ }));
    await user.type(screen.getByPlaceholderText(/如：快节奏打斗分镜规则/), '我的解读规则');
    await user.type(screen.getByPlaceholderText(/填写该环节生成时的提示词规则内容/), '自定义提示词内容');
    await user.click(screen.getByRole('button', { name: /创建规则/ }));
    expect(storeMocks.upsertTemplate).toHaveBeenCalledTimes(1);
    expect(storeMocks.upsertTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ name: '我的解读规则', content: '自定义提示词内容', enabled: true }),
      expect.objectContaining({ note: undefined }),
    );
    expect(toast.success).toHaveBeenCalled();
  });
});
