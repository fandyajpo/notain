// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './modal';

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

const panel = () => document.querySelector<HTMLElement>('[role="dialog"]');
const focusables = () => (panel() ? [...panel()!.querySelectorAll('button')] : []);
/**
 * Delivers a keydown to the dialog. It is dispatched on the panel rather than
 * on `document.activeElement` on purpose: focus may sit outside the React
 * tree, and React only routes an event that bubbles through markup it owns.
 */
const press = (key: string, shiftKey = false) => {
  const target = panel() ?? document.body;
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
  });
};

beforeEach(() => {
  // jsdom implements no layout, so every element reports a zero-size rect and
  // the Modal's visibility filter would decide nothing is focusable. Pretend
  // everything is on screen; visibility itself is the browser's job.
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  document.body.innerHTML = '';
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container.remove();
  vi.restoreAllMocks();
});

describe('Modal focus containment', () => {
  const body = (
    <>
      <button type="button">Satu</button>
      <button type="button">Dua</button>
    </>
  );

  it('takes focus when it opens', async () => {
    await render(
      <Modal open onClose={() => {}} title="Judul">
        {body}
      </Modal>,
    );

    expect(document.activeElement).toBe(panel());
  });

  it('keeps Tab inside the dialog, wrapping both ways', async () => {
    await render(
      <Modal open onClose={() => {}} title="Judul">
        {body}
      </Modal>,
    );

    const [close, , dua] = focusables();
    expect(focusables()).toHaveLength(3);

    await act(async () => dua?.focus());
    press('Tab');
    expect(document.activeElement).toBe(close);

    press('Tab', true);
    expect(document.activeElement).toBe(dua);

    // Focus that somehow landed outside the dialog is pulled back in, rather
    // than allowed to walk the page behind the backdrop.
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    await act(async () => outside.focus());
    press('Tab');
    expect(document.activeElement).toBe(close);
  });

  it('hands focus back to whatever opened it', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    function Harness({ open }: { open: boolean }) {
      return (
        <Modal open={open} onClose={() => {}} title="Judul">
          {body}
        </Modal>
      );
    }

    await render(<Harness open />);
    expect(document.activeElement).toBe(panel());

    await act(async () => root?.render(<Harness open={false} />));
    expect(document.activeElement).toBe(opener);
  });

  it('closes on Escape when dismissible', async () => {
    const onClose = vi.fn();
    await render(
      <Modal open onClose={onClose} title="Judul">
        {body}
      </Modal>,
    );

    press('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape when the dialog is not dismissible', async () => {
    const onClose = vi.fn();
    await render(
      <Modal open onClose={onClose} dismissible={false} title="Judul">
        {body}
      </Modal>,
    );

    press('Escape');
    expect(onClose).not.toHaveBeenCalled();
  });
});
