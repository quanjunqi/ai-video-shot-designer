// 规则版本历史列表组件测试：空态 / 展开收起 / 恢复回调 / 版本展示
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RuleVersionList from './RuleVersionList';

const versions = [
  { version: 1, savedAt: 1728000000000, note: '初始版本', snapshot: { name: 'v1' } },
  { version: 2, savedAt: 1728003600000, note: '调整拆集', snapshot: { name: 'v2' } },
];

describe('RuleVersionList', () => {
  it('无版本时渲染 null（不占位）', () => {
    const { container } = render(
      <RuleVersionList currentVersion={1} versions={[]} onRestore={vi.fn()} renderSummary={() => ''} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('展示版本数与当前版本号，默认收起', () => {
    render(
      <RuleVersionList currentVersion={2} versions={versions} onRestore={vi.fn()} renderSummary={(s) => String(s.name)} />,
    );
    expect(screen.getByRole('button', { name: /版本历史（2）/ })).toBeInTheDocument();
    expect(screen.getByText('当前 v2')).toBeInTheDocument();
    // 默认收起：具体版本行不可见
    expect(screen.queryByText('v1')).not.toBeInTheDocument();
  });

  it('点击展开后显示各版本摘要，再点收起', async () => {
    const user = userEvent.setup();
    render(
      <RuleVersionList currentVersion={2} versions={versions} onRestore={vi.fn()} renderSummary={(s) => `摘要:${String(s.name)}`} />,
    );
    await user.click(screen.getByRole('button', { name: /版本历史（2）/ }));
    expect(screen.getByText('摘要:v1')).toBeInTheDocument();
    expect(screen.getByText('摘要:v2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /版本历史（2）/ }));
    expect(screen.queryByText('摘要:v1')).not.toBeInTheDocument();
  });

  it('点击恢复调用 onRestore 且携带正确版本号', async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();
    render(
      <RuleVersionList currentVersion={2} versions={versions} onRestore={onRestore} renderSummary={(s) => String(s.name)} />,
    );
    await user.click(screen.getByRole('button', { name: /版本历史（2）/ }));
    const restoreButtons = screen.getAllByRole('button', { name: /恢复/ });
    expect(restoreButtons).toHaveLength(2);
    await user.click(restoreButtons[0]); // 列表逆序，第一项是最新 v2
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onRestore).toHaveBeenCalledWith(2);
  });
});
