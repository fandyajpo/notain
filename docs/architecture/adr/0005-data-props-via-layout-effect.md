# ADR 0005 — Prop data wajib lewat layout effect

- Status: **Accepted**
- Tanggal: 2026-10-11
- Konsekuensi: `src/components/shared/use-ce-element.ts`, `src/components/react/custom-elements.d.ts`

## Konteks

Pendekatan alami untuk mengirim data ke custom element dari React adalah menulisnya
sebagai prop JSX:

```tsx
// NAMPAK benar. TIDAK BOLEH.
<notain-picker customers={options.customers} mode="customer" />
```

Ini rusak, dan rusaknya diam-diam.

## Masalah

`@astrojs/react` (dan `react-dom` pada umumnya) memakai `setPropOnCustomElement`,
yang secara garis besar melakukan:

```js
if (key in domElement) {
  domElement[key] = value; // properti
} else {
  setValueForAttribute(domElement, key, value); // atribut → string
}
```

Pemeriksaan `key in domElement` dilakukan saat React menulis prop. Di ketiga island:

- **Vue** memasang accessor propertinya di `connectedCallback` (`_resolveProps`).
  Saat React menulis, host baru di-upgrade → accessor belum ada → `key in domElement`
  `false` → jatuh ke atribut.
- Konsekuensinya `customers={[…]}` sampai sebagai **string**:
  `"[object Object],[object Object]"`. Array object yang jadi string.
- **Svelte 5** memasang accessor di `Class.prototype` waktu `defineCustomElement`
  dipanggil, jadi properti sudah ada. Tapi `connectedCallback`-nya **asinkron**
  (microtask), sehingga ada jendela singkat di mana tulisan React belum tersambung ke
  state komponen.
- **Solid** (custom element buatan sendiri) accessor-nya di prototype juga, jadi paling
  aman — tapi tetap tidak menyelesaikan masalah Vue.

Yang paling berbahaya: array yang jadi string **bukan error**. Tidak ada exception.
Picker cuma menampilkan nol saran dan dianggap "history kosong".

## Keputusan

Semua **prop data** ke island ditulis imperatif lewat layout effect, tidak pernah lewat
JSX. API-nya di `src/components/shared/use-ce-element.ts`:

```ts
const [ref, element] = useCeRef();          // callback ref + state
useCeProp(element, 'customers', options.customers);  // layout effect
return <notain-picker ref={ref} />;
```

- `setCeProperty` selalu menulis **properti**, tidak pernah atribut.
- `useCeRef` mengembalikan element dan memicu render ulang saat island mount, jadi prop
  langsung diterapkan begitu node ada — bukan di render berikutnya yang tak tentu.
- `useCeProp` memakai `useLayoutEffect`, jadi tersimpan sebelum browser menggambar.
  Tidak ada frame dengan data lama.

### JSX di tag island hanya untuk layout

Agar kesalahan ini tertangkap kompilator (bukan runtime), `custom-elements.d.ts`
mendeklarasikan tiap `notain-*` dengan `IslandProps`:

```ts
type IslandProps = HTMLAttributes<HTMLElement> & RefAttributes<HTMLElement>;
```

`HTMLAttributes` hanya punya `className`, `id`, `aria-*`, `style`, `ref`, dan event
bawaan. **`customers` tidak ada di situ**, jadi kalau ada yang menulis
`<notain-picker customers={…} />`, `astro check` gagal.

Itu penegakan compile-time terhadap keputusan ini.

## Alternatif yang ditolak

**Menulis accessor di module scope (di luar `connectedCallback`).**
Untuk Vue ini tidak mungkin tanpa forking — aksesornya memang dipasang per-instance
oleh `VueElement`. Memindahkannya akan melanggar API publik Vue.

**Mengset atribut string dan meng-parsing di island.**
Ditolak: menghapus tipe, dan membawa kembali masalah yang sama dengan cara yang lebih
ribet.

**`ref` + `useEffect` biasa.**
Ditolak: `useEffect` berjalan setelah paint, sehingga ada satu frame di mana
`<notain-items-grid>` kosong. Di mobile, frame kosong itu terlihat sebagai kedip.
`useLayoutEffect` menghindarinya.

## Konsekuensi

- Setiap island wajib punya adapter React sendiri (`.tsx` di
  `src/components/react/invoice/`). Tidak bisa memakai tag langsung dari komponen lain.
  Itu memang disengaja: adapter adalah tempat kontrak Zod dipasang (ADR 0001).
- `useLayoutEffect` memperingatkan di React 19 kalau dipakai di server. Di sini tidak
  berdampak karena semua halaman island memakai `client:only="react"`, jadi layout
  effect tidak pernah jalan di server.
