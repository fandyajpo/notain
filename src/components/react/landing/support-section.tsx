import { SupportForm } from '../support/support-form';
import { MARKETING_H2, MARKETING_SECTION } from '../../../lib/ui/classes';

/**
 * Support/contact section on the landing page: the form itself, not a link to
 * one, so a reader with a question at the bottom of the page never has to leave
 * it. `/contact` hosts the same component (`source` distinguishes the two in the
 * stored rows).
 *
 * Two columns on a wide screen — the words beside the form instead of a heading
 * stacked over a card — which takes the block from two screens to one.
 */
export function SupportSection() {
  return (
    <section id="support" className={MARKETING_SECTION}>
      <div className="mx-auto grid w-full max-w-5xl gap-5 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:gap-12">
        <div>
          <h2 className={MARKETING_H2}>Ada yang bisa kami bantu?</h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
            Pertanyaan soal fitur, plan, atau kendala pemakaian: tulis di sini, kami balas lewat
            email dalam 1–2 hari kerja.
          </p>
        </div>

        <div className="rounded-card border border-rule bg-card p-4 sm:p-5">
          <SupportForm source="landing" />
        </div>
      </div>
    </section>
  );
}
