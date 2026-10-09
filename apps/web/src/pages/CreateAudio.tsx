// EXPORTS: default CreateAudioPage
// 智能创作 · 音频（3.4：首期支持语音合成及试听/下载；其他音频能力按模型目录声明）
import GenWorkbench from '@/components/common/GenWorkbench';

export default function CreateAudioPage() {
  return (
    <GenWorkbench
      kind="audio"
      title="音频创作"
      description="首期支持语音合成（TTS）及试听/下载；其他音频能力按模型目录声明，不展示不可用控件。"
      params={[
        { key: 'text', label: '合成文本', type: 'textarea', defaultValue: '「二十三时四十七分，末班车准时驶离站台。」' },
        { key: 'voice', label: '音色', type: 'select', options: ['沉稳男声', '清亮女声', '童声', '旁白'], defaultValue: '沉稳男声' },
        { key: 'duration', label: '时长（秒）', type: 'number', defaultValue: '12' },
        { key: 'channel', label: '线路', type: 'select', options: ['官方 API', '合规中转 API'], defaultValue: '官方 API' },
      ]}
      unitCost="¥0.04"
    />
  );
}
