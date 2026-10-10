// 本地确定性哈希（演示模式：正式环境由服务端计算并落盘）
export function mockHash(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = (h1 ^ c) * 0x01000193;
    h2 = (h2 ^ (c << 1)) * 0x85ebca6b;
  }
  const a = (h1 >>> 0).toString(16).padStart(8, '0');
  const b = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${a}${b}${String(text.length).padStart(8, '0')}${String(text.length % 97).padStart(2, '0')}`;
}
