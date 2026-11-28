import { motion, useInView } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { CheckCheck, FileText, MessageCircle } from 'lucide-react';
import { formatRupiah } from '../../../core/shared/money';
import { MARKETING_BOX, MARKETING_H2, MARKETING_SECTION } from '../../../lib/ui/classes';

/**
 * The landing sections below the hero.
 *
 * The three demos are one section here, not three: they are the same nota at
 * three moments (count it, send it, stamp it), so one frame tells the story and
 * the page stays short. Nothing fades in on scroll — the hero owns the page's
 * one authored moment, and every other movement answers a tap.
 */

function Head({ title, description }: { title: string; description: string }) {
  return (
    <div className="max-w-lg">
      <h2 className={MARKETING_H2}>{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
    </div>
  );
}

const STEPS = [
  {
    title: 'Pilih pelanggan dan barang',
    body: 'Dari daftar yang sudah tersimpan, atau ketik sekali lalu simpan.',
  },
  {
    title: 'Total dihitung sendiri',
    body: 'Diskon, pajak, dan pembulatan ikut berubah saat angkanya berubah.',
  },
  {
    title: 'Simpan PDF, kirim WhatsApp',
    body: 'Pesan sudah terisi nomor dan totalnya. Lampirkan PDF, lalu kirim.',
  },
] as const;

/** `#cara-kerja`: three steps on three rules. */
export function HowItWorks() {
  return (
    <section id="cara-kerja" className={MARKETING_SECTION}>
      <div className={MARKETING_BOX}>
        <Head
          title="Tiga langkah, satu nota."
          description="Tidak ada pengaturan awal yang rumit: buat nota, simpan PDF, lalu catat pembayarannya."
        />

        <ol className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="border-t border-ink/70 pt-3">
              <p className="text-xs font-medium text-muted">Langkah {index + 1}</p>
              <h3 className="mt-1.5 text-base font-semibold">{step.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

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

const ROWS = [
  { name: 'Nasi Goreng Spesial', price: 25_000 },
  { name: 'Es Teh Manis', price: 8_000 },
  { name: 'Kerupuk Udang', price: 10_000 },
] as const;

const STEPPER =
  'inline-flex h-11 w-11 items-center justify-center rounded-item border border-rule text-sm transition-colors hover:border-ink/30 hover:bg-background focus-ring';

/** The calculator, not a screenshot of one: the steppers change the total. */
function CalculatorPanel() {
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
    <div>
      <p className="flex items-baseline justify-between gap-3 border-b border-rule pb-2">
        <span className="text-sm font-medium">Nota contoh</span>
        <span className="till-figure text-xs text-muted">INV-2026-001</span>
      </p>

      <ul className="divide-y divide-rule">
        {lines.map((line, index) => (
          <li key={line.name} className="py-2.5">
            {/* Two lines per row: the name and its amount first, then the unit
                price and the stepper. The amount sits in the same right column
                as the totals, so Rp84.000 can be read off the rows. */}
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-medium">{line.name}</span>
              <span className="till-figure shrink-0 text-sm">{formatRupiah(line.subtotal)}</span>
            </div>

            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="till-figure text-xs text-muted">
                {formatRupiah(line.price)} / item
              </span>

              {/* `shrink-0`: the name column gives way, never the 44px targets. */}
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => bump(index, -1)}
                  aria-label={`Kurangi ${line.name}`}
                  className={STEPPER}
                >
                  −
                </button>
                <motion.span
                  key={line.count}
                  // Scale only, never opacity: before hydration the server's
                  // inline style is all a reader sees, and a faded digit looks
                  // like a disabled one.
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                  className="till-figure w-6 text-center text-sm font-medium"
                >
                  {line.count}
                </motion.span>
                <button
                  type="button"
                  onClick={() => bump(index, 1)}
                  aria-label={`Tambah ${line.name}`}
                  className={STEPPER}
                >
                  +
                </button>
              </span>
            </div>
          </li>
        ))}
      </ul>

      <dl className="mt-1 space-y-1 border-t border-rule pt-2.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Subtotal</dt>
          <dd className="till-figure">{formatRupiah(shown.subtotal)}</dd>
        </div>
        {/* The words and inks the nota itself prints: discount red, tax ink. */}
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
          <dd className="till-figure text-base font-semibold text-accent">
            {formatRupiah(shown.total)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

const MESSAGE_TO = 'Budi Santoso';
const MESSAGE =
  'Halo Budi Santoso, berikut nota INV-2026-001 dari Warung Maju Jaya sebesar Rp88.578. Terima kasih.';

/** Types the WhatsApp message once, when the panel is open and on screen. */
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

/** `#kirim`: the WhatsApp message that writes itself, and the PDF that follows. */
function SendPanel() {
  const ref = useRef<HTMLDivElement>(null);
  // `once`: the message types itself the first time this panel is on screen,
  // and stays whole while the reader is looking at it.
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const { text, done } = useTypedMessage(inView);

  return (
    <div ref={ref}>
      <p className="flex items-center gap-2 border-b border-rule pb-2.5 text-sm font-medium">
        <span className="flex size-7 items-center justify-center rounded-full bg-accent-soft text-accent">
          <MessageCircle size={14} aria-hidden="true" />
        </span>
        {MESSAGE_TO}
        <span className="ml-auto text-xs font-normal text-muted">online</span>
      </p>

      <p className="mt-3 rounded-item bg-background p-3 text-sm leading-relaxed">
        {text}
        {!done && <span aria-hidden="true" className="ml-0.5 inline-block w-1.5 bg-accent" />}
      </p>

      {/* Always in the layout, only invisible until the message is done: a chip
          that mounted at the end would shove the panel taller mid-sentence. */}
      <motion.div
        initial={false}
        animate={done ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
        aria-hidden={!done}
        className="mt-3 flex items-center gap-2 rounded-item border border-rule px-3 py-2 text-sm"
      >
        <FileText size={15} aria-hidden="true" className="text-accent" />
        INV-2026-001.pdf
        <span className="till-figure ml-auto text-xs text-muted">A4, 1 halaman</span>
      </motion.div>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
        <CheckCheck size={13} aria-hidden="true" className="text-accent" />
        Tanpa API WhatsApp: pesan dibuka di aplikasi WhatsApp kamu.
      </p>
    </div>
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
function StatusPanel() {
  const [status, setStatus] = useState<StatusFlow>('sent');
  const copy = STATUS_COPY[status];

  return (
    <div>
      {/* `aria-pressed` buttons, not a second tablist: these pick a value inside
          the bench, they do not switch the bench itself. */}
      <div
        role="group"
        aria-label="Status nota"
        className="flex items-center gap-1 border-b border-rule pb-2.5"
      >
        {STATUS_FLOW.map((value) => {
          const active = value === status;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => setStatus(value)}
              className={`rounded-item px-2.5 py-2 text-sm font-medium transition-colors focus-ring ${
                active ? 'bg-ink text-paper' : 'text-muted hover:bg-background hover:text-ink'
              }`}
            >
              {STATUS_COPY[value].label}
            </button>
          );
        })}
      </div>

      <div className="relative mt-4 overflow-hidden rounded-item border border-rule p-3.5">
        <p className="text-sm font-medium">Nota INV-2026-001</p>
        <p className="till-figure mt-0.5 text-xs text-muted">Budi Santoso, Rp88.578</p>

        <motion.span
          key={status}
          aria-hidden="true"
          initial={{ scale: 1.3, opacity: 0, rotate: -7 }}
          animate={{ scale: 1, opacity: 0.9, rotate: -7 }}
          transition={{ type: 'spring', stiffness: 340, damping: 20 }}
          className="receipt-stamp absolute right-3 top-2.5 text-accent"
        >
          {copy.stamp}
        </motion.span>

        <p className="mt-6 border-t border-rule pt-2.5 text-xs text-muted">{copy.hint}</p>
      </div>
    </div>
  );
}

const BENCH_IDS = ['hitung', 'kirim', 'kenapa'] as const;

type BenchTab = (typeof BENCH_IDS)[number];

function isBenchTab(value: string): value is BenchTab {
  return (BENCH_IDS as readonly string[]).includes(value);
}

/**
 * One tab of the bench.
 *
 * The ids are written out at the call site — `<BenchTabButton id="kirim" />` —
 * rather than mapped from a list, because the footers link to `#kirim` and
 * `#kenapa` and `tests/landing-anchors.test.ts` reads this source for those
 * ids. `scroll-mt-24` keeps the tab clear of the sticky header when a footer
 * link lands on it.
 */
function BenchTabButton({
  id,
  label,
  active,
  onSelect,
}: {
  id: BenchTab;
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      id={id}
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={`panel-${id}`}
      onClick={onSelect}
      className={`relative scroll-mt-24 px-3 py-2.5 text-sm font-medium transition-colors focus-ring ${
        active ? 'text-ink' : 'text-muted hover:text-ink'
      }`}
    >
      {label}
      {active && (
        <motion.span
          layoutId="bench-tab"
          className="absolute inset-x-2 -bottom-px h-0.5 bg-accent"
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        />
      )}
    </button>
  );
}

/**
 * The bench: one nota, three moments. The tabs carry the ids the footer links
 * to (`#kirim`, `#kenapa`), so a jump from the footer scrolls here *and* opens
 * the panel that link names.
 */
export function Bench() {
  const [tab, setTab] = useState<BenchTab>('hitung');

  useEffect(() => {
    const applyHash = () => {
      const id = window.location.hash.slice(1);
      if (isBenchTab(id)) setTab(id);
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  return (
    <section className={MARKETING_SECTION}>
      <div className={MARKETING_BOX}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <Head
            title="Satu nota, dari hitung sampai status."
            description="Bukan rekaman layar: ketiga bagian ini bekerja saat kamu menekannya."
          />

          <div role="tablist" aria-label="Bagian nota" className="flex items-center gap-1">
            <BenchTabButton
              id="hitung"
              label="Hitung"
              active={tab === 'hitung'}
              onSelect={() => setTab('hitung')}
            />
            <BenchTabButton
              id="kirim"
              label="Kirim"
              active={tab === 'kirim'}
              onSelect={() => setTab('kirim')}
            />
            <BenchTabButton
              id="kenapa"
              label="Status"
              active={tab === 'kenapa'}
              onSelect={() => setTab('kenapa')}
            />
          </div>
        </div>

        {/* One panel at a time, each at its own height: the card shrinks to the
            nota it is showing, instead of reserving room for the tallest one and
            leaving half of it blank under the short ones. */}
        <div
          role="tabpanel"
          id={`panel-${tab}`}
          aria-labelledby={tab}
          className="mt-4 rounded-card border border-rule bg-card p-4 sm:p-5"
        >
          {tab === 'hitung' && <CalculatorPanel />}
          {tab === 'kirim' && <SendPanel />}
          {tab === 'kenapa' && <StatusPanel />}
        </div>
      </div>
    </section>
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
    <section id="fitur" className={MARKETING_SECTION}>
      <div className={MARKETING_BOX}>
        <Head
          title="Yang benar-benar sudah jalan."
          description="Bukan rencana rilis: setiap baris di bawah ini ada di aplikasi hari ini."
        />

        <ul className="mt-5 grid border-t border-rule sm:grid-cols-2 sm:gap-x-10">
          {FEATURES.map((feature) => (
            <li key={feature} className="border-b border-rule py-2.5 text-sm">
              {feature}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
