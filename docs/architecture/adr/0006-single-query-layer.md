# ADR 0006 — Satu lapisan query, tanpa adapter per widget

- Status: **Accepted**
- Tanggal: 2026-10-11
- Konsekuensi: `src/lib/query/hooks/**`, `src/components/react/invoice/picker.tsx`

## Konteks

Island butuh data. Vue picker butuh riwayat invoice untuk menyusun saran. Karena dia
framework berbeda dari React, ada godaan untuk membuat lapisan query sendiri —
misalnya `usePickerQuery`, atau adapter query khusus per widget, atau bahkan
`@tanstack/vue-query`.

Itu semua menambah sumber kebenaran kedua untuk data yang sama.

## Keputusan

Tidak ada adapter query per widget. Tidak ada `@tanstack/vue-query`,
`@tanstack/svelte-query`, atau `@tanstack/solid-query`.

Semua pengambilan data lewat `src/lib/query/hooks/**` yang sudah ada, dipanggil dari
adapter React. Untuk picker:

```ts
// src/components/react/invoice/picker.tsx
export function Picker({ mode, label, placeholder, onPick }: Props) {
  const history = useInvoices('');                       // hook yang sudah ada
  const options = useMemo(() => derivePickerOptions(history.data), [history.data]);

  const [ref, element] = useCeRef();
  useCeProp(element, 'customers', options.customers);    // data masuk sebagai prop
  useCeEvent(element, CE_EVENTS.pick, pickEventSchema, onPick);
  return <notain-picker ref={ref} />;
}
```

Alurnya selalu sama dan selalu satu arah:

```
Appwrite → useInvoices (React Query) → derivePickerOptions (murni)
        → useCeProp → island → CustomEvent → parseEvent → TanStack Form
```

Island **tidak pernah memanggil query langsung**. Dia hanya menerima data yang sudah
diambil dan membalikkan keputusan user sebagai event.

### Mengapa

- **Satu cache.** Riwayat yang dipakai picker sama persis dengan yang dipakai dashboard,
  dan sama persis dengan yang di-invalidate oleh `useCreateInvoice` /
  `useUpdateInvoice`. Dua cache berarti dua tempat bisa kedaluwarsa, dan tidak ada yang
  bisa memastikan keduanya sinkron.
- **Satu tempat retry/auth.** `createQueryClient` sudah mengatur retry dan error.
  Adapter per widget harus mengaturnya lagi, atau diam-diam tidak.
- **Island tetap framework-neutral.** Karena island tidak mengimpor apa pun dari
  TanStack, dia bisa dipindah ke proyek lain tanpa membawa query client.
- **Test lebih murah.** Adapter diuji di jsdom dengan `QueryClientProvider` tipuan;
  island diuji tanpa provider sama sekali, karena memang tidak butuh.

## Alternatif yang ditolak

**`@tanstack/vue-query` untuk picker.** Ditolak: menambah runtime query framework
lain, cache terpisah, dan duplikasi `queryKeys`. Untuk satu widget, itu mahal.

**Adapter query per widget (`usePickerOptions`, `useGridOptions`, …).**
Ditolak: setiap adapter adalah tempat tambahan untuk menyimpang dari aturan cache.
Kalau nanti butuh data lain untuk widget lain, jawabannya menambah hook di
`src/lib/query/hooks/`, bukan adapter baru.

**Island mengambil data sendiri lewat `fetch`.**
Ditolak: melewati seluruh lapisan caching, retry, dan invalidasi. Dan karena island
punya lifecycle sendiri (`connectedCallback`), dia akan fetch ulang setiap kali
di-mount.

## Konsekuensi

- Setiap island data-driven harus di-render di bawah `AppProviders`. Ini berlaku juga
  untuk halaman `/probes` (sudah dibungkus).
- Picker menampilkan data yang bisa saja belum sempat termuat. Untuk MVP ini diterima —
  daftar saran muncul setelah query selesai, dan field manual selalu bisa dipakai
  sambil menunggu.
