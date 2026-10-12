/**
 * Pure block-layout operations for the template editor.
 *
 * Every rule that decides whether a template can still be saved lives here —
 * not in the React component — so it is testable without a DOM and cannot be
 * bypassed by a stray click. Each function returns a new array except when it
 * is a no-op, in which case it returns the input unchanged so React bails out
 * of the re-render and TanStack Form does not mark the template dirty.
 */

import {
  createBlock,
  REQUIRED_BLOCK_TYPES,
  TEMPLATE_LIMITS,
  type BlockAlign,
  type BlockType,
  type BlockWidth,
  type TemplateBlock,
} from './model';

const REQUIRED = new Set<string>(REQUIRED_BLOCK_TYPES);

function visibleCount(layout: TemplateBlock[], type: BlockType): number {
  let count = 0;
  for (const block of layout) {
    if (block.visible && block.type === type) count += 1;
  }
  return count;
}

/** Whether there is still room under `TEMPLATE_LIMITS.maxBlocks`. */
export function canAddBlock(layout: TemplateBlock[]): boolean {
  return layout.length < TEMPLATE_LIMITS.maxBlocks;
}

export function addBlock(layout: TemplateBlock[], type: BlockType): TemplateBlock[] {
  if (!canAddBlock(layout)) return layout;
  return [...layout, createBlock(type)];
}

/**
 * Whether this block may be removed right now.
 *
 * A hidden block always may — removing it cannot change what is on the page.
 * A visible one may if its type is optional, or if another visible block of
 * the same type would still satisfy `REQUIRED_BLOCK_TYPES`.
 */
export function canRemoveBlock(layout: TemplateBlock[], block: TemplateBlock): boolean {
  if (!block.visible) return true;
  if (!REQUIRED.has(block.type)) return true;
  return visibleCount(layout, block.type) > 1;
}

/** Whether this block may be turned off. Mirrors `canRemoveBlock`. */
export function canHideBlock(layout: TemplateBlock[], block: TemplateBlock): boolean {
  if (!block.visible) return true;
  if (!REQUIRED.has(block.type)) return true;
  return visibleCount(layout, block.type) > 1;
}

export function removeBlock(layout: TemplateBlock[], id: string): TemplateBlock[] {
  const target = layout.find((block) => block.id === id);
  if (!target || !canRemoveBlock(layout, target)) return layout;
  return layout.filter((block) => block.id !== id);
}

export function toggleBlockVisible(layout: TemplateBlock[], id: string): TemplateBlock[] {
  const target = layout.find((block) => block.id === id);
  if (!target) return layout;
  if (target.visible && !canHideBlock(layout, target)) return layout;
  return layout.map((block) => (block.id === id ? { ...block, visible: !block.visible } : block));
}

/** Reorders by index. Out-of-range indices are a no-op, not a throw. */
export function moveBlock(layout: TemplateBlock[], from: number, to: number): TemplateBlock[] {
  if (from === to) return layout;
  if (from < 0 || from >= layout.length) return layout;
  if (to < 0 || to >= layout.length) return layout;
  const next = [...layout];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** The up/down buttons: one step, clamped at both ends. */
export function moveBlockBy(layout: TemplateBlock[], id: string, delta: number): TemplateBlock[] {
  const from = layout.findIndex((block) => block.id === id);
  if (from < 0) return layout;
  return moveBlock(layout, from, from + delta);
}

export function setBlockAlign(
  layout: TemplateBlock[],
  id: string,
  align: BlockAlign,
): TemplateBlock[] {
  const target = layout.find((block) => block.id === id);
  if (!target || target.align === align) return layout;
  return layout.map((block) => (block.id === id ? { ...block, align } : block));
}

export function setBlockWidth(
  layout: TemplateBlock[],
  id: string,
  width: BlockWidth,
): TemplateBlock[] {
  const target = layout.find((block) => block.id === id);
  if (!target || target.width === width) return layout;
  return layout.map((block) => (block.id === id ? { ...block, width } : block));
}

/** A layout with every required type present and visible, whatever the input. */
export function restoreRequiredBlocks(layout: TemplateBlock[]): TemplateBlock[] {
  const next = [...layout];
  let changed = false;
  const visible = new Set(next.filter((block) => block.visible).map((block) => block.type));

  for (const type of REQUIRED_BLOCK_TYPES) {
    if (visible.has(type)) continue;
    changed = true;
    const hidden = next.find((block) => block.type === type);
    if (hidden) {
      const index = next.indexOf(hidden);
      next[index] = { ...hidden, visible: true };
    } else {
      next.push(createBlock(type));
    }
  }
  return changed ? next : layout;
}
