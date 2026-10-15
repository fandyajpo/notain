<svelte:options customElement={{ tag: 'notain-items-grid', shadow: 'none' }} />

<script lang="ts">
  import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-svelte';
  import { cubicOut } from 'svelte/easing';
  import { calculateItemSubtotal } from '../../core/invoice/calculator';
  import {
    createItem,
    createItemId,
    INVOICE_LIMITS,
    type InvoiceItem,
  } from '../../core/invoice/model';
  import { formatAmountForInput, formatRupiah, parseRupiah } from '../../core/shared/money';
  import { controlClass } from '../../lib/ui/field';
  import { CE_EVENTS } from '../shared/contracts';

  type Props = {
    /** Controlled list — React owns the form, so every edit re-emits all rows. */
    items?: InvoiceItem[];
    maxItems?: number;
    /** Form-level validation message for the whole list. */
    errorMessage?: string;
  };

  let { items = [], maxItems = INVOICE_LIMITS.maxItems, errorMessage = '' } = $props<Props>();

  let root: HTMLDivElement;
  /** Below Tailwind's `md` breakpoint the table reflows into stacked cards. */
  let isNarrow = $state(false);

  const canAdd = $derived(items.length < maxItems);

  $effect(() => {
    // Some test/SSR environments have no matchMedia — fall back to the desktop
    // table rather than crash.
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(max-width: 767px)');
    const sync = () => {
      isNarrow = query.matches;
    };
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  });

  function emit(next: InvoiceItem[]) {
    root.dispatchEvent(
      new CustomEvent(CE_EVENTS.itemsChange, { detail: { items: next }, bubbles: true }),
    );
  }

  function patch(id: string, changes: Partial<InvoiceItem>) {
    emit(items.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }

  function remove(id: string) {
    emit(items.filter((item) => item.id !== id));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = items.slice();
    const current = next[index];
    next[index] = next[target];
    next[target] = current;
    emit(next);
  }

  function add() {
    if (!canAdd) return;
    emit([...items, createItem(createItemId())]);
  }

  // No `matchMedia` (SSR, jsdom tests) or an explicit reduced-motion preference
  // both collapse the transition to nothing.
  const prefersReduced =
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * Slide + fade for a row appearing or going away. Table rows ignore
   * `transform`, so on the desktop layout this degrades to a clean fade; the
   * mobile card layout also slides.
   */
  function itemRow(_node: Element, params?: { y?: number }) {
    const y = params?.y ?? 10;
    return {
      duration: prefersReduced ? 0 : 190,
      easing: cubicOut,
      css: (t: number) => `opacity: ${t}; transform: translateY(${(1 - t) * y}px);`,
    };
  }
</script>

<div bind:this={root} class="flex flex-col gap-3" data-items-grid>
  {#if isNarrow}
    <!-- Mobile: one stacked card per item so nothing needs a horizontal scroll. -->
    <div class="flex flex-col gap-3">
      {#each items as item, index (item.id)}
        <div
          class="rounded-card border border-border bg-card p-3"
          data-item-row={item.id}
          transition:itemRow={{ y: 12 }}
        >
          <div class="flex items-center gap-2">
            <span class="shrink-0 text-xs font-medium tabular-nums text-muted">#{index + 1}</span>
            <input
              type="text"
              value={item.name}
              placeholder="Nasi Goreng"
              aria-label="Nama barang"
              autoComplete="off"
              class={controlClass({ className: 'h-10 min-w-0 flex-1' })}
              oninput={(event) => patch(item.id, { name: event.currentTarget.value })}
            />
            <button
              type="button"
              aria-label={`Hapus ${item.name || 'barang'}`}
              onclick={() => remove(item.id)}
              class="shrink-0 rounded-control p-2 text-muted transition-colors hover:bg-danger-soft hover:text-danger focus-ring"
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>

          <div class="mt-2 grid grid-cols-2 gap-2">
            <label class="flex flex-col gap-1">
              <span class="text-xs text-muted">Jumlah</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={item.quantity}
                aria-label="Jumlah"
                class={controlClass({ className: 'h-10 text-right' })}
                oninput={(event) =>
                  patch(item.id, {
                    quantity: Math.max(1, Number(event.currentTarget.value) || 1),
                  })}
              />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-xs text-muted">Harga satuan</span>
              <input
                type="text"
                inputMode="numeric"
                value={formatAmountForInput(item.unitPrice)}
                placeholder="0"
                aria-label="Harga satuan dalam rupiah"
                class={controlClass({ className: 'h-10 text-right' })}
                oninput={(event) =>
                  patch(item.id, { unitPrice: parseRupiah(event.currentTarget.value) || 0 })}
              />
            </label>
          </div>

          <div class="mt-2 flex items-center justify-between">
            <div class="flex items-center gap-0.5">
              <button
                type="button"
                aria-label={`Naikkan ${item.name || 'barang'}`}
                disabled={index === 0}
                onclick={() => move(index, -1)}
                class="rounded-control p-1.5 text-muted transition-colors hover:bg-background hover:text-foreground focus-ring disabled:pointer-events-none disabled:opacity-40"
              >
                <ChevronUp size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Turunkan ${item.name || 'barang'}`}
                disabled={index === items.length - 1}
                onclick={() => move(index, 1)}
                class="rounded-control p-1.5 text-muted transition-colors hover:bg-background hover:text-foreground focus-ring disabled:pointer-events-none disabled:opacity-40"
              >
                <ChevronDown size={16} aria-hidden="true" />
              </button>
            </div>
            <div class="flex items-baseline gap-2">
              <span class="text-xs text-muted">Subtotal</span>
              <span class="text-sm font-medium tabular-nums" data-item-subtotal>
                {formatRupiah(calculateItemSubtotal(item))}
              </span>
            </div>
          </div>
        </div>
      {/each}

      {#if items.length === 0}
        <p class="rounded-card border border-dashed border-border py-8 text-center text-sm text-muted">
          Belum ada barang. Tambahkan minimal satu item.
        </p>
      {/if}

      {#if canAdd}
        <button
          type="button"
          data-add-item
          onclick={add}
          class="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-border bg-transparent px-3 text-sm font-medium text-muted transition-colors hover:border-foreground/30 hover:text-foreground focus-ring"
        >
          <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
          Tambah barang
        </button>
      {/if}
    </div>
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr class="border-b border-border">
            <th scope="col" class="pb-2 text-left text-xs font-medium text-muted">Nama barang</th>
            <th scope="col" class="w-24 pb-2 text-right text-xs font-medium text-muted">Jumlah</th>
            <th scope="col" class="w-40 pb-2 text-right text-xs font-medium text-muted"
              >Harga satuan</th
            >
            <th scope="col" class="w-36 pb-2 text-right text-xs font-medium text-muted">Subtotal</th>
            <th scope="col" class="w-20 pb-2 text-right text-xs font-medium text-muted">
              <span class="sr-only">Urutan</span>
            </th>
            <th scope="col" class="w-12 pb-2 text-right text-xs font-medium text-muted">
              <span class="sr-only">Aksi</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {#each items as item, index (item.id)}
            <tr
              class="border-b border-border/70 align-middle"
              data-item-row={item.id}
              transition:itemRow={{ y: 8 }}
            >
              <td class="py-2 pr-2">
                <input
                  type="text"
                  value={item.name}
                  placeholder="Nasi Goreng"
                  aria-label="Nama barang"
                  autoComplete="off"
                  class={controlClass({ className: 'h-10' })}
                  oninput={(event) => patch(item.id, { name: event.currentTarget.value })}
                />
              </td>
              <td class="py-2 pr-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={item.quantity}
                  aria-label="Jumlah"
                  class={controlClass({ className: 'h-10 text-right' })}
                  oninput={(event) =>
                    patch(item.id, {
                      quantity: Math.max(1, Number(event.currentTarget.value) || 1),
                    })}
                />
              </td>
              <td class="py-2 pr-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatAmountForInput(item.unitPrice)}
                  placeholder="0"
                  aria-label="Harga satuan dalam rupiah"
                  class={controlClass({ className: 'h-10 text-right' })}
                  oninput={(event) =>
                    patch(item.id, { unitPrice: parseRupiah(event.currentTarget.value) || 0 })}
                />
              </td>
              <td class="py-2 pr-2">
                <span class="block text-right text-sm font-medium tabular-nums" data-item-subtotal>
                  {formatRupiah(calculateItemSubtotal(item))}
                </span>
              </td>
              <td class="py-2 pr-2">
                <div class="flex items-center justify-end gap-0.5">
                  <button
                    type="button"
                    aria-label={`Naikkan ${item.name || 'barang'}`}
                    disabled={index === 0}
                    onclick={() => move(index, -1)}
                    class="rounded-control p-1.5 text-muted transition-colors hover:bg-background hover:text-foreground focus-ring disabled:pointer-events-none disabled:opacity-40"
                  >
                    <ChevronUp size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Turunkan ${item.name || 'barang'}`}
                    disabled={index === items.length - 1}
                    onclick={() => move(index, 1)}
                    class="rounded-control p-1.5 text-muted transition-colors hover:bg-background hover:text-foreground focus-ring disabled:pointer-events-none disabled:opacity-40"
                  >
                    <ChevronDown size={15} aria-hidden="true" />
                  </button>
                </div>
              </td>
              <td class="py-2">
                <div class="flex items-center justify-end">
                  <button
                    type="button"
                    aria-label={`Hapus ${item.name || 'barang'}`}
                    onclick={() => remove(item.id)}
                    class="rounded-control p-2 text-muted transition-colors hover:bg-danger-soft hover:text-danger focus-ring"
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              </td>
            </tr>
          {/each}

          {#if items.length === 0}
            <tr>
              <td colspan={6} class="py-8 text-center text-sm text-muted">
                Belum ada barang. Tambahkan minimal satu item.
              </td>
            </tr>
          {/if}

          {#if canAdd}
            <tr>
              <td colspan={6} class="pt-3">
                <button
                  type="button"
                  data-add-item
                  onclick={add}
                  class="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-border bg-transparent px-3 text-sm font-medium text-muted transition-colors hover:border-foreground/30 hover:text-foreground focus-ring"
                >
                  <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
                  Tambah barang
                </button>
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  {/if}

  {#if errorMessage}
    <p role="alert" class="text-xs font-medium text-danger">
      {errorMessage}
    </p>
  {/if}
</div>
