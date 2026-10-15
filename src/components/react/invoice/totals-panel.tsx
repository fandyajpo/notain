import type { InvoiceAdjustment, AdjustmentType } from '../../../core/invoice/model';
import { calculateTotals } from '../../../core/invoice/calculator';
import { formatAmountForInput, parseRupiah } from '../../../core/shared/money';
import type { InvoiceItem } from '../../../core/invoice/model';
import { Input } from '../ui/input';
import { SegmentedControl } from '../ui/segmented';
import { CalcInspector } from './calc-inspector';

type Props = {
  items: InvoiceItem[];
  discount: InvoiceAdjustment;
  tax: InvoiceAdjustment;
  onDiscountChange: (adjustment: InvoiceAdjustment) => void;
  onTaxChange: (adjustment: InvoiceAdjustment) => void;
  errors?: Record<string, string> | undefined;
};

export function TotalsPanel({
  items,
  discount,
  tax,
  onDiscountChange,
  onTaxChange,
  errors,
}: Props) {
  const totals = calculateTotals({ items, discount, tax });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <AdjustmentRow
          label="Diskon"
          adjustment={discount}
          onChange={onDiscountChange}
          error={errors?.['discount.value']}
        />
        <AdjustmentRow
          label="Pajak"
          adjustment={tax}
          onChange={onTaxChange}
          error={errors?.['tax.value']}
        />
      </div>

      <CalcInspector totals={totals} />
    </div>
  );
}

type AdjustmentRowProps = {
  label: string;
  adjustment: InvoiceAdjustment;
  onChange: (adjustment: InvoiceAdjustment) => void;
  error?: string | undefined;
};

function AdjustmentRow({ label, adjustment, onChange, error }: AdjustmentRowProps) {
  const isPercent = adjustment.type === 'percent';

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm text-muted" htmlFor={`${label}-value`}>
          {label}
        </label>

        <div className="flex items-center gap-2">
          <SegmentedControl<AdjustmentType>
            value={adjustment.type}
            onChange={(type) => onChange({ ...adjustment, type })}
            options={[
              { value: 'amount', label: 'Rp' },
              { value: 'percent', label: '%' },
            ]}
            size="sm"
            ariaLabel={`${label} tipe`}
          />

          <div className="w-28 shrink-0">
            <Input
              id={`${label}-value`}
              type="text"
              inputMode="numeric"
              size="sm"
              aria-label={`${label} ${isPercent ? 'dalam persen' : 'dalam rupiah'}`}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? `${label}-value-error` : undefined}
              invalid={Boolean(error)}
              value={
                isPercent
                  ? String(adjustment.value || '')
                  : formatAmountForInput(adjustment.value)
              }
              placeholder="0"
              className="text-right tabular-nums"
              onChange={(event) => {
                const raw = event.target.value.replace(/[^\d.,]/g, '');
                const parsed = raw === '' ? 0 : parseRupiah(raw);
                onChange({ ...adjustment, value: Number.isFinite(parsed) ? parsed : 0 });
              }}
            />
          </div>
        </div>
      </div>

      {error && (
        <p id={`${label}-value-error`} role="alert" className="text-right text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export type { AdjustmentType };
