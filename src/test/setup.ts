import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

// jsdom lacks these browser APIs, which Mantine relies on. (Skipped in node-environment files.)
if (typeof window !== 'undefined') installBrowserStubs();

function installBrowserStubs() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        // Legacy API still called by some libraries.
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        addListener: () => undefined,
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList,
  });

  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  window.ResizeObserver = ResizeObserverStub;

  // Mantine's combobox scrolls the selected option into view.
  Element.prototype.scrollIntoView = function scrollIntoView() {};

  // Mantine's autosizing Textarea listens for web fonts loading.
  if (!('fonts' in document)) {
    Object.defineProperty(document, 'fonts', {
      value: {
        ready: Promise.resolve(),
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });
  }
}
