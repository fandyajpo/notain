import { CircleAlert } from 'lucide-react';
import { useId, type ReactNode } from 'react';

type ControlProps = {
  invalid?: boolean;
  className?: string;
};

/** Shared surface for every text-like control so styles stay in one place. */
export function controlClass({ invalid = false, className = '' }: ControlProps = {}): string {
  return [
    'w-full rounded-control border bg-card px-3.5 text-sm text-foreground shadow-card',
    'transition-colors placeholder:text-muted focus-ring',
    invalid ? 'border-danger' : 'border-border',
    'disabled:cursor-not-allowed disabled:bg-background disabled:text-muted disabled:shadow-none',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

type FieldShellProps = {
  label: string;
  htmlFor: string;
  /**
   * Whatever TanStack Form puts in `meta.errors`. A Zod 4 schema used as a
   * Standard Schema validator reports raw issue *objects*
   * (`{ origin, code, minimum, inclusive, path, message }`), never a string —
   * see `errorMessage`.
   */
  error?: unknown;
  hint?: string | undefined;
  required?: boolean;
  children: ReactNode;
};

/**
 * Narrows whatever the validator handed back into something renderable.
 *
 * Rendering a raw Zod issue as a React child throws
 * "Objects are not valid as a React child", which is what emptying a required
 * field in the invoice builder used to do. Every field error goes through
 * here so a schema upgrade can never crash the page again.
 */
export function errorMessage(error: unknown): string | undefined {
  if (typeof error === 'string') return error || undefined;
  if (typeof error !== 'object' || error === null) return undefined;

  const record = error as Record<string, unknown>;
  if (typeof record.message === 'string' && record.message !== '') return record.message;

  // A Standard Schema validator reports the whole ZodError, not one issue.
  if (Array.isArray(record.issues)) return errorMessage(record.issues[0]);

  return undefined;
}

/** Label + control + error slot, wired up for accessibility. */
export function FieldShell({
  label,
  htmlFor,
  error,
  hint,
  required = false,
  children,
}: FieldShellProps) {
  const message = errorMessage(error);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {children}
      {message ? (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="flex items-start gap-1.5 text-xs font-medium text-danger"
        >
          <CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{message}</span>
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function useFieldIds(explicit?: string) {
  const generated = useId();
  const id = explicit ?? `field-${generated}`;
  return { id, errorId: `${id}-error` };
}
