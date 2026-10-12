<script setup lang="ts">
import { computed, ref, useHost, useId } from 'vue';
import { formatRupiah } from '../../core/shared/money';
import { controlClass } from '../../lib/ui/field';
import { CE_EVENTS } from '../shared/contracts';
import type { CustomerOption, ProductOption } from '../shared/picker-options';

type Mode = 'customer' | 'product';
type AnyOption = CustomerOption | ProductOption;

const props = withDefaults(
  defineProps<{
    /** Which history list to search: customers fill the form, products append a row. */
    mode?: Mode;
    customers?: CustomerOption[];
    products?: ProductOption[];
    label?: string;
    placeholder?: string;
    maxResults?: number;
  }>(),
  {
    mode: 'customer',
    customers: () => [],
    products: () => [],
    label: '',
    placeholder: 'Ketik untuk mencari…',
    maxResults: 8,
  },
);

const host = useHost();
const wrapper = ref<HTMLElement | null>(null);
const inputId = `notain-picker-${useId()}`;
const listId = `${inputId}-list`;

const query = ref('');
const open = ref(false);
const activeIndex = ref(-1);

/**
 * Sentinel appended to the list when the typed name is not on file. It is
 * compared by identity in the template, so it never collides with a real
 * suggestion.
 */
const NEW_ROW: AnyOption = {
  kind: 'customer',
  label: '__new__',
  name: '',
  phone: '',
  lastUsedAt: '',
  invoiceCount: 0,
};

const options = computed<AnyOption[]>(() =>
  props.mode === 'customer' ? props.customers : props.products,
);

const matches = computed<AnyOption[]>(() => {
  const needle = query.value.trim().toLowerCase();
  const list = needle
    ? options.value.filter((option) => option.label.toLowerCase().includes(needle))
    : options.value;
  return list.slice(0, props.maxResults);
});

const activeDescendant = computed(() =>
  activeIndex.value >= 0 && open.value ? `${listId}-${activeIndex.value}` : undefined,
);

/**
 * A typed customer that is not already in the list is offered as a new entry.
 * Products never get this: an unknown product belongs in the item grid, where
 * the quantity and price can actually be set.
 */
const canCreate = computed(() => {
  if (props.mode !== 'customer') return false;
  const needle = query.value.trim().toLowerCase();
  if (!needle) return false;
  return !options.value.some((option) => option.label.trim().toLowerCase() === needle);
});

/** `matches` plus the trailing "add as new" row, so arrow keys reach it too. */
const rows = computed<AnyOption[]>(() =>
  canCreate.value ? [...matches.value, NEW_ROW] : matches.value,
);

function createCustomer() {
  const name = query.value.trim();
  if (!name) return;
  host.dispatchEvent(
    new CustomEvent(CE_EVENTS.pick, {
      detail: { kind: 'customer', name, phone: '' },
      bubbles: true,
    }),
  );
  query.value = '';
  open.value = false;
  activeIndex.value = -1;
}

function meta(option: AnyOption): string {
  if (option.kind === 'customer') return option.phone || 'Tanpa nomor';
  return formatRupiah(option.unitPrice);
}

function choose(option: AnyOption) {
  const detail =
    option.kind === 'customer'
      ? { kind: 'customer', name: option.name, phone: option.phone }
      : { kind: 'product', name: option.name, quantity: 1, unitPrice: option.unitPrice };
  host.dispatchEvent(new CustomEvent(CE_EVENTS.pick, { detail, bubbles: true }));
  query.value = '';
  open.value = false;
  activeIndex.value = -1;
}

function onKeydown(event: KeyboardEvent) {
  const last = rows.value.length - 1;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    open.value = true;
    activeIndex.value = activeIndex.value >= last ? 0 : activeIndex.value + 1;
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeIndex.value = activeIndex.value <= 0 ? last : activeIndex.value - 1;
  } else if (event.key === 'Enter') {
    const option = rows.value[activeIndex.value];
    if (open.value && option) {
      event.preventDefault();
      if (option === NEW_ROW) createCustomer();
      else choose(option);
    }
  } else if (event.key === 'Escape') {
    open.value = false;
    activeIndex.value = -1;
  }
}

function onBlur(event: FocusEvent) {
  const next = event.relatedTarget as Node | null;
  if (!next || !wrapper.value?.contains(next)) {
    open.value = false;
    activeIndex.value = -1;
  }
}
</script>

<template>
  <div
    ref="wrapper"
    class="flex flex-col gap-1.5"
    data-picker
    :data-mode="props.mode"
    @focusout="onBlur"
  >
    <label class="text-sm font-medium text-foreground" :for="inputId">
      {{ props.label }}
    </label>

    <input
      :id="inputId"
      v-model="query"
      type="text"
      role="combobox"
      autocomplete="off"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="listId"
      aria-autocomplete="list"
      :aria-activedescendant="activeDescendant"
      :placeholder="props.placeholder"
      :class="controlClass({ className: 'h-11' })"
      data-picker-input
      @focus="open = true"
      @keydown="onKeydown"
    />

    <ul
      v-if="open && rows.length > 0"
      :id="listId"
      role="listbox"
      class="flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-control border border-border bg-card p-1 shadow-card"
      data-picker-list
    >
      <li
        v-for="(option, index) in rows"
        :id="`${listId}-${index}`"
        :key="`${option.kind}-${option.label}-${option.unitPrice ?? 0}`"
        role="option"
        :aria-selected="index === activeIndex"
        class="cursor-pointer rounded-control px-2.5 py-2 text-sm"
        :class="index === activeIndex ? 'bg-background text-foreground' : 'text-foreground'"
        :data-picker-option="option === NEW_ROW ? 'create' : option.kind"
        @mouseenter="activeIndex = index"
        @mousedown.prevent="option === NEW_ROW ? createCustomer() : choose(option)"
      >
        <span class="flex items-center justify-between gap-3">
          <span class="truncate">
            <template v-if="option === NEW_ROW">Tambah “{{ query.trim() }}”</template>
            <template v-else>{{ option.label }}</template>
          </span>
          <span v-if="option !== NEW_ROW" class="shrink-0 text-xs text-muted">{{
            meta(option)
          }}</span>
          <span v-else class="shrink-0 text-xs text-muted">Customer baru</span>
        </span>
      </li>
    </ul>

    <p v-else-if="open && query.trim()" class="text-xs text-muted" data-picker-empty>
      Tidak ada riwayat yang cocok.
    </p>
  </div>
</template>
