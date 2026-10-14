// 让 vitest 测试文件获得 jest-dom 匹配器类型（toBeInTheDocument 等）
// vitest.setup.ts 运行时已注入；此声明文件只负责类型可见性
import '@testing-library/jest-dom/vitest';
