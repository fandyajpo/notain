import { motion, MotionConfig } from 'motion/react';
import { EASE, SectionHeading } from './reveal';
import { cardClass } from '../ui/card';

/**
 * Testimonials for the landing page.
 *
 * **Truthfulness contract:** this repository contains no authentic, authorized
 * customer quotes, not in code, docs, or assets. The placeholder data below
 * is fictional and is identified as such in code AND (when shown) on screen;
 * `SHOW_PLACEHOLDER_TESTIMONIALS` defaults to `false`, so the landing page
 * renders no testimonial section at all rather than fake social proof.
 *
 * To publish real testimonials later:
 * 1. Replace `PLACEHOLDER_TESTIMONIALS` with actual, authorized quotes
 *    (exact wording, accurate attribution, names/roles/photos only with
 *    permission), and
 * 2. set `SHOW_PLACEHOLDER_TESTIMONIALS` to `true` and flip `placeholder`
 *    to `false` on each real entry so the on-screen "Contoh" badge goes away.
 *
 * Never ship the placeholders to production as if they were real reviews, and
 * never add star ratings or user counts that are not verifiable.
 */
export type Testimonial = {
  quote: string;
  name: string;
  /** Role or business type, e.g. 'Pemilik katering'. */
  role: string;
  /** While `true`, the card renders a visible "Contoh, bukan testimoni asli" badge. */
  placeholder: boolean;
};

/** FICTIONAL sample rows, structural placeholders only, never real quotes. */
export const PLACEHOLDER_TESTIMONIALS: readonly Testimonial[] = [
  {
    quote:
      'Dulu saya bikin nota manual di Word. Sekarang tinggal pilih pelanggan, totalnya jadi sendiri, PDF-nya langsung selesai.',
    name: 'Contoh Pengguna A',
    role: 'Pemilik usaha (placeholder)',
    placeholder: true,
  },
  {
    quote:
      'Pelanggan saya tinggal terima file di WhatsApp. Tidak ada lagi salah tulis nominal atau hitungan yang meleset.',
    name: 'Contoh Pengguna B',
    role: 'Freelancer (placeholder)',
    placeholder: true,
  },
];

/**
 * Whether the landing page shows a testimonial section at all. `false` until
 * authentic quotes exist; see the contract above.
 */
export const SHOW_PLACEHOLDER_TESTIMONIALS = false;

export function TestimonialsSection({
  testimonials = PLACEHOLDER_TESTIMONIALS,
  show = SHOW_PLACEHOLDER_TESTIMONIALS,
}: {
  testimonials?: readonly Testimonial[];
  show?: boolean;
}) {
  if (!show || testimonials.length === 0) return null;

  return (
    <MotionConfig reducedMotion="user">
      <section id="testimoni" className="scroll-mt-4 border-t border-border bg-card">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <SectionHeading
            align="center"
            title="Kata mereka yang sudah pakai Notain."
            description="Bagian ini menampilkan testimoni terverifikasi begitu tersedia."
          />

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:gap-6">
            {testimonials.map((item) => (
              <motion.figure
                key={item.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.55, ease: EASE }}
                className={cardClass('md')}
              >
                {item.placeholder && (
                  <span className="mb-3 inline-flex rounded-pill border border-warning/30 bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-warning">
                    Contoh, bukan testimoni asli
                  </span>
                )}
                <blockquote className="text-sm leading-relaxed text-foreground">
                  “{item.quote}”
                </blockquote>
                <figcaption className="mt-4 text-sm text-muted">
                  <span className="font-medium text-foreground">{item.name}</span>
                  {' · '}
                  {item.role}
                </figcaption>
              </motion.figure>
            ))}
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}
