/** @jsxImportSource solid-js */
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { CE_EVENTS } from '../shared/contracts';

type Row = { id: string; name: string; quantity: number; unitPrice: number };

function Probe(props: { label: string; rows: Row[] }) {
  return (
    <div class="flex flex-wrap items-center gap-3">
      <span data-probe-label class="text-sm font-medium">
        {props.label}
      </span>
      <span data-probe-count class="text-sm text-muted">
        {props.rows.length} rows
      </span>
      <button
        type="button"
        data-probe="solid-items"
        class="rounded-control border border-border bg-card px-3 py-1.5 text-sm"
        onClick={(event) => emit(event.currentTarget, CE_EVENTS.itemsChange, { items: props.rows })}
      >
        emit items
      </button>
      <button
        type="button"
        data-probe="solid-pick"
        class="rounded-control border border-border bg-card px-3 py-1.5 text-sm"
        onClick={(event) =>
          emit(event.currentTarget, CE_EVENTS.pick, {
            kind: 'product',
            name: props.label,
            quantity: 1,
            unitPrice: 5000,
          })
        }
      >
        emit pick
      </button>
    </div>
  );
}

function emit(target: HTMLElement, name: string, detail: unknown) {
  target.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
}

// The class body is only evaluated in a DOM environment: `extends HTMLElement`
// would throw during SSR otherwise.
if (typeof HTMLElement !== 'undefined') {
  class NotainProbeSolid extends HTMLElement {
    #label = createSignal('Solid');
    #rows = createSignal<Row[]>([]);
    #dispose: (() => void) | undefined;

    get label(): string {
      return this.#label[0]();
    }

    set label(value: string) {
      this.#label[1](String(value));
    }

    get rows(): Row[] {
      return this.#rows[0]();
    }

    set rows(value: Row[]) {
      this.#rows[1](value ?? []);
    }

    connectedCallback() {
      if (this.#dispose) return;
      this.#dispose = render(() => <Probe label={this.#label[0]()} rows={this.#rows[0]()} />, this);
    }

    disconnectedCallback() {
      this.#dispose?.();
      this.#dispose = undefined;
    }
  }

  if (!customElements.get('notain-probe-solid')) {
    customElements.define('notain-probe-solid', NotainProbeSolid);
  }
}
