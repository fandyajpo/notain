// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './modal';
import { Select } from './select';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root | undefined;

// jsdom implements no layout *and* no scrolling: `scrollIntoView` does not
// exist on the prototype at all, so it cannot be spied on — only installed.
Element.prototype.scrollIntoView = () => {};

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
 * Awaited so the close that the keystroke triggers is flushed before the next
 * assertion — the dialog's listeners live on `document`, outside React's
 * synthetic system.
 */
const press = async (key: string, shiftKey = false) => {
  const target = panel() ?? document.body;
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
  });
};

/** The dialog's backdrop — the panel's parent, which owns the outside-press handlers. */
const backdrop = () => panel()?.parentElement ?? document.body;

const outsidePress = () => {
  act(() => {
    backdrop().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    backdrop().dispatchEvent(new MouseEvent('click', { bubbles: true }));
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
  container?.remove();
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
    await press('Tab');
    expect(document.activeElement).toBe(close);

    await press('Tab', true);
    expect(document.activeElement).toBe(dua);

    // Focus that somehow landed outside the dialog is pulled back in, rather
    // than allowed to walk the page behind the backdrop.
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    await act(async () => outside.focus());
    await press('Tab');
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

    await press('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape when the dialog is not dismissible', async () => {
    const onClose = vi.fn();
    await render(
      <Modal open onClose={onClose} dismissible={false} title="Judul">
        {body}
      </Modal>,
    );

    await press('Escape');
    expect(onClose).not.toHaveBeenCalled();
  });
});

// A dialog never dismisses itself for a keystroke or press aimed at something
// drawn above it — the portalled dropdown menus and nested confirms that sit
// at the end of `body` while the dialog stays mounted underneath. These use
// the real `Select`, which is the surface most often stacked on top.
describe('Modal with nested surfaces', () => {
  const options = [
    { value: 'a', label: 'Opsi A' },
    { value: 'b', label: 'Opsi B' },
  ];

  function SelectHarness({ onClose }: { onClose: () => void }) {
    const [value, setValue] = useState('');
    return (
      <Modal open onClose={onClose} title="Dialog">
        <Select value={value} onChange={setValue} options={options} placeholder="Pilih" />
      </Modal>
    );
  }

  const openMenu = async () => {
    const trigger = document.querySelector<HTMLElement>('[role="combobox"]');
    expect(trigger).toBeTruthy();
    await act(async () => trigger?.click());
    expect(document.querySelector('[role="listbox"]')).toBeTruthy();
  };

  it('closes an open menu on Escape instead of the dialog', async () => {
    const onClose = vi.fn();
    await render(<SelectHarness onClose={onClose} />);
    await openMenu();

    await press('Escape');
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    await press('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('skips the click that follows a menu press on the backdrop, once', async () => {
    const onClose = vi.fn();
    await render(<SelectHarness onClose={onClose} />);
    await openMenu();

    // The menu closes itself on the pointerdown; the click a beat later must
    // not fall through to the dialog.
    outsidePress();
    expect(onClose).not.toHaveBeenCalled();

    // Nothing is open anymore, so the same gesture is a plain outside press.
    outsidePress();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  function NestedHarness({
    onOuterClose,
    onInnerClose,
  }: {
    onOuterClose: () => void;
    onInnerClose: () => void;
  }) {
    const [outer, setOuter] = useState(true);
    const [inner, setInner] = useState(false);
    return (
      <Modal
        open={outer}
        onClose={() => {
          onOuterClose();
          setOuter(false);
        }}
        title="Luar"
      >
        <button type="button" onClick={() => setInner(true)}>
          Buka
        </button>
        <Modal
          open={inner}
          onClose={() => {
            onInnerClose();
            setInner(false);
          }}
          title="Dalam"
        >
          <button type="button">Dalam</button>
        </Modal>
      </Modal>
    );
  }

  it('closes the innermost dialog first', async () => {
    const onOuterClose = vi.fn();
    const onInnerClose = vi.fn();
    await render(<NestedHarness onOuterClose={onOuterClose} onInnerClose={onInnerClose} />);
    const opener = [...focusables()].find((button) => button.textContent === 'Buka');
    expect(opener).toBeTruthy();
    await act(async () => opener?.click());
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);

    await press('Escape');
    expect(onInnerClose).toHaveBeenCalledTimes(1);
    expect(onOuterClose).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);

    await press('Escape');
    expect(onOuterClose).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);
  });
});
