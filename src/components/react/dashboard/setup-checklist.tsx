import { Check, Circle, PartyPopper } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { cardClass } from '../ui/card';
import { confettiBurst } from '../../../lib/ui/confetti';
import type { BusinessProfile } from '../../../core/profile/model';

type Step = {
  id: string;
  label: string;
  hint: string;
  done: boolean;
  href: string;
  cta: string;
};

type Props = {
  profile: BusinessProfile | undefined;
  /** Whether the account has at least one invoice yet. */
  hasInvoices: boolean;
  /** Hide while the inputs are still unknown — "loading" must not read as "incomplete". */
  hidden: boolean;
};

/**
 * Device-local flags behind the completion card. Both are best-effort: a
 * browser in private mode throws on localStorage, and the checklist then
 * simply behaves like the classic hide-when-done version.
 *
 * `incomplete-seen` records that this device ever showed the checklist with
 * work still to do; the completion card only appears for accounts that qualify
 * that way, so a long-time user meeting the checklist for the first time on a
 * deploy is never congratulated for onboarding they finished long ago.
 * `celebrated` keeps the card from reappearing on every later visit.
 */
const INCOMPLETE_SEEN_KEY = 'notain.setup.incomplete-seen';
const CELEBRATED_KEY = 'notain.setup.celebrated';

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    // Private mode etc. — the celebration is a nice-to-have, never an error.
  }
}

/**
 * The onboarding quest: the handful of things that stand between a fresh
 * account and an invoice that is ready to send.
 *
 * It only appears while something is still undone. Once every step is done it
 * swaps — one single time, on the device that watched the work happen — for a
 * "Semua siap!" card with a confetti burst, and after that disappears
 * entirely: a checklist that stays around after it is finished is just noise.
 * On a failed profile fetch it stays hidden too: "incomplete" and "we could
 * not tell" must not look the same.
 *
 * The data arrives as props so the dashboard's single invoice query feeds both
 * this checklist and the summary above it, instead of the two firing separate
 * fetches of the same rows.
 */
export function SetupChecklist({ profile, hasInvoices, hidden }: Props) {
  const steps: Step[] = [
    {
      id: 'profil',
      label: 'Lengkapi profil usaha',
      hint: 'Nama & kontak tampil di kop setiap invoice.',
      done: Boolean(profile?.name?.trim()),
      href: '/settings',
      cta: 'Lengkapi',
    },
    {
      id: 'logo',
      label: 'Unggah logo',
      hint: 'Logo bikin invoice kelihatan lebih resmi.',
      done: Boolean(profile?.logoUrl),
      href: '/settings',
      cta: 'Unggah',
    },
    {
      id: 'invoice',
      label: 'Buat invoice pertama',
      hint: 'Pilih template, isi customer & barang, langsung siap kirim.',
      done: hasInvoices,
      href: '/invoice/new',
      cta: 'Buat',
    },
  ];

  const allDone = steps.every((step) => step.done);
  const [celebrated, setCelebrated] = useState(() => readFlag(CELEBRATED_KEY));
  const [sawIncomplete, setSawIncomplete] = useState(() => readFlag(INCOMPLETE_SEEN_KEY));

  // The same mount can go from incomplete to complete (a refetch landing, a
  // saved invoice), so the "has seen work to do" flag flips in state as well
  // as on disk — the completion card must catch that transition too.
  useEffect(() => {
    if (hidden || allDone) return;
    setSawIncomplete(true);
    writeFlag(INCOMPLETE_SEEN_KEY);
  }, [hidden, allDone]);

  const celebrate = !hidden && allDone && !celebrated && sawIncomplete;

  useEffect(() => {
    if (!celebrate) return;
    confettiBurst({ x: window.innerWidth / 2, y: window.innerHeight * 0.3 }, { count: 50 });
  }, [celebrate]);

  if (hidden) return null;

  if (celebrate) {
    return (
      <section aria-labelledby="setup-checklist-title" className={cardClass('md')}>
        <div className="flex items-center justify-between gap-3">
          <h2 id="setup-checklist-title" className="text-section">
            Langkah awal
          </h2>
          <span className="text-xs text-muted tabular-nums">
            {steps.length}/{steps.length} selesai
          </span>
        </div>
        <div className="mt-4 flex flex-col items-center gap-3 py-4 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
            <PartyPopper size={22} aria-hidden="true" />
          </span>
          <p className="font-medium">Semua siap!</p>
          <p className="max-w-sm text-sm text-muted">
            Profil, logo, dan invoice pertama kamu sudah beres. Notain siap dipakai buat tagih
            customer.
          </p>
          <Button
            size="sm"
            onClick={() => {
              writeFlag(CELEBRATED_KEY);
              setCelebrated(true);
            }}
          >
            Oke, mantap
          </Button>
        </div>
      </section>
    );
  }

  if (allDone) return null;

  const doneCount = steps.filter((step) => step.done).length;

  return (
    <section aria-labelledby="setup-checklist-title" className={cardClass('md')}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="setup-checklist-title" className="text-section">
          Langkah awal
        </h2>
        <span className="text-xs text-muted tabular-nums">
          {doneCount}/{steps.length} selesai
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        Ikuti langkah ini supaya invoice kamu langsung siap dikirim.
      </p>

      <ol className="mt-4 flex flex-col gap-2">
        {steps.map((step) => (
          <li
            key={step.id}
            className={[
              'flex items-center gap-3 rounded-control border px-3 py-2.5',
              step.done ? 'border-border/60 bg-background/50' : 'border-border bg-card',
            ].join(' ')}
          >
            <span
              aria-hidden="true"
              className={[
                'flex size-5 shrink-0 items-center justify-center rounded-full',
                step.done ? 'bg-accent text-accent-foreground' : 'border border-border text-muted',
              ].join(' ')}
            >
              {step.done ? <Check size={12} strokeWidth={3} /> : <Circle size={8} />}
            </span>

            <div className="min-w-0 flex-1">
              <p
                className={[
                  'text-sm font-medium',
                  step.done ? 'text-muted line-through' : 'text-foreground',
                ].join(' ')}
              >
                {step.label}
              </p>
              <p className="mt-0.5 text-xs text-muted">{step.hint}</p>
            </div>

            {!step.done && (
              <Button href={step.href} variant="secondary" size="sm" className="shrink-0">
                {step.cta}
              </Button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
