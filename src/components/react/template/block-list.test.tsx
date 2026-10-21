// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createDefaultLayout, type TemplateBlock } from '../../../core/template/model';
import { BlockList } from './block-list';

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

async function renderList(layout: TemplateBlock[], onChange = vi.fn()) {
  await render(<BlockList layout={layout} onChange={onChange} />);
  return onChange;
}

const rows = () => Array.from(container.querySelectorAll<HTMLElement>('[data-block-row]'));
const idsOf = (layout: TemplateBlock[]) => layout.map((block) => block.id);

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe('BlockList', () => {
  it('renders one row per block, in order', async () => {
    const layout = createDefaultLayout();
    await renderList(layout);

    expect(rows()).toHaveLength(layout.length);
    expect(rows().map((row) => row.dataset.blockRow)).toEqual(idsOf(layout));
  });

  it('moves a block down one place when the arrow is pressed', async () => {
    const layout = createDefaultLayout();
    const onChange = await renderList(layout);

    await act(async () =>
      rows()[0]!.querySelector<HTMLButtonElement>('[aria-label^="Turunkan"]')!.click(),
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0] as TemplateBlock[];
    expect(idsOf(next)).toEqual([layout[1]!.id, layout[0]!.id, ...idsOf(layout).slice(2)]);
    // The original is untouched — the helpers never mutate their input.
    expect(idsOf(layout)).toEqual(idsOf(createDefaultLayout()));
  });

  it('will not move the last block further down', async () => {
    const layout = createDefaultLayout();
    const onChange = await renderList(layout);
    const last = rows().at(-1)!;

    expect(last.querySelector<HTMLButtonElement>('[aria-label^="Turunkan"]')?.disabled).toBe(true);
    expect(last.querySelector<HTMLButtonElement>('[aria-label^="Naikkan"]')?.disabled).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('locks the required blocks', async () => {
    const layout = createDefaultLayout();
    const onChange = await renderList(layout);

    for (const row of rows()) {
      if (!row.textContent?.includes('wajib')) continue;
      expect(row.querySelector<HTMLButtonElement>('[aria-label^="Hapus"]')?.disabled).toBe(true);
      expect(row.querySelector<HTMLButtonElement>('[aria-label^="Sembunyikan"]')?.disabled).toBe(
        true,
      );
    }

    // An optional block stays removable.
    const optional = rows().find((row) => !row.textContent?.includes('wajib'))!;
    expect(optional.querySelector<HTMLButtonElement>('[aria-label^="Hapus"]')?.disabled).toBe(
      false,
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('adds a block from the palette', async () => {
    const layout = createDefaultLayout();
    const onChange = await renderList(layout);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button:not([aria-label])')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0] as TemplateBlock[];
    expect(next).toHaveLength(layout.length + 1);
    expect(next.at(-1)).toMatchObject({ type: 'letterhead', visible: true });
  });

  it('narrows one block without touching the others', async () => {
    const layout = createDefaultLayout();
    const onChange = await renderList(layout);

    await act(async () =>
      rows()[0]!.querySelector<HTMLButtonElement>('[title="Lebar sempit"]')!.click(),
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0] as TemplateBlock[];
    expect(next[0]?.width).toBe('narrow');
    expect(next[1]).toBe(layout[1]);
    expect(idsOf(next)).toEqual(idsOf(layout));
  });

  it('marks the width a block already has as pressed', async () => {
    const layout = createDefaultLayout();
    await renderList(layout);

    const pressed = rows()[0]!.querySelectorAll<HTMLButtonElement>('[aria-pressed="true"]');
    const titles = [...pressed].map((button) => button.getAttribute('title'));
    expect(titles).toContain('Lebar penuh');
    expect(titles).toContain('Rata kiri');
  });

  it('aligns one block without touching the others', async () => {
    const layout = createDefaultLayout();
    const onChange = await renderList(layout);

    const center = rows()[1]!.querySelector<HTMLButtonElement>('[aria-label^="Rata tengah"]')!;
    expect(center.getAttribute('aria-pressed')).toBe('false');
    await act(async () => center.click());

    const next = onChange.mock.calls[0]![0] as TemplateBlock[];
    expect(next[1]!.align).toBe('center');
    expect(next[0]).toBe(layout[0]);
    expect(next[2]).toBe(layout[2]);
  });
});
