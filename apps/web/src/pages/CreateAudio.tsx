// EXPORTS: default CreateAudioPage
// 智能创作 · 音频（ADR-006 D8：模型目录不含 audio 类型，故 catalogBacked=false，
// 页面如实标注"未接入执行链路"，不展示无依据的模型档位）
import CreateWorkbench from '@/features/genworkbench/CreateWorkbench';

export default function CreateAudioPage() {
  return <CreateWorkbench kind="audio" />;
}
