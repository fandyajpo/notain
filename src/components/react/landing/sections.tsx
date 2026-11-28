import { motion, MotionConfig, useInView } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
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
            className="mt-12 block h-px origin-left bg-accent/40"
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
] as const;

/** Counts a Rupiah value toward its new total instead of snapping. */
function AnimatedRupiah({ value, className }: { value: number; className?: string }) {
  const shownRef = useRef(value);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const from = shownRef.current;
    if (from === value) return;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 420);
      const next = Math.round(from + (value - from) * (1 - Math.pow(1 - t, 3)));
      shownRef.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className={className}>{formatRupiah(shown)}</span>;
}

/**
 * A working calculator, not a screenshot of one: the steppers change quantity,
 * the totals answer, and the number counts to its new value. This is the
 * section that shows the product is software.
 */
export function LiveCalculator() {
  const [counts, setCounts] = useState([2, 3]);

  const lines = ROWS.map((row, index) => ({
    ...row,
    count: counts[index] ?? 0,
    subtotal: row.price * (counts[index] ?? 0),
  }));
  const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
  const discount = Math.round(subtotal * 0.05);
  const tax = Math.round((subtotal - discount) * 0.11);
  const total = subtotal - discount + tax;

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

            <ul className="mt-4 divide-y divide-rule">
              {lines.map((line, index) => (
                <li key={line.name} className="flex items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{line.name}</span>
                    <span className="till-figure block text-xs text-muted">
                      {formatRupiah(line.price)} / item
                    </span>
                  </span>

                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => bump(index, -1)}
                      aria-label={`Kurangi ${line.name}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-control border border-border text-sm transition-colors hover:border-border-strong hover:bg-background focus-ring"
                    >
                      −
                    </button>
                    <motion.span
                      key={line.count}
                      initial={{ scale: 0.85, opacity: 0.4 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                      className="till-figure w-7 text-center text-sm font-medium"
                    >
                      {line.count}
                    </motion.span>
                    <button
                      type="button"
                      onClick={() => bump(index, 1)}
                      aria-label={`Tambah ${line.name}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-control border border-border text-sm transition-colors hover:border-border-strong hover:bg-background focus-ring"
                    >
                      +
                    </button>
                  </span>
                </li>
              ))}
            </ul>

            <dl className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd className="till-figure">
                  <AnimatedRupiah value={subtotal} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Diskon 5%</dt>
                <dd className="till-figure text-muted">−{formatRupiah(discount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Pajak 11%</dt>
                <dd className="till-figure text-muted">+{formatRupiah(tax)}</dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-rule pt-2">
                <dt className="font-medium">Total</dt>
                <dd className="till-figure text-2xl font-semibold text-accent">
                  <AnimatedRupiah value={total} />
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

  useEffect(() => {
    if (!active) return;
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
  }, [active]);

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

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={done ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
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

          <div className="rounded-card border border-rule bg-paper p-5 shadow-raised">
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
                    className={`relative rounded-pill px-3 py-1.5 text-sm font-medium transition-colors focus-ring ${
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
                className="group flex items-center gap-4 border-b border-border py-4"
              >
                <span className="till-figure w-6 text-xs text-muted">{index + 1}</span>
                <span className="text-base">{feature}</span>
                <ArrowRight
                  size={15}
                  aria-hidden="true"
                  className="ml-auto -translate-x-1 text-muted opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
                />
              </motion.li>
            ))}
          </ul>
        </div>
      </section>
    </MotionConfig>
  );
}
