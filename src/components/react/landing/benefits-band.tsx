import { motion, MotionConfig } from 'motion/react';
import { Calculator, FileText, MessageCircle, ShieldCheck } from 'lucide-react';
import { EASE } from './reveal';

const BENEFITS = [
  {
    title: 'Diskon & pajak otomatis',
    description: 'Persen atau nominal, total dihitung sendiri. Tanpa kalkulator.',
    icon: Calculator,
  },
  {
    title: 'PDF profesional',
    description: 'Invoice rapi dan siap cetak, lengkap dengan kop dan footer kamu.',
    icon: FileText,
  },
  {
    title: 'Langsung ke WhatsApp',
    description: 'Pesan invoice sudah disiapkan, tinggal kirim ke customer.',
    icon: MessageCircle,
  },
  {
    title: 'Tersimpan di akun kamu',
    description: 'Invoice aman di cloud, bisa dibuka dari HP maupun laptop.',
    icon: ShieldCheck,
  },
];

/** Dark full-bleed band — the page's contrast beat, between two light sections. */
export function BenefitsBand() {
  return (
    <MotionConfig reducedMotion="user">
      <section id="kenapa" className="relative scroll-mt-4 overflow-hidden bg-foreground">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(to_right,rgb(255_255_255_/_0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255_/_0.05)_1px,transparent_1px)] [background-size:28px_28px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-accent/20 blur-3xl"
        />

        <div className="relative mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <div className="max-w-xl">
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
              Hanya fitur yang bikin invoice kamu lebih cepat sampai ke customer.
            </motion.h2>
          </div>

          <div className="mt-14 grid gap-px overflow-hidden rounded-card border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {BENEFITS.map(({ title, description, icon: Icon }, index) => (
              <motion.article
                key={title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.55, delay: index * 0.08, ease: EASE }}
                className="group relative bg-foreground p-6 transition-colors hover:bg-[#1d1d1d]"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 -left-full w-full bg-gradient-to-r from-transparent via-white/8 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[200%]"
                />
                <span className="relative flex size-10 items-center justify-center rounded-control bg-accent/15 text-accent">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <h3 className="relative mt-5 text-base font-semibold text-white">{title}</h3>
                <p className="relative mt-1.5 text-sm leading-relaxed text-white/60">
                  {description}
                </p>
              </motion.article>
            ))}
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 text-sm text-white/45"
          >
            Data invoice disimpan di akun kamu, bukan di browser ini.
          </motion.p>
        </div>
      </section>
    </MotionConfig>
  );
}
