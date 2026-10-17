import { Card } from '../ui/card';
import { FieldShell, useFieldIds } from '../ui/field';
import { Input } from '../ui/input';
import type { BusinessDetailField } from '../../../core/business/detail-fields';
import { INVOICE_LIMITS } from '../../../core/invoice/model';

/**
 * The invoice-level facts a trade expects beyond the shared columns — a
 * bengkel's vehicle name and plate, a laundry's weight. Renders nothing when
 * the active business type has no catalogue entry, so generic invoices are
 * untouched; empty values are dropped from the record rather than stored as
 * blank strings.
 */
export function DetailFieldsCard({
  fields,
  values,
  onChange,
}: {
  fields: readonly BusinessDetailField[];
  values: Record<string, string>;
  onChange: (details: Record<string, string>) => void;
}) {
  if (fields.length === 0) return null;

  function setValue(key: string, value: string) {
    const next = { ...values };
    if (value === '') delete next[key];
    else next[key] = value;
    onChange(next);
  }

  return (
    <Card className="flex flex-col gap-5">
      <h2 className="text-section">Detail bisnis</h2>
      <p className="text-xs text-muted">
        Info tambahan sesuai jenis usaha kamu. Yang diisi akan ikut tercetak di invoice.
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        {fields.map((field) => (
          <DetailFieldInput
            key={field.key}
            field={field}
            value={values[field.key] ?? ''}
            onChange={(value) => setValue(field.key, value)}
          />
        ))}
      </div>
    </Card>
  );
}

function DetailFieldInput({
  field,
  value,
  onChange,
}: {
  field: BusinessDetailField;
  value: string;
  onChange: (value: string) => void;
}) {
  const { id } = useFieldIds();
  const type = field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text';

  return (
    <FieldShell label={field.label} htmlFor={id}>
      <Input
        id={id}
        type={type}
        inputMode={field.type === 'number' ? 'decimal' : undefined}
        // Only free text needs the cap; a date picker cannot overshoot it and
        // a number box is bounded by the schema on submit.
        maxLength={field.type === 'text' ? INVOICE_LIMITS.detailValue : undefined}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </FieldShell>
  );
}
