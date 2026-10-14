// vitest 全局 setup：jsdom 缺失的浏览器 API 补齐 + jest-dom 匹配器 + testing-library 自动清理
//
// 为什么补 polyfill 放这里而不是各测试文件里：
//   组件测试跑在 jsdom 上，而 jsdom 没有 ResizeObserver / IntersectionObserver / matchMedia /
//   scrollIntoView。recharts、react-resizable-panels、embla-carousel、cmdk、sonner、sidebar
//   等组件在 render 时就会调用它们 —— 不补的话，测试报的是「组件崩了」，实际是「环境没有」，
//   属于最容易误导人的假失败（本项目把「未验证 ≠ 通过」当红线，反向的假失败同样要治）。
//   setup 文件在测试模块 import 之前执行，因此必须放这里（写在测试的 beforeAll 里太晚）。
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe() {
      /* noop */
    }
    unobserve() {
      /* noop */
    }
    disconnect() {
      /* noop */
    }
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}

if (!('IntersectionObserver' in globalThis)) {
  class IntersectionObserverStub {
    root = null;
    rootMargin = '';
    thresholds: number[] = [];
    observe() {
      /* noop */
    }
    unobserve() {
      /* noop */
    }
    disconnect() {
      /* noop */
    }
    takeRecords() {
      return [];
    }
  }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IntersectionObserverStub;
}

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  const matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {
      /* noop */
    },
    removeEventListener() {
      /* noop */
    },
    addListener() {
      /* noop */
    },
    removeListener() {
      /* noop */
    },
    dispatchEvent: () => false,
  });
  window.matchMedia = matchMedia as unknown as typeof window.matchMedia;
}

// jsdom 未实现 Element.scrollIntoView（cmdk 等滚动选中项时会调用）
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {
    /* noop */
  };
}

afterEach(() => {
  cleanup();
});
