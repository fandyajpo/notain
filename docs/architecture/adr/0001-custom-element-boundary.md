# ADR 0001 — Boundary custom element antar framework

- Status: **Accepted**
- Tanggal: 2026-10-11
- Konsekuensi: `src/components/shared/**`, `src/components/react/custom-elements.d.ts`

## Konteks

Notain sudah terlanjur memakai React 19 sebagai pemilik state, dengan TanStack Form
sebagai satu-satunya sumber kebenaran invoice. Permintaan integrasi multi-framework
muncul tanpa kebutuhan produk baru: tidak ada fitur yang menuntut Svelte, Vue, atau Solid.

Pertanyaannya bukan "framework mana yang lebih baik", tapi: **bisa tidak ketiga framework
itu masuk sebagai island tanpa mengambil alih state?**

Kandidat pendekatan:

1. Micro-frontend per halaman — setiap framework punya route sendiri.
   Ditolak: memecah TanStack Form jadi beberapa pemilik state, dan tiap route butuh
   query client sendiri.
2. Isomorphic rendering — semua komponen di-compile ke React.
   Ditolak: itu bukan integrasi, itu bundling. Tidak membuktikan apa pun.
3. Custom element sebagai boundary — React me-render tag `<notain-*>`, prop masuk sebagai
   properti DOM, balik sebagai `CustomEvent`.

Pendekatan 3 dipilih karena satu-satunya yang menjaga satu pemilik state.

## Keputusan

Setiap komponen non-React diekspor sebagai custom element. Boundary-nya ketat dan asimetris:

- **Masuk (React → island):** properti DOM, selalu ditulis imperatif lewat `useCeProp`
  (ADR 0005), tidak pernah lewat JSX.
- **Keluar (island → React):** `CustomEvent` dengan `bubbles: true`, selalu melalui
  `parseEvent` berbasis Zod sebelum menyentuh TanStack Form.

Kontrak lengkap ada di `src/components/shared/contracts.ts`:

```ts
export const CE_EVENTS = {
  itemsChange: 'itemschange', // Svelte grid → React, daftar item penuh
  pick: 'pick', // Vue picker → React, saran customer/barang
} as const;
```

Dua event saja. Tidak ada event untuk Solid inspector karena inspector bersifat
**satu arah** — React mengirim `totals`, inspector hanya menampilkan. Menambah event
balik berarti menambah permukaan state, dan itu tidak perlu.

### Skema bersifat struktural, bukan bisnis

Skema di `contracts.ts` hanya memvalidasi **bentuk**: tipe, bilangan bulat, string tidak
rusak. Aturan bisnis — nama wajib diisi, jumlah minimal 1, diskon tidak boleh melebihi
subtotal — tetap di `invoiceDraftSchema` (`src/core/invoice/schema.ts`), yang dijalankan
sebagai validator `onChange` TanStack Form.

Alasannya: user sedang mengetik. Saat mengetik, `quantity` boleh 0, `name` boleh kosong,
`phone` boleh setengah jadi. Itu state yang sah. Skema bisnis akan menolak state sah dan
membuat form berkedip error sebelum user selesai mengetik.

### Mengapa event, bukan callback prop

React hanya mengwire daftar event bawaan dari JSX. `CustomEvent` bernama `itemschange`
tidak ada di daftar itu, jadi wajib lewat `addEventListener`. Konsekuensinya listener
mentah harus divalidasi — dan itu memang yang dilakukan `useCeEvent`.

### Keuntungan yang didapat

- Tiap framework mengisi kotaknya sendiri; tidak ada yang bisa menyentuh state framework
  lain.
- Kontraknya bisa diuji tanpa mount komponen apa pun — `contracts.test.ts` murni menguji
  Zod.
- Boundary-nya bisa dibuktikan di jsdom tanpa browser: `probe-host.test.tsx` menguji
  ketiga island sekaligus lewat React.
- Menambah framework keempat berarti menulis satu komponen, satu file `register.ts`, dan
  satu baris di `custom-elements.d.ts`. Tidak ada file lain yang berubah.

### Konsekuensi negatif yang diterima

- Tiga runtime framework ikut terbundel (lihat [bundle](../bundle.md), +204 KB).
- Ada dua file yang harus dijaga sinkron: `register.ts` tiap framework dan
  `custom-elements.d.ts`. Lupa menambah tag di `.d.ts` membuat TS error saat kompilasi,
  jadi kegagalannya cepat dan terlihat.
- Debugging melintasi boundary lebih sulit daripada di dalam satu framework.

## Alternatif yang ditolak

**Web Components berbasis Lit untuk ketiga widget.** Ditolak di ADR 0002: Lit menambah
runtime keempat untuk pekerjaan yang sudah selesai oleh framework yang sudah terpasang.

**Props langsung lewat JSX.** Ditolak di ADR 0005 — perilaku React 19 terhadap properti
custom element membuat array dan object rusak jadi string.

**Adapter query per widget.** Ditolak di ADR 0006.
