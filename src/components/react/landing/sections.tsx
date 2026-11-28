import { motion, MotionConfig, useInView } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import {
  Calculator,
  CheckCheck,
  FileText,
  MessageCircle,
  Receipt,
  Send,
  Sparkles,
} from 'lucide-react';
import { formatRupiah } from '../../../core/shared/money';
import { EASE, Reveal } from './reveal';

/**
 * The landing sections below the hero.
 *
 * Each one is the product doing its job, not a card describing it: the
 * calculator answers a drag, the WhatsApp message types itself, the status
 * stamp switches under a tap. One motion idea per section, so the page has a
 * rhythm instead of the same fade on every block.
 */

/** Heading pair used by every section: a rule first, then the words. */
function Head({ title, description }: { title: string; description: string }) {
  return (
    <div className="max-w-2xl">
      <Reveal y={16}>
        <h2 className="text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-[1.1] tracking-[-0.03em]">
          {title}
        </h2>
      </Reveal>
      <Reveal y={12} delay={0.08}>
        <p className="mt-4 text-muted">{description}</p>
      </Reveal>
    </div>
  );
}

const STEPS = [
  {
    title: 'Pilih pelanggan dan barang',
    body: 'Dari daftar yang sudah tersimpan, atau ketik sekali lalu simpan.',
    icon: Receipt,
  },
  {
    title: 'Total dihitung sendiri',
    body: 'Diskon, pajak, dan pembulatan langsung ikut berubah saat angkanya berubah.',
    icon: Calculator,
  },
  {
    title: 'Simpan PDF, kirim WhatsApp',
    body: 'Pesan sudah terisi nomor dan totalnya. Lampirkan PDF, lalu kirim.',
    icon: Send,
  },
] as const;

/** `#cara-kerja`: three steps, with a rule that draws as the section arrives. */
export function HowItWorks() {
  return (
    <MotionConfig reducedMotion="user">
      <section id="cara-kerja" className="scroll-mt-24 border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <Head
            title="Tiga langkah, satu nota."
            description="Tidak ada pengaturan awal yang rumit. Buat nota, simpan PDF, lalu catat pembayarannya."
          />

          <motion.span
            aria-hidden="true"
            className="mt-12 block h-px origin-left bg-accent"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.9, ease: EASE }}
          />

          <ol className="mt-0 grid gap-10 sm:grid-cols-3 sm:gap-8">
            {STEPS.map(({ title, body, icon: Icon }, index) => (
              <motion.li
                key={title}
                className="border-t border-border pt-6 sm:border-t-0 sm:pt-0"
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.6, delay: index * 0.1, ease: EASE }}
              >
                <span className="till-figure inline-flex items-center gap-2 text-xs text-muted">
                  <Icon size={14} aria-hidden="true" />
                  Langkah {index + 1}
                </span>
                <h3 className="mt-3 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>
    </MotionConfig>
  );
}

const ROWS = [
  { name: 'Nasi Goreng Spesial', price: 25_000 },
  { name: 'Es Teh Manis', price: 8_000 },
  { name: 'Kerupuk Udang', price: 10_000 },
] as const;

type Totals = { subtotal: number; discount: number; tax: number; total: number };

/** Honours the OS "reduce motion" setting for the two rAF loops on this page. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * Counts every figure from one eased progress, so subtotal, discount, tax and
 * total never disagree while they move — an animating subtotal next to a total
 * that already snapped is a wrong number on screen, not a slow one. Reduced
 * motion gets the new numbers immediately.
 */
function useAnimatedTotals(target: Totals): Totals {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  const reduced = usePrefersReducedMotion();
  const { subtotal, discount, tax, total } = target;

  useEffect(() => {
    const from = shownRef.current;
    const to = { subtotal, discount, tax, total };
    if (reduced || (from.subtotal === subtotal && from.total === total)) {
      shownRef.current = to;
      setShown(to);
      return undefined;
    }

    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 420);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = {
        subtotal: Math.round(from.subtotal + (subtotal - from.subtotal) * eased),
        discount: Math.round(from.discount + (discount - from.discount) * eased),
        tax: Math.round(from.tax + (tax - from.tax) * eased),
        total: Math.round(from.total + (total - from.total) * eased),
      };
      shownRef.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [subtotal, discount, tax, total, reduced]);

  return shown;
}

/**
 * A working calculator, not a screenshot of one: the steppers change quantity,
 * the totals answer, and the number counts to its new value. This is the
 * section that shows the product is software.
 */
export function LiveCalculator() {
  // Starts at the same total the rest of the page quotes (Rp88.578), so no two
  // sections price the same sample nota differently.
  const [counts, setCounts] = useState([2, 3, 1]);

  const lines = ROWS.map((row, index) => ({
    ...row,
    count: counts[index] ?? 0,
    subtotal: row.price * (counts[index] ?? 0),
  }));
  const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
  const discount = Math.round(subtotal * 0.05);
  const tax = Math.round((subtotal - discount) * 0.11);
  const total = subtotal - discount + tax;
  const shown = useAnimatedTotals({ subtotal, discount, tax, total });

  function bump(index: number, delta: number) {
    setCounts((current) =>
      current.map((count, position) =>
        position === index ? Math.min(99, Math.max(0, count + delta)) : count,
      ),
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <section id="hitung" className="scroll-mt-24 border-t border-border bg-card">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-center">
          <Head
            title="Ubah jumlah, total ikut bergerak."
            description="Setiap baris dihitung ulang saat kamu menekan − atau +. Diskon dan pajak ikut menyesuaikan, tanpa perlu kalkulator sendiri."
          />

          <div className="rounded-card border border-rule bg-paper p-5 shadow-raised">
            <p className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.14em] text-muted">
              Nota contoh
              <Sparkles size={14} aria-hidden="true" className="text-accent" />
            </p>
            {/* The same nota the hero shows, named: without this line the card
                read as a cropped receipt instead of a second view of one. */}
            <p className="till-figure mt-1 text-xs text-muted">INV-2026-001 · Budi Santoso</p>

            <ul className="mt-3 divide-y divide-rule">
              {lines.map((line, index) => (
                <li key={line.name} className="py-3">
                  {/* Two lines per row: the name and what it costs, then the
                      price and the stepper. The line amount sits in the same
                      right column as the totals, so Rp84.000 can be read off
                      the rows instead of taken on trust. */}
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-medium">{line.name}</span>
                    <span className="till-figure shrink-0 text-sm">
                      {formatRupiah(line.subtotal)}
                    </span>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between gap-3">
                    <span className="till-figure text-xs text-muted">
                      {formatRupiah(line.price)} / item
                    </span>

                    {/* `shrink-0`: the name column is the one allowed to give
                        way, never the two 44px targets beside it. */}
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => bump(index, -1)}
                        aria-label={`Kurangi ${line.name}`}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-control border border-border text-sm transition-colors hover:border-border-strong hover:bg-background focus-ring"
                      >
                        −
                      </button>
                      <motion.span
                        key={line.count}
                        // Scale only, never opacity: before hydration the
                        // server's inline style is all a reader sees, and a
                        // faded digit looks like a disabled one.
                        initial={{ scale: 0.9 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                        className="till-figure w-7 text-center text-sm font-medium"
                      >
                        {line.count}
                      </motion.span>
                      <button
                        type="button"
                        onClick={() => bump(index, 1)}
                        aria-label={`Tambah ${line.name}`}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-control border border-border text-sm transition-colors hover:border-border-strong hover:bg-background focus-ring"
                      >
                        +
                      </button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            <dl className="mt-2 space-y-1.5 border-t border-rule pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd className="till-figure">{formatRupiah(shown.subtotal)}</dd>
              </div>
              {/* The same words and inks the nota in the hero prints: a
                  discount is red, a tax is ink, and neither is greyed out. */}
              <div className="flex justify-between">
                <dt className="text-muted">Diskon (5%)</dt>
                <dd className="till-figure text-danger">−{formatRupiah(shown.discount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Pajak (11%)</dt>
                <dd className="till-figure">+{formatRupiah(shown.tax)}</dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-rule pt-2">
                <dt className="font-medium">Total</dt>
                <dd className="till-figure text-lg font-semibold text-accent">
                  {formatRupiah(shown.total)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}

const MESSAGE_TO = 'Budi Santoso';
const MESSAGE =
  'Halo Budi Santoso, berikut nota INV-2026-001 dari Warung Maju Jaya sebesar Rp88.578. Terima kasih.';

/** Types the WhatsApp message once, when the card is on screen. */
function useTypedMessage(active: boolean): { text: string; done: boolean } {
  const [index, setIndex] = useState(0);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    // Reduced motion: the message is simply there, no typing.
    if (!active || reduced) {
      if (active) setIndex(MESSAGE.length);
      return undefined;
    }
    const timer = window.setInterval(() => {
      setIndex((current) => {
        if (current >= MESSAGE.length) {
          window.clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, 22);
    return () => window.clearInterval(timer);
  }, [active, reduced]);

  return { text: MESSAGE.slice(0, index), done: index >= MESSAGE.length };
}

/** `#kirim`: the WhatsApp message that writes itself and the PDF that follows. */
export function SendDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const { text, done } = useTypedMessage(inView);

  return (
    <MotionConfig reducedMotion="user">
      <section id="kirim" className="scroll-mt-24 border-t border-border">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-center">
          <Head
            title="Pesannya sudah siap, tinggal lampirkan."
            description="Nomor nota, nama pelanggan, dan totalnya sudah terisi. Simpan PDF dari halaman cetak, lampirkan di chat, kirim."
          />

          <div ref={ref} className="rounded-card border border-rule bg-card p-4 shadow-raised">
            <p className="flex items-center gap-2 pb-3 text-sm font-medium">
              <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-accent">
                <MessageCircle size={15} aria-hidden="true" />
              </span>
              {MESSAGE_TO}
              <span className="ml-auto text-xs font-normal text-muted">online</span>
            </p>

            <div className="rounded-control bg-paper p-3 text-sm leading-relaxed text-ink">
              {text}
              {!done && <span aria-hidden="true" className="ml-0.5 inline-block w-1.5 bg-accent">&nbsp;</span>}
            </div>

            {/* Always in the layout, only invisible until the message is
                done: a chip that mounts at the end would shove the card 90px
                taller mid-sentence. */}
            <motion.div
              initial={false}
              animate={done ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
              aria-hidden={!done}
              className="mt-3 flex items-center gap-2 rounded-control border border-rule bg-paper px-3 py-2 text-sm"
            >
              <FileText size={15} aria-hidden="true" className="text-accent" />
              INV-2026-001.pdf
              <span className="till-figure ml-auto text-xs text-muted">A4 · 1 halaman</span>
            </motion.div>

            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
              <CheckCheck size={13} aria-hidden="true" className="text-accent" />
              Tidak memakai API WhatsApp — pesan dibuka di aplikasi WhatsApp kamu.
            </p>
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}

const STATUS_FLOW = ['sent', 'paid', 'void'] as const;
type StatusFlow = (typeof STATUS_FLOW)[number];

const STATUS_COPY: Record<StatusFlow, { label: string; hint: string; stamp: string }> = {
  sent: { label: 'Terkirim', hint: 'Nota sudah dikirim, pembayaran belum masuk.', stamp: 'Terkirim' },
  paid: { label: 'Lunas', hint: 'Uang sudah diterima dan dicatat di nota.', stamp: 'Lunas' },
  void: { label: 'Batal', hint: 'Nota dibatalkan, tidak ditagih lagi.', stamp: 'Batal' },
};

/** `#kenapa`: the status stamp you set on a nota, switched by a tap. */
export function TrackDemo() {
  const [status, setStatus] = useState<StatusFlow>('sent');
  const copy = STATUS_COPY[status];

  return (
    <MotionConfig reducedMotion="user">
      <section id="kenapa" className="scroll-mt-24 border-t border-border bg-card">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-center">
          <Head
            title="Tahu mana yang sudah dibayar."
            description="Satu ketukan mengubah status nota, dan status itu yang membuat daftar piutangmu bisa dipercaya."
          />

          {/* A torn sheet, not another card: this demo *is* the nota the
              status belongs to, so it wears the same paper as the hero. */}
          <div className="receipt-sheet rounded-card p-5 shadow-popover">
            <div
              role="tablist"
              aria-label="Status nota"
              className="inline-flex rounded-pill border border-border bg-background p-1"
            >
              {STATUS_FLOW.map((value) => {
                const active = value === status;
                return (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setStatus(value)}
                    className={`relative rounded-pill px-3 py-3 text-sm font-medium transition-colors focus-ring ${
                      active ? 'text-accent-foreground' : 'text-muted hover:text-foreground'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="track-demo-tab"
                        className="absolute inset-0 rounded-pill bg-accent"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      />
                    )}
                    <span className="relative">{STATUS_COPY[value].label}</span>
                  </button>
                );
              })}
            </div>

            <div className="relative mt-5 overflow-hidden rounded-control border border-rule p-4">
              <p className="text-sm font-medium">Nota INV-2026-001</p>
              <p className="till-figure mt-1 text-xs text-muted">Budi Santoso · Rp88.578</p>

              <motion.span
                key={status}
                aria-hidden="true"
                initial={{ scale: 1.3, opacity: 0, rotate: -7 }}
                animate={{ scale: 1, opacity: 0.9, rotate: -7 }}
                transition={{ type: 'spring', stiffness: 340, damping: 20 }}
                className="receipt-stamp absolute right-4 top-3 text-accent"
              >
                {copy.stamp}
              </motion.span>

              <p className="mt-6 border-t border-rule pt-3 text-xs text-muted">{copy.hint}</p>
            </div>
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}

const FEATURES = [
  'Nota dengan diskon, pajak, dan pembulatan otomatis',
  'PDF A4 dari dialog cetak browser',
  'Pesan WhatsApp terisi nomor, nama, dan total',
  'Data pelanggan dan katalog tersimpan',
  'Impor pelanggan dari Excel atau CSV',
  'Template nota dengan logo usahamu',
] as const;

/** `#fitur`: the list, as rows on a rule — no cards, no icons-in-boxes grid. */
export function FeatureList() {
  return (
    <MotionConfig reducedMotion="user">
      <section id="fitur" className="scroll-mt-24 border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <Head
            title="Yang benar-benar sudah jalan."
            description="Bukan rencana rilis: setiap baris di bawah ini ada di aplikasi hari ini."
          />

          <ul className="mt-10 border-t border-border">
            {FEATURES.map((feature, index) => (
              <motion.li
                key={feature}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.45, delay: index * 0.05, ease: EASE }}
                className="flex items-center gap-4 border-b border-border py-4"
              >
                <span className="till-figure w-6 text-xs text-muted">{index + 1}</span>
                <span className="text-base">{feature}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      </section>
    </MotionConfig>
  );
}
