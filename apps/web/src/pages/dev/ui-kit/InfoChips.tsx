// 工程信息的「标签 + 等宽 chip 列表」原子块（工程规格表与详情弹层共用）。
// 只导出组件：react-refresh 的 only-export-components 规则要求组件文件不混导常量。
export function InfoChips({ label, items }: { label: string; items: string[] }) {
  // 生成器会抽到重复条目（同名 prop / 重复注记），渲染前去重，避免 React 重复 key。
  const unique = [...new Set(items)];
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <div className="flex min-w-0 flex-wrap gap-1">
        {unique.length > 0 ? (
          unique.map((item) => (
            <code
              key={item}
              className="bg-muted text-muted-foreground max-w-full rounded-sm px-1.5 py-0.5 font-mono text-xs break-all"
            >
              {item}
            </code>
          ))
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </div>
    </div>
  );
}
