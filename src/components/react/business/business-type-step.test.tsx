// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessTypeStep } from './business-type-step';

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

function button(label: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe('BusinessTypeStep', () => {
  it('cannot continue until a type is chosen', async () => {
    await render(<BusinessTypeStep onPick={() => {}} onSkip={() => {}} />);

    expect(button('Lanjutkan')?.disabled).toBe(true);

    const row = document.querySelector<HTMLElement>('[data-subtype="kedai-kopi"]');
    await act(async () => row?.click());

    expect(button('Lanjutkan')?.disabled).toBe(false);
  });

  it('starts preselected from the remembered profile choice', async () => {
    await render(
      <BusinessTypeStep value="bengkel-mobil" onPick={() => {}} onSkip={() => {}} />,
    );

    expect(button('Lanjutkan')?.disabled).toBe(false);
    expect(
      document.querySelector('[data-subtype="bengkel-mobil"]')?.getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      document.querySelector('[data-subtype="kedai-kopi"]')?.getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('hands the picked type to the caller', async () => {
    const onPick = vi.fn();
    await render(<BusinessTypeStep onPick={onPick} onSkip={() => {}} />);

    await act(async () =>
      document.querySelector<HTMLElement>('[data-subtype="kedai-kopi"]')?.click(),
    );
    await act(async () => button('Lanjutkan')?.click());

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('kedai-kopi');
  });

  it('lets the user pass without choosing anything', async () => {
    const onPick = vi.fn();
    const onSkip = vi.fn();
    await render(<BusinessTypeStep onPick={onPick} onSkip={onSkip} />);

    await act(async () => button('Lewati, pakai yang umum')?.click());

    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('explains what the answer is for', async () => {
    await render(<BusinessTypeStep onPick={() => {}} onSkip={() => {}} />);

    expect(document.body.textContent).toContain('Jenis usaha kamu');
    expect(document.body.textContent).toContain('bisa diubah kapan saja di Pengaturan');
  });
});
