import { motion, MotionConfig } from 'motion/react';
import { EASE, Reveal } from './reveal';

const STEPS = [
  {
    title: 'Daftar & isi profil usaha',
    description:
      'Nama, nomor WhatsApp, alamat, dan logo. Cukup sekali di awal — setiap invoice berikutnya otomatis pakai data ini.',
    detail: 'Sekali isi, selamanya kepakai.',
  },
  {
    title: 'Buat invoice-nya',
    description:
      'Tambah customer dan barang. Diskon, pajak, dan total dihitung otomatis. Mau ngebut? Ada pintasan keyboard di setiap kolom.',
    detail: 'Hitungan selalu pas, tanpa kalkulator.',
  },
  {
    title: 'Download & kirim',
    description:
      'PDF profesional langsung turun ke perangkat kamu. Notain lalu menyiapkan pesan WhatsApp-nya — tinggal lampir, kirim.',
    detail: 'Sampai ke customer dalam hitungan detik.',
  },
];

/**
 * Editorial steps: oversized outline numbers with a progress line that fills
 * as you scroll. Replaces the old three-equal-cards grid.
 */
export function WorkflowSteps() {
  return (
    <MotionConfig reducedMotion="user">
      <section id="cara-kerja" className="relative scroll-mt-4 py-20 sm:py-28">
        <div className="mx-auto w-full max-w-5xl px-5 sm:px-8">
          <Reveal scale y={18}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              Cara kerjanya
            </p>
            <h2 className="mt-3 max-w-xl text-title">Tiga langkah, kurang dari satu menit.</h2>
          </Reveal>

          <div className="relative mt-14">
            <motion.span
              aria-hidden="true"
              className="absolute left-[1.4rem] top-2 hidden w-px bg-border sm:block"
              initial={{ scaleY: 0 }}
              whileInView={{ scaleY: 1 }}
              viewport={{ once: true, amount: 0.1 }}
              transition={{ duration: 1.4, ease: EASE }}
              style={{ originY: 0, bottom: '3rem' }}
            />

            <ol className="space-y-14 sm:space-y-20">
              {STEPS.map((step, index) => (
                <motion.li
                  key={step.title}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.25 }}
                  transition={{ duration: 0.7, delay: 0.08, ease: EASE }}
                  className="relative flex gap-6 sm:gap-10"
                >
                  <span
                    aria-hidden="true"
                    className="relative z-10 mt-1 hidden size-[2.8rem] shrink-0 items-center justify-center rounded-full border border-border bg-card text-sm font-semibold text-accent shadow-card sm:flex"
                  >
                    {index + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <h3 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
                        {step.title}
                      </h3>
                      <span className="text-xs font-medium text-muted">0{index + 1}</span>
                    </div>

                    <p className="mt-3 max-w-xl text-base leading-relaxed text-muted sm:text-lead">
                      {step.description}
                    </p>

                    <motion.p
                      initial={{ opacity: 0, x: -12 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, amount: 0.6 }}
                      transition={{ duration: 0.5, delay: 0.3, ease: EASE }}
                      className="mt-4 inline-flex items-center gap-2 rounded-pill border border-accent/20 bg-accent-soft px-3 py-1 text-xs font-medium text-accent"
                    >
                      {step.detail}
                    </motion.p>
                  </div>
                </motion.li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}
