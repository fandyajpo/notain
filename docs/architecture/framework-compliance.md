# Framework compliance

Catatan teknis: bagaimana dominasi TanStack dan Zod tetap utuh setelah tiga framework
lain (Svelte, Vue, Solid) masuk lewat custom element.

Ditulis sebagai laporan kepatuhan, bukan sebagai tujuan. Setiap klaim menunjuk ke file.

## 1. TanStack Form tetap satu-satunya sumber kebenaran

`src/components/react/invoice/invoice-builder.tsx` memegang satu `useForm`:

```ts
const form = useForm({
  defaultValues: defaultDraft,
  validators: { onChange: invoiceDraftSchema },
  onSubmit: async ({ value }) => { … },
});
```

Island **tidak pernah** memegang state yang dianggap benar. Semuanya dikontrol:

| Island                        | Masuk                                                   | Keluar                       | Tulis balik ke form                                              |
| ----------------------------- | ------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------- |
| Svelte `notain-items-grid`    | `items`, `maxItems`, `errorMessage`                     | `itemschange` (daftar penuh) | `form.setFieldValue('items', …)`                                 |
| Vue `notain-picker`           | `mode`, `customers`, `products`, `label`, `placeholder` | `pick` (satu entri)          | `setFieldValue('customerName'/'customerPhone')` atau append item |
| Solid `notain-calc-inspector` | `totals`                                                | — (satu arah)                | tidak ada                                                        |

Tiga catatan yang harus dijaga:

1. **Grid selalu mengirim daftar penuh**, bukan delta. Delta membuat React harus
   menerapkan patch pada array yang dimiliki TanStack Form — dan patch salah berarti
   state form dan tampilan tidak sinkron, tanpa error.
2. **Picker mengirim saran, bukan keputusan.** Event `pick` berisi `{kind, …}`; React
   yang memutuskan menimpa `customerName` atau menambah row baru.
3. **Inspector tidak punya event balik.** Menambahnya berarti mengizinkan island
   mengubah total — dan total adalah hasil turunan dari `calculator`, bukan input.

Nilai live dibaca dari store form, bukan dari state lokal:

```ts
const values = useSelector(form.store, (state) => state.values);
const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);
```

## 2. Keluarga TanStack yang dipakai

| Paket                     | Pemakaian                          | File                                                       |
| ------------------------- | ---------------------------------- | ---------------------------------------------------------- |
| `@tanstack/react-form`    | Form invoice, profil, auth         | `invoice-builder.tsx`, `profile-form.tsx`, `auth-form.tsx` |
| `@tanstack/react-query`   | Semua akses Appwrite               | `src/lib/query/hooks/*`                                    |
| `@tanstack/react-store`   | Selector nilai form & tab          | `invoice-builder.tsx`, `builder-tabs.tsx`                  |
| `@tanstack/react-pacer`   | Autosave debounce, search debounce | `invoice-builder.tsx`, `invoice-table.tsx`                 |
| `@tanstack/react-hotkeys` | Mod+S, Mod+Enter, Mod+Shift+P      | `invoice-builder.tsx`                                      |
| `@tanstack/react-table`   | Tabel dashboard                    | `invoice-table.tsx`                                        |

Tidak ada yang dipakai dua kali dengan dua cara. Autosave, misalnya, memakai
`useDebouncedCallback` dari pacer — bukan `setTimeout` manual, dan bukan debounce
buatan sendiri di dalam island.

## 3. Zod — dua lapisan, dua tanggung jawab

Penting: **satu aturan bisnis hanya didefinisikan di satu tempat.**

### Lapisan 1 — kontrak boundary (`src/components/shared/contracts.ts`)

Struktural saja. Tipe, bilangan bulat, string tidak rusak. Tidak ada aturan bisnis.

```ts
export const gridItemSchema = z.object({
  id: z.string().min(1),
  name: z.string(), // boleh kosong — user sedang mengetik
  quantity: structuralQuantity, // z.int().min(1)
  unitPrice: structuralCount, // z.int().min(0)
});
```

Alasan `name` boleh kosong: schema ini berjalan **setiap kali grid mengirim event**,
yakni setiap ketikan. Kalau schema menolak nama kosong, setiap huruf yang dihapus akan
membuat payload ditolak dan grid tidak sinkron dengan form.

`parseEvent` mengembalikan `null` untuk payload rusak, dan `console.warn` hanya di dev:

```ts
const payload = parseEvent(schema, detail, label);
if (payload !== null) handlerRef.current(payload);
```

Payload rusak **tidak pernah** mencapai TanStack Form.

### Lapisan 2 — aturan bisnis (`src/core/invoice/schema.ts`)

`invoiceDraftSchema` adalah validator `onChange` form. Di sinilah aturan berlaku:
nama wajib, nomor format `INV-YYYY-NNN`, phone pola Indonesia, jumlah minimal 1,
diskon tidak boleh melebihi subtotal, jatuh tempo tidak boleh sebelum tanggal.

Karena berjalan sebagai validator TanStack Form, aturan ini baru terlihat saat submit
(atau setelah field di-blur), bukan saat mengetik.

### Konsistensi Zod 4

Repo memakai Zod `^4.6.5`. Konvensi yang dipakai dan harus dijaga:

- `z.int().min(n)` — bukan `z.number().int()`. Keduanya valid, tapi `z.int()` adalah
  bentuk Zod 4 dan menolak non-finite sekaligus.
- `.finite()` **tidak dipakai** — sudah deprecated di Zod 4 dan menjadi no-op.
- `z.object()` **membuang** key yang tidak dikenal secara default. Test tidak boleh
  mengasumsikan key asing ditolak.
- Pesan error dalam Bahasa Indonesia, mengikuti `NOTAIN_MVP.md`.

## 4. Type-safety lintas framework

Tiga mekanisme, semuanya gagal saat kompilasi (bukan runtime):

1. **Tag island dideklarasikan** di `src/components/react/custom-elements.d.ts`
   dengan `IslandProps` (hanya `HTMLAttributes` + `RefAttributes`). Menulis
   `<notain-picker customers={…} />` gagal type-check — prop itu memang tidak ada di
   `HTMLAttributes`. Data wajib lewat `useCeProp` (ADR 0005).
2. **`astro check`** mencakup file `.svelte` dan `.vue` karena integrasinya terpasang.
3. **`tsconfig` root `jsx: "preserve"`** tanpa `jsxImportSource` global, sehingga
   Solid bisa memakai pragma per-file `/** @jsxImportSource solid-js */` tanpa
   merusak React.

## 5. Bukti

| Jenis                                                         | Jumlah  | File                            |
| ------------------------------------------------------------- | ------- | ------------------------------- |
| Kontrak Zod                                                   | 17      | `shared/contracts.test.ts`      |
| Turunan picker (murni)                                        | 14      | `shared/picker-options.test.ts` |
| Svelte grid (jsdom)                                           | 12      | `svelte/items-grid.test.ts`     |
| Vue picker (jsdom)                                            | 10      | `vue/picker.test.ts`            |
| Solid inspector (jsdom)                                       | 5       | `solid/calc-inspector.test.ts`  |
| Boundary React↔ketiga island                                  | 9       | `react/probe-host.test.tsx`     |
| Core (model/schema/calculator/dates/money/whatsapp/numbering) | 64      | `src/core/**`                   |
| **Total**                                                     | **131** | 12 file, semua lolos            |

`probe-host.test.tsx` adalah satu-satunya test yang me-mount ketiga island sekaligus
di dalam React — ia membuktikan prop masuk dan event keluar melewati boundary.

Ditambah **8 test browser Playwright** (`e2e/probes.spec.ts`, `npm run test:e2e`) yang
membuktikan hal yang tidak bisa dicakup jsdom: `customElements.define` + `connectedCallback`
async benar-benar jalan, event benar-benar menggelembung di browser sungguhan, Tailwind
benar-benar menembus konten light DOM, dan nol island yang membuat shadow root.
Lihat [playwright.md](playwright.md).

## 6. Hal yang sengaja tidak dilakukan

- **Tidak ada `@tanstack/vue-query` / `svelte-query` / `solid-query`.** ADR 0006.
- **Tidak ada state di dalam island.** Island hanya mirror + pelapor.
- **Tidak ada validasi bisnis di `contracts.ts`.** Dijelaskan di bagian 3.
- **Tidak ada server endpoint.** Aplikasi tetap statis + Appwrite.
