type ControlOptions = {
  invalid?: boolean;
  /** Multi-line controls (textarea) drop the fixed height and grow instead. */
  multiline?: boolean;
  className?: string;
};

/**
 * The single source of truth for every text-like control's surface. The React
 * twin lives in `components/react/ui/field.tsx` and mirrors these exact
 * classes — change one, change both.
 */
export function controlClass({
  invalid = false,
  multiline = false,
  className = '',
}: ControlOptions = {}) {
  return [
    'w-full rounded-control border bg-card px-3.5 text-sm text-foreground shadow-card',
    'transition-colors placeholder:text-muted',
    'focus-ring',
    invalid ? 'border-danger' : 'border-border',
    'disabled:cursor-not-allowed disabled:bg-background disabled:text-muted disabled:shadow-none',
    'read-only:cursor-default read-only:bg-background',
    multiline ? 'min-h-24 resize-y py-2.5 leading-relaxed' : 'h-11',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

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
