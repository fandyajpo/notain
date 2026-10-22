import { motion, MotionConfig } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { EASE } from './reveal';

/**
 * Everyday problems → Notain's answer, as paired rows rather than a grid of
 * feature cards: each row names a pain this product's users actually have and
 * the verified capability that removes it.
 */
const PAIRS = [
  {
    problem: 'Hitungan diskon & pajak yang meleset bikin rugi.',
    solution: 'Kalkulator otomatis: persen atau nominal, total selalu pas.',
  },
  {
    problem: 'File invoice berserakan di galeri dan chat.',
    solution: 'Semua tersimpan di akun, dibuka dari HP maupun laptop.',
  },
  {
    problem: 'Kirim nota satu-satu, ribet salin tempel.',
    solution: 'PDF A4 siap kirim, pesan WhatsApp-nya sudah disiapkan.',
  },
  {
    problem: 'Lupa siapa yang sudah bayar dan siapa yang belum.',
    solution: 'Status Lunas & Terkirim jelas, bukti bayar menempel di invoicenya.',
  },
] as const;

/** Dark full-bleed band, the page's contrast beat, between two light sections. */
export function BenefitsBand() {
  return (
    <MotionConfig reducedMotion="user">
      <section id="kenapa" className="relative scroll-mt-4 overflow-hidden bg-foreground">
        {/* White graph paper: the inverse band's texture. White has no token;
            this overlay is part of the dark-section identity, not app chrome. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(to_right,rgb(255_255_255_/_0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255_/_0.05)_1px,transparent_1px)] [background-size:28px_28px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-accent/20 blur-3xl"
        />

        <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-20">
          <div>
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.5, ease: EASE }}
              className="text-xs font-semibold uppercase tracking-[0.18em] text-accent"
            >
              Kenapa Notain
            </motion.p>
            <motion.h2
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.7, delay: 0.08, ease: EASE }}
              className="mt-3 text-title text-white"
            >
              Masalah sehari-hari yang langsung teratasi.
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.6, delay: 0.2, ease: EASE }}
              className="mt-4 max-w-sm text-sm leading-relaxed text-white/55"
            >
              Bukan fitur demi fitur, tapi jawaban untuk hal yang selama ini bikin pusing
              tiap mau tagih pembayaran.
            </motion.p>
          </div>

          <ul className="divide-y divide-white/10 border-y border-white/10">
            {PAIRS.map(({ problem, solution }, index) => (
              <motion.li
                key={problem}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.55, delay: index * 0.08, ease: EASE }}
                className="py-5 sm:py-6"
              >
                <p className="flex items-start gap-3 text-sm leading-relaxed text-white/45">
                  <span aria-hidden="true" className="mt-0.5 shrink-0 text-accent/70">
                    <ArrowRight size={15} />
                  </span>
                  {problem}
                </p>
                <p className="mt-1.5 pl-[1.6rem] text-base font-medium leading-snug text-white">
                  {solution}
                </p>
              </motion.li>
            ))}
          </ul>
        </div>
      </section>
    </MotionConfig>
  );
}
