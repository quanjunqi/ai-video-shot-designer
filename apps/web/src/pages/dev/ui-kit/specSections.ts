// 设计规范稿的小节清单（编号 + 锚点 + 标题），左目录与各小节标题共用同一份事实源。
// 纯常量模块（不含 JSX），组件文件不混导常量，避免 react-refresh only-export-components 报错。
export type SpecSectionMeta = { id: string; number: string; title: string };

export const SPEC_SECTIONS: SpecSectionMeta[] = [
  { id: 'spec-color', number: '01', title: '色彩' },
  { id: 'spec-type', number: '02', title: '字体' },
  { id: 'spec-space', number: '03', title: '间距' },
  { id: 'spec-radius', number: '04', title: '圆角' },
  { id: 'spec-shadow', number: '05', title: '阴影' },
  { id: 'spec-motion', number: '06', title: '动效' },
  { id: 'spec-states', number: '07', title: '控件状态' },
  { id: 'spec-scenarios', number: '08', title: '应用场景' },
];
