<svelte:options customElement={{ tag: 'notain-probe-svelte', shadow: 'none' }} />

<script lang="ts">
  import { CE_EVENTS } from '../shared/contracts';

  type Row = { id: string; name: string; quantity: number; unitPrice: number };

  let { label = 'Svelte', rows = [] } = $props<{ label?: string; rows?: Row[] }>();

  function emit(event: Event, name: string, detail: unknown) {
    (event.currentTarget as HTMLElement).dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true }),
    );
  }
</script>

<div class="flex flex-wrap items-center gap-3">
  <span data-probe-label class="text-sm font-medium">{label}</span>
  <span data-probe-count class="text-sm text-muted">{rows.length} rows</span>
  <button
    type="button"
    data-probe="svelte-items"
    class="rounded-control border border-border bg-card px-3 py-1.5 text-sm"
    onclick={(event) => emit(event, CE_EVENTS.itemsChange, { items: rows })}
  >
    emit items
  </button>
  <button
    type="button"
    data-probe="svelte-pick"
    class="rounded-control border border-border bg-card px-3 py-1.5 text-sm"
    onclick={(event) =>
      emit(event, CE_EVENTS.pick, { kind: 'customer', name: label, phone: '081200000001' })}
  >
    emit pick
  </button>
</div>
