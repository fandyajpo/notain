/** @jsxImportSource solid-js */
import { createSignal, Show } from 'solid-js';
import { render } from 'solid-js/web';
import { formatRupiah } from '../../core/shared/money';

/** Read-only financial summary. All numbers come from `core/invoice/calculator`. */
export type CalcTotals = {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
};

const ZERO: CalcTotals = { subtotal: 0, discountAmount: 0, taxAmount: 0, grandTotal: 0 };

/**
 * `totals` is a getter, not a plain value: Solid's `render()` only tracks
 * reactivity that happens inside the JSX, so the signal has to be read there
 * rather than once up front.
 */
function Inspector(props: { totals: () => CalcTotals }) {
  return (
    <dl class="flex flex-col gap-2 border-t border-border pt-3 text-sm" data-calc-inspector>
      <div class="flex justify-between gap-4">
        <dt class="text-muted">Subtotal</dt>
        <dd class="tabular-nums" data-subtotal>
          {formatRupiah(props.totals().subtotal)}
        </dd>
      </div>
      <Show when={props.totals().discountAmount > 0}>
        <div class="flex justify-between gap-4">
          <dt class="text-muted">Diskon</dt>
          <dd class="tabular-nums text-danger">−{formatRupiah(props.totals().discountAmount)}</dd>
        </div>
      </Show>
      <Show when={props.totals().taxAmount > 0}>
        <div class="flex justify-between gap-4">
          <dt class="text-muted">Pajak</dt>
          <dd class="tabular-nums">+{formatRupiah(props.totals().taxAmount)}</dd>
        </div>
      </Show>
      <div class="flex justify-between gap-4 border-t border-border pt-2">
        <dt class="font-semibold">Total</dt>
        <dd class="text-lg font-semibold tabular-nums text-accent" data-total>
          {formatRupiah(props.totals().grandTotal)}
        </dd>
      </div>
    </dl>
  );
}

function toTotals(value: unknown): CalcTotals {
  if (!value || typeof value !== 'object') return ZERO;
  const source = value as Partial<Record<keyof CalcTotals, unknown>>;
  const read = (key: keyof CalcTotals) => {
    const raw = source[key];
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
  };
  return {
    subtotal: read('subtotal'),
    discountAmount: read('discountAmount'),
    taxAmount: read('taxAmount'),
    grandTotal: read('grandTotal'),
  };
}

// The class body is only evaluated in a DOM environment: `extends HTMLElement`
// would throw during SSR otherwise.
if (typeof HTMLElement !== 'undefined') {
  class NotainCalcInspector extends HTMLElement {
    #totals = createSignal<CalcTotals>(ZERO);
    #dispose: (() => void) | undefined;

    get totals(): CalcTotals {
      return this.#totals[0]();
    }

    set totals(value: unknown) {
      this.#totals[1](toTotals(value));
    }

    connectedCallback() {
      if (this.#dispose) return;
      this.#dispose = render(() => <Inspector totals={() => this.#totals[0]()} />, this);
    }

    disconnectedCallback() {
      this.#dispose?.();
      this.#dispose = undefined;
    }
  }

  if (!customElements.get('notain-calc-inspector')) {
    customElements.define('notain-calc-inspector', NotainCalcInspector);
  }
}
