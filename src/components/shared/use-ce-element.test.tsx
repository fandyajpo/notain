// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCeDefined } from './use-ce-element';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

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

function Host({ tag, register }: { tag: string; register: () => Promise<unknown> }) {
  const defined = useCeDefined(tag, register);
  return <span data-testid={defined ? 'element' : 'placeholder'}>{tag}</span>;
}

const uniqueTag = () => `notain-test-${Math.random().toString(36).slice(2, 8)}`;

describe('useCeDefined', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    root?.unmount();
    container?.remove();
    root = undefined;
  });

  it('holds a placeholder until register() resolves, then reports the element', async () => {
    const tag = uniqueTag();
    let finish: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });

    await render(
      <Host
        tag={tag}
        register={() =>
          pending.then(() => {
            customElements.define(tag, class extends HTMLElement {});
          })
        }
      />,
    );

    expect(
      container.querySelector('[data-testid="placeholder"]'),
      'tag belum terdaftar',
    ).toBeTruthy();
    expect(container.querySelector('[data-testid="element"]')).toBeNull();

    await act(async () => {
      finish?.();
      await pending;
    });

    expect(container.querySelector('[data-testid="element"]'), 'registrasi selesai').toBeTruthy();
    expect(container.querySelector('[data-testid="placeholder"]')).toBeNull();
  });

  it('renders the element straight away when the tag is already registered', async () => {
    const tag = uniqueTag();
    customElements.define(tag, class extends HTMLElement {});
    const register = vi.fn(() => Promise.resolve());

    await render(<Host tag={tag} register={register} />);

    expect(container.querySelector('[data-testid="element"]')).toBeTruthy();
    expect(register).not.toHaveBeenCalled();
  });

  it('keeps the placeholder and logs when registration fails', async () => {
    const tag = uniqueTag();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await render(<Host tag={tag} register={() => Promise.reject(new Error('rusak'))} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="placeholder"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="element"]')).toBeNull();
    expect(
      error.mock.calls.some((call) => String(call[0]).includes(tag)),
      'pesan error menyebut tag-nya',
    ).toBe(true);
  });
});
