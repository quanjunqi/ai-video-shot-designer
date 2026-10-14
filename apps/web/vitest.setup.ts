// vitest 全局 setup：注入 jest-dom 匹配器 + testing-library 自动清理
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

afterEach(() => {
  cleanup();
});
