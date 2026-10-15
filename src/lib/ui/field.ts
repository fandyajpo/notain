// Single source lives in `lib/ui/classes.ts`; re-exported here so existing
// `import { controlClass } from './field'` callers keep working.
export { controlClass } from './classes';

export function fieldId(
  id: string | null | undefined,
  name: string | null | undefined,
  label: string | null | undefined,
): string {
  if (id) return id;
  const source = name ?? label ?? 'field';
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `field-${slug || 'input'}`;
}
