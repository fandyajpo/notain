// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './error-boundary';
import { IslandBoundary } from './island-boundary';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root | undefined;

function Boom({ message = 'kaboom' }: { message?: string }): never {
  throw new Error(message);
}

async function render(node: ReactNode) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(node);
  });
}

beforeEach(() => {
  // React reports caught render errors through console.error; silence it so the
  // intentional throws below do not read as test failures.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
  }
  root = undefined;
  container?.remove();
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders its children when nothing throws', async () => {
    await render(
      <ErrorBoundary fallback={() => <p>fallback</p>}>
        <p>aman</p>
      </ErrorBoundary>,
    );
    expect(container.textContent).toBe('aman');
  });

  it('renders the fallback instead of a blank subtree when a child throws', async () => {
    await render(
      <ErrorBoundary fallback={(error) => <p>gagal: {error.message}</p>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(container.textContent).toBe('gagal: kaboom');
    expect(container.querySelector('p')).toBeTruthy();
  });

  it('reports the error through onError', async () => {
    const onError = vi.fn();
    await render(
      <ErrorBoundary fallback={() => <p>fallback</p>} onError={onError}>
        <Boom message="meledak" />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect((onError.mock.calls[0][0] as Error).message).toBe('meledak');
  });

  it('re-renders the children after reset, so a retry can succeed', async () => {
    let shouldThrow = true;
    function Flaky(): ReactNode {
      if (shouldThrow) throw new Error('sekali saja');
      return <p>pulih</p>;
    }

    let reset: (() => void) | undefined;
    await render(
      <ErrorBoundary
        fallback={(_error, doReset) => {
          reset = doReset;
          return <button onClick={doReset}>coba lagi</button>;
        }}
      >
        <Flaky />
      </ErrorBoundary>,
    );

    expect(container.textContent).toBe('coba lagi');
    expect(reset).toBeTypeOf('function');

    shouldThrow = false;
    await act(async () => {
      reset?.();
    });
    expect(container.textContent).toBe('pulih');
  });
});

describe('IslandBoundary', () => {
  it('shows an alert with a reload action instead of leaving a blank page', async () => {
    await render(
      <IslandBoundary>
        <Boom />
      </IslandBoundary>,
    );

    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toContain('Halaman ini gagal dimuat');
    expect(container.querySelector('button')?.textContent).toBe('Muat ulang');
  });

  it('surfaces the underlying message while running in dev', async () => {
    await render(
      <IslandBoundary>
        <Boom message="chunk gagal dimuat" />
      </IslandBoundary>,
    );
    // `import.meta.env.DEV` is true under Vitest.
    expect(container.textContent).toContain('chunk gagal dimuat');
  });
});
