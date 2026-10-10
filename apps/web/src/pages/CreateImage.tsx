// EXPORTS: default CreateImagePage
// 智能创作 · 图片（3.4 / 7.6）
import GenWorkbench from '@/components/common/GenWorkbench';

export default function CreateImagePage() {
  return (
    <GenWorkbench
      kind="image"
      title="图片创作"
      description="输入提示词与参数，选择已配置且能力兼容的模型与线路，提交生成任务。"
      params={[
        { key: 'prompt', label: '提示词', type: 'textarea', defaultValue: '雾夜钟楼，主角剪影走向街灯' },
        { key: 'negative', label: '负面提示词', type: 'textarea', defaultValue: 'low quality, blurry, extra fingers' },
        { key: 'ratio', label: '画面比例', type: 'select', options: ['16:9', '9:16', '1:1'], defaultValue: '16:9' },
        { key: 'model', label: '模型', type: 'select', options: ['SDXL', 'Flux', 'MJ-V6', 'SDXL-Turbo'], defaultValue: 'SDXL' },
        { key: 'channel', label: '线路', type: 'select', options: ['官方 API', '合规中转 API'], defaultValue: '官方 API' },
        { key: 'count', label: '数量', type: 'number', defaultValue: '2' },
      ]}
      unitCost="¥0.06"
    />
  );
}
