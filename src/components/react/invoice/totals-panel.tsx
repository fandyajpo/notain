import type { InvoiceAdjustment, AdjustmentType } from '../../../core/invoice/model';
import { calculateTotals } from '../../../core/invoice/calculator';
import { formatAmountForInput, parseRupiah } from '../../../core/shared/money';
import type { InvoiceItem } from '../../../core/invoice/model';
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
          <div className="flex overflow-hidden rounded-control border border-border bg-card shadow-card">
            <TypeButton
              label={`${label} nominal`}
              active={!isPercent}
              onClick={() => onChange({ ...adjustment, type: 'amount' })}
            >
              Rp
            </TypeButton>
            <TypeButton
              label={`${label} persen`}
              active={isPercent}
              onClick={() => onChange({ ...adjustment, type: 'percent' })}
            >
              %
            </TypeButton>
          </div>

          <input
            id={`${label}-value`}
            type="text"
            inputMode="numeric"
            aria-label={`${label} ${isPercent ? 'dalam persen' : 'dalam rupiah'}`}
            aria-invalid={error ? 'true' : undefined}
            value={
              isPercent ? String(adjustment.value || '') : formatAmountForInput(adjustment.value)
            }
            placeholder="0"
            className={[
              'h-10 w-28 rounded-control border bg-card px-3 text-right text-sm tabular-nums shadow-card focus-ring',
              error ? 'border-danger' : 'border-border',
            ].join(' ')}
            onChange={(event) => {
              const raw = event.target.value.replace(/[^\d.,]/g, '');
              const parsed = raw === '' ? 0 : parseRupiah(raw);
              onChange({ ...adjustment, value: Number.isFinite(parsed) ? parsed : 0 });
            }}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-right text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function TypeButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={[
        'px-2.5 py-1.5 text-xs font-medium transition-colors focus-ring',
        active ? 'bg-accent text-accent-foreground' : 'text-muted hover:text-foreground',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export type { AdjustmentType };
