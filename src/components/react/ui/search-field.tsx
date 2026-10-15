import { Search } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cx } from '../../../lib/ui/classes';
import { Input } from './input';
import { useFieldIds } from './field';

/**
 * The search input used in every list toolbar (invoices, customers,
 * templates, admin). One composition so the icon, inset and compact height
 * never drift between pages again.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  id: explicitId,
  className,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
} & Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'id' | 'className' | 'type' | 'size'>) {
  const { id } = useFieldIds(explicitId);

  return (
    <div className={cx('relative w-full sm:max-w-xs', className)}>
      <Search
        size={15}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
      />
      <Input
        id={id}
        type="text"
        size="sm"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="pl-9"
        {...rest}
      />
    </div>
  );
}
