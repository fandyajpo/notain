import { describe, expect, it } from 'vitest';
import { createBlock, createDefaultLayout, TEMPLATE_LIMITS } from './model';
import {
  addBlock,
  canAddBlock,
  canHideBlock,
  canRemoveBlock,
  moveBlock,
  moveBlockBy,
  removeBlock,
  restoreRequiredBlocks,
  setBlockAlign,
  setBlockWidth,
  toggleBlockVisible,
} from './layout';

const ids = (layout: { id: string }[]) => layout.map((block) => block.id);
const types = (layout: { type: string }[]) => layout.map((block) => block.type);

describe('addBlock / canAddBlock', () => {
  it('appends a visible block with a fresh id', () => {
    const layout = createDefaultLayout();
    const next = addBlock(layout, 'divider');

    expect(next).toHaveLength(layout.length + 1);
    expect(next.at(-1)).toMatchObject({ type: 'divider', visible: true, align: 'left' });
    expect(new Set(ids(next)).size).toBe(next.length);
    expect(canAddBlock(layout)).toBe(true);
  });

  it('refuses to grow past the Appwrite column limit', () => {
    const layout = Array.from({ length: TEMPLATE_LIMITS.maxBlocks }, (_, index) =>
      createBlock('divider', `divider-${index}`),
    );

    expect(canAddBlock(layout)).toBe(false);
    expect(addBlock(layout, 'spacer')).toBe(layout);
  });
});

describe('removeBlock / canRemoveBlock', () => {
  it('removes an optional block', () => {
    const layout = [...createDefaultLayout(), createBlock('divider', 'divider-1')];
    const next = removeBlock(layout, 'divider-1');

    expect(ids(next)).not.toContain('divider-1');
    expect(next).toHaveLength(layout.length - 1);
  });

  it('refuses to remove the only visible copy of a required block', () => {
    const layout = createDefaultLayout();

    for (const id of ['letterhead', 'items', 'totals']) {
      expect(
        canRemoveBlock(
          layout,
          layout.find((block) => block.id === id)!,
        ),
      ).toBe(false);
      expect(removeBlock(layout, id)).toBe(layout);
    }
  });

  it('allows removing a required block once a second visible copy exists', () => {
    const layout = [...createDefaultLayout(), createBlock('items', 'items-2')];
    const first = layout.find((block) => block.id === 'items')!;

    expect(canRemoveBlock(layout, first)).toBe(true);
    expect(ids(removeBlock(layout, 'items'))).toContain('items-2');
  });

  it('lets a hidden required block go without breaking the page', () => {
    const layout = createDefaultLayout().map((block) =>
      block.id === 'items' ? { ...block, visible: false } : block,
    );
    const hidden = layout.find((block) => block.id === 'items')!;

    expect(canRemoveBlock(layout, hidden)).toBe(true);
    expect(ids(removeBlock(layout, 'items'))).not.toContain('items');
  });

  it('ignores an unknown id', () => {
    const layout = createDefaultLayout();
    expect(removeBlock(layout, 'nope')).toBe(layout);
  });
});

describe('toggleBlockVisible / canHideBlock', () => {
  it('hides an optional block', () => {
    const layout = createDefaultLayout();
    const next = toggleBlockVisible(layout, 'rich-header');

    expect(next.find((block) => block.id === 'rich-header')?.visible).toBe(false);
    expect(layout.find((block) => block.id === 'rich-header')?.visible).toBe(true);
  });

  it('refuses to hide the only visible required block', () => {
    const layout = createDefaultLayout();

    for (const id of ['letterhead', 'items', 'totals']) {
      expect(
        canHideBlock(
          layout,
          layout.find((block) => block.id === id)!,
        ),
      ).toBe(false);
      expect(toggleBlockVisible(layout, id)).toBe(layout);
    }
  });

  it('always allows revealing a hidden block', () => {
    const layout = createDefaultLayout().map((block) =>
      block.id === 'items' ? { ...block, visible: false } : block,
    );
    const hidden = layout.find((block) => block.id === 'items')!;

    expect(canHideBlock(layout, hidden)).toBe(true);
    expect(toggleBlockVisible(layout, 'items').find((b) => b.id === 'items')?.visible).toBe(true);
  });
});

describe('moveBlock / moveBlockBy', () => {
  it('reorders without touching the blocks themselves', () => {
    const layout = createDefaultLayout();
    const next = moveBlock(layout, 0, 2);

    expect(ids(next)).toEqual([
      layout[1]!.id,
      layout[2]!.id,
      layout[0]!.id,
      ...ids(layout).slice(3),
    ]);
    expect(next[0]).toBe(layout[1]);
    expect(ids(layout)).toEqual(ids(createDefaultLayout()));
  });

  it('clamps at both ends instead of throwing', () => {
    const layout = createDefaultLayout();

    expect(moveBlockBy(layout, ids(layout)[0]!, -1)).toBe(layout);
    expect(moveBlockBy(layout, ids(layout).at(-1)!, 1)).toBe(layout);
    expect(moveBlock(layout, -1, 0)).toBe(layout);
    expect(moveBlock(layout, 0, layout.length)).toBe(layout);
    expect(moveBlockBy(layout, 'nope', 1)).toBe(layout);
  });

  it('leaves the layout alone when asked not to move', () => {
    const layout = createDefaultLayout();
    expect(moveBlock(layout, 1, 1)).toBe(layout);
  });
});

describe('setBlockAlign', () => {
  it('changes one block and leaves the rest referentially intact', () => {
    const layout = createDefaultLayout();
    const next = setBlockAlign(layout, 'totals', 'left');

    expect(next.find((block) => block.id === 'totals')?.align).toBe('left');
    expect(next[1]).toBe(layout[1]);
  });

  it('is a no-op when the align already matches', () => {
    const layout = createDefaultLayout();
    expect(setBlockAlign(layout, 'totals', 'right')).toBe(layout);
    expect(setBlockAlign(layout, 'nope', 'center')).toBe(layout);
  });
});

describe('setBlockWidth', () => {
  it('changes one block and leaves the rest referentially intact', () => {
    const layout = createDefaultLayout();
    const next = setBlockWidth(layout, 'totals', 'narrow');

    expect(next.find((block) => block.id === 'totals')?.width).toBe('narrow');
    expect(next[1]).toBe(layout[1]);
  });

  it('is a no-op when the width already matches', () => {
    const layout = createDefaultLayout();
    expect(setBlockWidth(layout, 'totals', 'full')).toBe(layout);
    expect(setBlockWidth(layout, 'nope', 'wide')).toBe(layout);
  });
});

describe('restoreRequiredBlocks', () => {
  it('is a no-op on a layout that already qualifies', () => {
    const layout = createDefaultLayout();
    expect(restoreRequiredBlocks(layout)).toBe(layout);
  });

  it('reveals a required block that was turned off', () => {
    const layout = createDefaultLayout().map((block) =>
      block.id === 'totals' ? { ...block, visible: false } : block,
    );

    expect(restoreRequiredBlocks(layout).find((block) => block.id === 'totals')?.visible).toBe(
      true,
    );
  });

  it('adds back a required block that was deleted', () => {
    const layout = createDefaultLayout().filter((block) => block.id !== 'letterhead');
    const next = restoreRequiredBlocks(layout);

    expect(types(next)).toContain('letterhead');
    expect(next).toHaveLength(layout.length + 1);
  });
});
