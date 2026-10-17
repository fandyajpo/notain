import { Check, Circle } from 'lucide-react';
import { Button } from '../ui/button';
import { cardClass } from '../ui/card';
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
 * The onboarding quest: the handful of things that stand between a fresh
 * account and an invoice that is ready to send.
 *
 * It only appears while something is still undone, and disappears entirely once
 * every step is complete — a checklist that stays around after it is finished
 * is just noise. On a failed profile fetch it stays hidden too: "incomplete"
 * and "we could not tell" must not look the same.
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

  if (hidden) return null;
  if (steps.every((step) => step.done)) return null;

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
