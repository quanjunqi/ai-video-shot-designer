// EXPORTS: default CreateVideoPage
// 智能创作 · 视频（3.4 / 7.6）
import GenWorkbench from '@/components/common/GenWorkbench';

export default function CreateVideoPage() {
  return (
    <GenWorkbench
      kind="video"
      title="视频创作"
      description="镜头语言与运镜参数，选择视频模型与线路；任务进入任务中心独立执行。"
      params={[
        { key: 'prompt', label: '镜头内容', type: 'textarea', defaultValue: '钟楼整点钟声，人群抬头仰望，雾气流动' },
        { key: 'ratio', label: '画面比例', type: 'select', options: ['16:9', '9:16', '1:1'], defaultValue: '16:9' },
        { key: 'duration', label: '时长（秒）', type: 'number', defaultValue: '8' },
        { key: 'fps', label: '帧率', type: 'select', options: ['24', '30', '60'], defaultValue: '24' },
        { key: 'model', label: '模型', type: 'select', options: ['Seedance 2.0', 'Seedance 2.5', 'Kling 1.6'], defaultValue: 'Seedance 2.0' },
        { key: 'channel', label: '线路', type: 'select', options: ['官方 API', '合规中转 API'], defaultValue: '官方 API' },
      ]}
      unitCost="¥0.18"
    />
  );
}
