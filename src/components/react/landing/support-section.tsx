import { LifeBuoy } from 'lucide-react';
import { Reveal } from './reveal';
import { SupportForm } from '../support/support-form';

/**
 * Support/contact section on the landing page — the form itself, not a link
 * to one, so a reader with a question at the bottom of the page never has to
 * leave it. `/contact` hosts the same component (`source` distinguishes the
 * two in the stored rows).
 */
export function SupportSection() {
  return (
    <section id="support" className="scroll-mt-4 border-t border-border bg-background">
      <div className="mx-auto w-full max-w-3xl px-5 py-20 sm:px-8 sm:py-24">
        <Reveal scale y={18}>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Support
          </p>
          <h2 className="mt-3 text-center text-title">Ada yang bisa kami bantu?</h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-lead text-muted">
            Pertanyaan soal fitur, plan, atau kendala pemakaian — tulis di sini, kami balas lewat
            email.
          </p>
        </Reveal>

        <Reveal y={24} className="mt-10">
          <div className="rounded-card border border-border bg-card p-5 shadow-card sm:p-6">
            <div className="mb-5 flex items-start gap-3">
              <LifeBuoy size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">Kirim pesan ke tim Notain</p>
                <p className="mt-0.5 text-xs text-muted">
                  Isi form di bawah — cukup nama, email, dan pesanmu.
                </p>
              </div>
            </div>
            <SupportForm source="landing" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
