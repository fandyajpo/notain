// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { Menu, type MenuItem } from './menu';

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

// The panel is portalled to `document.body`, so these query the whole document.
const trigger = () => document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
const panel = () => document.querySelector<HTMLElement>('[role="menu"]');
const menuItems = () => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));

function renderMenu(items: MenuItem[]) {
  return render(
    <Menu label="Aksi INV-0001" items={items}>
      <span aria-hidden="true">⋯</span>
    </Menu>,
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe('Menu', () => {
  it('is closed until the trigger is pressed, then shows a menuitem per item', async () => {
    await renderMenu([
      { label: 'Buka & edit', href: '/invoice/1' },
      { label: 'Hapus', variant: 'danger', onClick: vi.fn() },
    ]);

    expect(trigger()?.getAttribute('aria-expanded')).toBe('false');
    expect(trigger()?.getAttribute('aria-haspopup')).toBe('menu');
    expect(panel()).toBeNull();

    await act(async () => trigger()!.click());

    expect(trigger()?.getAttribute('aria-expanded')).toBe('true');
    expect(panel()?.getAttribute('aria-label')).toBe('Aksi INV-0001');
    expect(menuItems()).toHaveLength(2);
  });

  it('runs a plain item onClick and closes the menu', async () => {
    const onClick = vi.fn();
    await renderMenu([{ label: 'Hapus', variant: 'danger', onClick }]);

    await act(async () => trigger()!.click());
    await act(async () => menuItems()[0]!.click());

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(panel()).toBeNull();
  });

  it('renders an item with an href as a link', async () => {
    await renderMenu([{ label: 'Buka & edit', href: '/invoice/9' }]);

    await act(async () => trigger()!.click());

    const link = menuItems()[0] as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/invoice/9');
  });

  it('renders a disabled item as disabled', async () => {
    await renderMenu([{ label: 'Hapus', onClick: vi.fn(), disabled: true }]);

    await act(async () => trigger()!.click());

    expect(menuItems()[0]!.hasAttribute('disabled')).toBe(true);
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    await renderMenu([{ label: 'Hapus', onClick: vi.fn() }]);

    await act(async () => trigger()!.click());
    expect(panel()).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });
});
