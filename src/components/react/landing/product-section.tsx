import { motion, MotionConfig } from 'motion/react';
import { useMemo } from 'react';
import { ArrowRight, FileSpreadsheet, Package, Users } from 'lucide-react';
import { createSampleInvoice } from '../../../core/invoice/sample';
import { calculateTotals } from '../../../core/invoice/calculator';
import { formatRupiah } from '../../../core/shared/money';
import { EASE, Reveal, SectionHeading } from './reveal';
import { cardClass } from '../ui/card';
import { StatusBadge } from '../ui/status-badge';

/**
 * `#fitur`: the product showcase.
 *
 * Every number on this section is computed from `createSampleInvoice` through
 * the app's own `calculateTotals`, and every label (table columns, status
 * chips, dashboard cards) mirrors the real screens: the invoice list columns
 * match `invoice-table`, the statuses are the four values the lifecycle
 * allows (`core/invoice/model`), and the four money cards copy
 * `dashboard/finance-section` verbatim. The mockups are illustrations of the
 * product, so they are `role="img"` with a summary label instead of tables a
 * screen reader would read row by row.
 */

/** One narrative row: copy on one side, a faithful mockup on the other. */
function FeatureRow({
  eyebrow,
  title,
  description,
  bullets,
  visual,
  reverse = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  bullets: readonly string[];
  visual: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <Reveal y={20} className={reverse ? 'lg:order-2' : undefined}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
        <h3 className="mt-3 text-title">{title}</h3>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-muted sm:text-lead">
          {description}
        </p>
        <ul className="mt-6 space-y-3">
          {bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-3 text-sm leading-relaxed">
              <span
                aria-hidden="true"
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
              >
                <ArrowRight size={11} strokeWidth={2.5} />
              </span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      </Reveal>

      <Reveal y={28} delay={0.1} className={reverse ? 'lg:order-1' : undefined}>
        {visual}
      </Reveal>
    </div>
  );
}

/** Rincian tagihan: the calculator's real output for the sample invoice. */
function TotalsCard() {
  const { draft } = useMemo(
    () => createSampleInvoice(new Date(Date.UTC(2026, 9, 8))),
    [],
  );
  const totals = calculateTotals({
    items: draft.items,
    discount: draft.discount,
    tax: draft.tax,
  });

  const rows = [
    { label: 'Subtotal', value: formatRupiah(totals.subtotal) },
    {
      label: `Diskon ${draft.discount.value}%`,
      value: `−${formatRupiah(totals.discountAmount)}`,
    },
    { label: `Pajak ${draft.tax.value}%`, value: `+${formatRupiah(totals.taxAmount)}` },
  ];

  return (
    <div role="img" aria-label="Contoh rincian invoice: subtotal, diskon, pajak, dan total tagihan" className={cardClass('md')}>
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <p className="text-sm font-semibold">Rincian tagihan</p>
        <span className="rounded-pill border border-border bg-sunken px-2.5 py-0.5 text-xs font-medium text-muted">
          {draft.invoiceNumber}
        </span>
      </div>

      <ul className="mt-4 space-y-2.5">
        {draft.items.map((item) => (
          <li key={item.id} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0">
              <span className="truncate">{item.name}</span>{' '}
              <span className="text-muted whitespace-nowrap">
                · {item.quantity} × {formatRupiah(item.unitPrice)}
              </span>
            </span>
            <span className="shrink-0 tabular-nums">
              {formatRupiah(item.quantity * item.unitPrice)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <span className="text-muted">{row.label}</span>
            <span className="tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-border pt-4">
        <span className="text-sm font-semibold">Total tagihan</span>
        <span className="text-xl font-semibold tabular-nums text-accent">
          {formatRupiah(totals.grandTotal)}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-pill border border-accent/20 bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
          Persen atau nominal
        </span>
        <span className="rounded-pill border border-accent/20 bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
          Pembulatan otomatis
        </span>
      </div>
    </div>
  );
}

/** Direktori pelanggan + katalog: two mini panels of the real screens. */
function DirectoryCards() {
  const customers = [
    { name: 'Budi Santoso', phone: '081298765432', last: '2 hari lalu' },
    { name: 'Siti Rahma', phone: '081234567890', last: '5 hari lalu' },
  ];
  const catalog = [
    { name: 'Nasi Goreng Spesial', price: 25_000 },
    { name: 'Es Teh Manis', price: 8_000 },
    { name: 'Kerupuk Udang', price: 10_000 },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
      <div
        role="img"
        aria-label="Contoh daftar pelanggan: nama, nomor WhatsApp, dan kapan terakhir dipakai"
        className={cardClass('sm')}
      >
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Users size={15} aria-hidden="true" className="shrink-0 text-accent" />
          <p className="text-sm font-semibold">Pelanggan</p>
        </div>
        <ul className="mt-3 divide-y divide-border">
          {customers.map((customer) => (
            <li key={customer.name} className="flex items-baseline justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{customer.name}</p>
                <p className="truncate text-xs tabular-nums text-muted">{customer.phone}</p>
              </div>
              <span className="shrink-0 text-xs text-muted">{customer.last}</span>
            </li>
          ))}
        </ul>
      </div>

      <div
        role="img"
        aria-label="Contoh katalog barang: nama barang dan harga satuan"
        className={cardClass('sm')}
      >
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Package size={15} aria-hidden="true" className="shrink-0 text-accent" />
          <p className="text-sm font-semibold">Katalog</p>
        </div>
        <ul className="mt-3 divide-y divide-border">
          {catalog.map((item) => (
            <li key={item.name} className="flex items-baseline justify-between gap-3 py-2.5">
              <span className="min-w-0 truncate text-sm">{item.name}</span>
              <span className="shrink-0 text-sm tabular-nums">{formatRupiah(item.price)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Daftar invoice + kartu ringkasan. The rows agree with the totals card
 * (INV-2026-001 is the same sample invoice), and the four money cards carry
 * the exact labels and sub-labels of the dashboard's finance cards.
 */
function StatusBoardCards() {
  const { draft } = useMemo(
    () => createSampleInvoice(new Date(Date.UTC(2026, 9, 8))),
    [],
  );
  const totals = calculateTotals({
    items: draft.items,
    discount: draft.discount,
    tax: draft.tax,
  });

  const rows = [
    { number: draft.invoiceNumber, customer: draft.customerName, total: totals.grandTotal, status: 'sent' as const },
    { number: 'INV-2026-002', customer: 'Siti Rahma', total: 140_000, status: 'paid' as const },
    { number: 'INV-2026-003', customer: 'Katering Bu Tini', total: 56_000, status: 'paid' as const },
  ];

  // Internally consistent with the rows above: only INV-2026-001 is unpaid.
  const received = 140_000 + 56_000;
  const unpaid = totals.grandTotal;
  const moneyCards = [
    { label: 'Pendapatan diterima', value: formatRupiah(received), sub: 'Invoice lunas pada periode ini' },
    { label: 'Belum dibayar', value: formatRupiah(unpaid), sub: 'Piutang yang masih menunggu' },
    { label: 'Jatuh tempo lewat', value: '0 invoice', sub: 'Tidak ada' },
    { label: 'Invoice dibuat', value: '3', sub: 'Termasuk yang batal' },
  ];

  return (
    <div className="space-y-4">
      <div
        role="img"
        aria-label="Contoh daftar invoice dengan nomor, pelanggan, total, dan status: satu terkirim, dua lunas"
        className={cardClass('sm')}
      >
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <FileSpreadsheet size={15} aria-hidden="true" className="shrink-0 text-accent" />
          <p className="text-sm font-semibold">Invoice</p>
        </div>
        <ul className="mt-1 divide-y divide-border">
          {rows.map((row) => (
            <li key={row.number} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium tabular-nums">{row.number}</p>
                <p className="truncate text-xs text-muted">{row.customer}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm tabular-nums">{formatRupiah(row.total)}</span>
                <StatusBadge status={row.status} />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div role="img" aria-label="Contoh kartu ringkasan dashboard: pendapatan diterima, belum dibayar, jatuh tempo lewat, dan invoice dibuat" className="grid gap-3 sm:grid-cols-2">
        {moneyCards.map((card) => (
          <div key={card.label} className="rounded-control border border-border bg-card p-3.5">
            <p className="truncate text-xs text-muted">{card.label}</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">{card.value}</p>
            <p className="truncate text-[11px] text-muted">{card.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The `#fitur` section: three benefit narratives, each beside its visual. */
export function ProductSection() {
  return (
    <MotionConfig reducedMotion="user">
      <section id="fitur" className="scroll-mt-4">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <SectionHeading
            title="Dari isi sampai dibayar, satu alur yang rapi."
            description="Bukan sekadar bikin invoice: data pelanggan, barang, hitungan, dan status tagihan saling terhubung di satu tempat."
          />

          <div className="mt-14 space-y-20 sm:space-y-24">
            <FeatureRow
              eyebrow="Bikin invoice"
              title="Invoice profesional tanpa mulai dari nol."
              description="Mulai dari template bawaan, isi kop dan barangnya. Diskon dan pajak dihitung otomatis, jadi angka total tidak pernah meleset, dan invoice berikutnya cukup ganti nama pelanggan."
              bullets={[
                'Template bawaan siap pakai, lengkap dengan logo & kop usaha',
                'Diskon dan pajak: persen atau nominal, total dihitung sendiri',
                'Catatan, tanggal jatuh tempo, dan teks bebas di tiga zona',
              ]}
              visual={<TotalsCard />}
            />

            <FeatureRow
              eyebrow="Data sekali, pakai berkali-kali"
              title="Pelanggan & barang tak perlu diketik ulang."
              description="Nomor HP pelanggan dan daftar barang tersimpan di akunmu. Saat bikin invoice, pilih dari daftar, datanya terpakai otomatis dan riwayat tiap pelanggan ikut tercatat."
              bullets={[
                'Direktori pelanggan dengan nomor WhatsApp',
                'Katalog barang & jasa dengan harga satuan',
                'Punya daftar lama? Impor dari Excel atau CSV',
              ]}
              visual={<DirectoryCards />}
            />

            <FeatureRow
              eyebrow="Pantau tagihan"
              title="Tahu mana yang sudah dibayar, mana yang belum."
              description="Setiap invoice punya status yang jelas (Belum dikirim, Terkirim, Lunas, atau Batal) dan ringkasannya langsung terlihat di dashboard. Bukti bayar dari pelanggan menempel di invoicenya."
              bullets={[
                'Status invoice terlihat dalam sekali lihat',
                'Ringkasan pendapatan dan piutang per periode',
                'Bukti transfer pelanggan tersimpan di invoice yang sama',
              ]}
              visual={<StatusBoardCards />}
            />
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.5, delay: 0.2, ease: EASE }}
            className="mt-14 text-center text-sm text-muted"
          >
            Semua yang tampil di atas adalah alur asli di dalam aplikasi.
          </motion.p>
        </div>
      </section>
    </MotionConfig>
  );
}
