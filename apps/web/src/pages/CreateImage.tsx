// EXPORTS: default CreateImagePage
// 智能创作 · 图片（ADR-006 D5：页面只声明 kind，参数控件由模型目录能力推导）
import CreateWorkbench from '@/features/genworkbench/CreateWorkbench';

export default function CreateImagePage() {
  return <CreateWorkbench kind="image" />;
}
