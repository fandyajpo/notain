<script setup lang="ts">
import { CE_EVENTS } from '../shared/contracts';

type Row = { id: string; name: string; quantity: number; unitPrice: number };

const props = withDefaults(defineProps<{ label?: string; rows?: Row[] }>(), {
  label: 'Vue',
  rows: () => [],
});

function emit(event: Event, name: string, detail: unknown) {
  (event.currentTarget as HTMLElement).dispatchEvent(
    new CustomEvent(name, { detail, bubbles: true }),
  );
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-3">
    <span data-probe-label class="text-sm font-medium">{{ props.label }}</span>
    <span data-probe-count class="text-sm text-muted">{{ props.rows.length }} rows</span>
    <button
      type="button"
      data-probe="vue-items"
      class="rounded-control border border-border bg-card px-3 py-1.5 text-sm"
      @click="(event: Event) => emit(event, CE_EVENTS.itemsChange, { items: props.rows })"
    >
      emit items
    </button>
    <button
      type="button"
      data-probe="vue-pick"
      class="rounded-control border border-border bg-card px-3 py-1.5 text-sm"
      @click="
        (event: Event) =>
          emit(event, CE_EVENTS.pick, {
            kind: 'customer',
            name: props.label,
            phone: '081200000002',
          })
      "
    >
      emit pick
    </button>
  </div>
</template>
