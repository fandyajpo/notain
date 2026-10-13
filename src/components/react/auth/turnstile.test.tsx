// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Turnstile } from './turnstile';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

type TurnstileStub = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
};

let container: HTMLDivElement;
let root: Root | undefined;

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
  document.body.innerHTML = '';
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  delete (window as { turnstile?: TurnstileStub }).turnstile;
});

describe('Turnstile', () => {
  it('renders nothing and never loads the script without a sitekey', async () => {
    await render(<Turnstile siteKey="" onToken={() => {}} />);

    expect(container.firstChild).toBeNull();
    expect(document.querySelector('script[src*="turnstile"]')).toBeNull();
  });

  it('renders the widget and reports the token it produces', async () => {
    const onToken = vi.fn();
    const renderWidget = vi.fn((_element: HTMLElement, options: Record<string, unknown>) => {
      (options.callback as (token: string) => void)('fresh-token');
      return 'widget-1';
    });
    (window as { turnstile?: TurnstileStub }).turnstile = {
      render: renderWidget,
      remove: vi.fn(),
    };

    await render(<Turnstile siteKey="site-key-test" onToken={onToken} />);

    expect(renderWidget).toHaveBeenCalledTimes(1);
    expect(onToken).toHaveBeenCalledWith('fresh-token');
    expect(container.querySelector('div')).not.toBeNull();
  });
});
