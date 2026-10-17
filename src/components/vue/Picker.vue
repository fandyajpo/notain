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

function meta(option: AnyOption): string {
  if (option.kind === 'customer') {
    return option.phone || option.email || 'Tanpa kontak';
  }
  return formatRupiah(option.unitPrice);
}

/**
 * Select-only: picking fills the form but files nothing. A customer that is
 * not on file yet is filed automatically when the invoice is saved — the
 * builder's submit path records whoever the invoice was issued to.
 */
function choose(option: AnyOption) {
  const detail =
    option.kind === 'customer'
      ? { kind: 'customer', name: option.name, phone: option.phone, email: option.email }
      : {
          kind: 'product',
          name: option.name,
          quantity: 1,
          unitPrice: option.unitPrice,
          ...(option.unit ? { unit: option.unit } : {}),
        };
  host.dispatchEvent(new CustomEvent(CE_EVENTS.pick, { detail, bubbles: true }));
  query.value = '';
  open.value = false;
  activeIndex.value = -1;
}

function onKeydown(event: KeyboardEvent) {
  const last = matches.value.length - 1;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    open.value = true;
    activeIndex.value = activeIndex.value >= last ? 0 : activeIndex.value + 1;
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeIndex.value = activeIndex.value <= 0 ? last : activeIndex.value - 1;
  } else if (event.key === 'Enter') {
    const option = matches.value[activeIndex.value];
    if (open.value && option) {
      event.preventDefault();
      choose(option);
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
      v-if="open && matches.length > 0"
      :id="listId"
      role="listbox"
      class="flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-control border border-border bg-card p-1 shadow-card"
      data-picker-list
    >
      <li
        v-for="(option, index) in matches"
        :id="`${listId}-${index}`"
        :key="`${option.kind}-${option.label}-${option.unitPrice ?? 0}`"
        role="option"
        :aria-selected="index === activeIndex"
        class="cursor-pointer rounded-control px-2.5 py-2 text-sm"
        :class="index === activeIndex ? 'bg-background text-foreground' : 'text-foreground'"
        :data-picker-option="option.kind"
        @mouseenter="activeIndex = index"
        @mousedown.prevent="choose(option)"
      >
        <span class="flex items-center justify-between gap-3">
          <span class="truncate">{{ option.label }}</span>
          <span class="shrink-0 text-xs text-muted">{{ meta(option) }}</span>
        </span>
      </li>
    </ul>

    <p v-else-if="open && query.trim()" class="text-xs text-muted" data-picker-empty>
      {{
        props.mode === 'customer'
          ? 'Tidak ada customer yang cocok.'
          : 'Tidak ada riwayat yang cocok.'
      }}
    </p>
  </div>
</template>
