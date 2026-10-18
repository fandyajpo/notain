// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { countUpValue, useCountUp } from './use-count-up';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

function stubMatchMedia(reduced: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })),
  );
}

/** Renders the hook's current value into a text node. */
function Probe({ target }: { target: number }): ReturnType<typeof createElement> {
  return createElement('span', null, String(useCountUp(target)));
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot> | undefined;

async function render(target: number): Promise<string> {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(Probe, { target }));
  });
  return container.textContent ?? '';
}

beforeEach(() => {
  document.body.innerHTML = '';
  stubMatchMedia(false);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

describe('countUpValue', () => {
  it('holds the endpoints exactly', () => {
    expect(countUpValue(0, 42, 0)).toBe(0);
    expect(countUpValue(0, 42, 1)).toBe(42);
    expect(countUpValue(3, 9, 1)).toBe(9);
  });

  it('eases out: past halfway the number is already close to the target', () => {
    // Ease-out cubic at t=0.5 lands at 0.875 of the way.
    expect(countUpValue(0, 100, 0.5)).toBe(88);
  });

  it('clamps progress outside 0–1', () => {
    expect(countUpValue(0, 10, -1)).toBe(0);
    expect(countUpValue(0, 10, 2)).toBe(10);
  });
});

describe('useCountUp', () => {
  it('starts at zero', async () => {
    // rAF never fires here, so the number must already read as its start.
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 0),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    expect(await render(5)).toBe('0');
  });

  it('settles on the target once the animation frame lands', async () => {
    let callback: FrameRequestCallback | undefined;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((cb: FrameRequestCallback) => {
        callback = cb;
        return 0;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    expect(await render(5)).toBe('0');
    await act(async () => {
      // A frame far enough ahead that progress >= 1: the hook jumps to target.
      callback?.(10_000);
    });
    expect(container.textContent).toBe('5');
  });

  it('jumps straight to the target for reduced-motion users', async () => {
    stubMatchMedia(true);
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 0),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    expect(await render(7)).toBe('7');
  });
});
