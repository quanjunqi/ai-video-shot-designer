// M10：试跑产物 URL 抽取（独立模块——避免组件文件导出非组件触发 react-refresh 门禁）
// 执行器 extracted 键统一带 output. 前缀（curl 实证），协议模板声明键（data.0.url）作兼容兜底；
// 与后端 artifactKeys 语义对齐（image_url/video_url/url/result）。
const ARTIFACT_KEYS = [
  'output.data.0.url',
  'data.0.url',
  'output.image_urls.0',
  'image_urls.0',
  'image_url',
  'url',
  'result',
];

export function extractRunArtifact(run?: { extracted?: Record<string, unknown> } | null): string {
  const extracted = run?.extracted;
  if (!extracted) return '';
  for (const k of ARTIFACT_KEYS) {
    const v = extracted[k];
    if (typeof v === 'string' && /^https?:\/\/.+/.test(v.trim())) return v.trim();
  }
  return '';
}
