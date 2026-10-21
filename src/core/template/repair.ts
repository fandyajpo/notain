import { getBuiltinTemplate } from './builtins';
import {
  REQUIRED_BLOCK_TYPES,
  TEMPLATE_LIMITS,
  type AuthoredTemplate,
  type TemplateBlock,
} from './model';

/**
 * Bringing a stored template back to something `invoiceTemplateSchema`
 * accepts.
 *
 * The row mapper already degrades *corrupt* columns (an unparseable theme, a
 * layout that is not an array) into a valid empty design, so what reaches the
 * edit dialog is always structurally sound. What it deliberately keeps — the
 * owner's real design — can still break the business rules: a block id
 * duplicated after a copy-paste, a required block the owner hid, a layout that
 * lost its totals block in some ancient save. Those load fine and then refuse
 * to save with a banner and no field to fix. Repairing at seed time — and
 * saying so — turns that into a visible, undoable-in-the-form change.
 */
export type TemplateRepairResult = { template: AuthoredTemplate; repaired: string[] };

export function repairTemplateContent(template: AuthoredTemplate): TemplateRepairResult {
  const repaired: string[] = [];

  let name = template.name.trim();
  if (!name) {
    name = 'Template';
    repaired.push('Nama template kosong diganti “Template”.');
  }
  if (name.length > TEMPLATE_LIMITS.name) {
    name = name.slice(0, TEMPLATE_LIMITS.name);
    repaired.push('Nama template terlalu panjang dan dipotong.');
  }

  return {
    template: { ...template, name, layout: repairLayout(template.layout, repaired) },
    repaired,
  };
}

function repairLayout(layout: TemplateBlock[], repaired: string[]): TemplateBlock[] {
  // Duplicate ids: re-mint in the shape the layout helpers use, keeping the
  // block itself (type, colour, order) untouched.
  const seen = new Set<string>();
  const deduped = layout.map((block) => {
    if (!seen.has(block.id)) {
      seen.add(block.id);
      return block;
    }
    let candidate = `${block.type}-2`;
    let counter = 3;
    while (seen.has(candidate)) {
      candidate = `${block.type}-${counter}`;
      counter += 1;
    }
    seen.add(candidate);
    repaired.push('ID blok duplikat diganti.');
    return { ...block, id: candidate };
  });

  // The schema only counts *visible* blocks of each required type, so a
  // hidden kop is as fatal as a missing one. Widened to `string` so a check
  // against any block type is not a type error.
  const visible = new Set(deduped.filter((block) => block.visible).map((block) => block.type));
  const missing: string[] = REQUIRED_BLOCK_TYPES.filter((type) => !visible.has(type));

  const unhidden = deduped.map((block) => {
    if (!missing.includes(block.type) || block.visible) return block;
    repaired.push('Blok wajib yang disembunyikan ditampilkan kembali.');
    return { ...block, visible: true };
  });

  const result = [...unhidden];
  for (const type of missing) {
    if (result.some((block) => block.type === type)) continue;
    const source = getBuiltinTemplate('classic')?.layout.find((block) => block.type === type);
    if (!source) continue;
    result.push({ ...source, id: `${type}-repair` });
    repaired.push('Blok wajib yang hilang ditambahkan kembali.');
  }

  if (result.length > TEMPLATE_LIMITS.maxBlocks) {
    const required = new Set<string>(REQUIRED_BLOCK_TYPES);
    const overflow = result.length - TEMPLATE_LIMITS.maxBlocks;
    const trimmed: TemplateBlock[] = [];
    let dropped = 0;
    // Drop from the end, but never a required block — those are what make the
    // template saveable in the first place.
    for (let index = result.length - 1; index >= 0; index -= 1) {
      const block = result[index];
      if (dropped < overflow && !required.has(block.type)) {
        dropped += 1;
        continue;
      }
      trimmed.unshift(block);
    }
    if (dropped > 0) repaired.push('Jumlah blok melebihi batas dan dipotong.');
    return trimmed;
  }
  return result;
}
