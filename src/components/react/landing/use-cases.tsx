import { motion, MotionConfig } from 'motion/react';
import { Briefcase, Coffee, ShoppingBag, Wrench } from 'lucide-react';
import { EASE, Reveal, SectionHeading } from './reveal';

const CASES = [
  {
    icon: Coffee,
    title: 'Warung dan usaha kecil',
    example: 'Warung, toko, katering',
    description:
      'Buat nota harian, kirim lewat WhatsApp, dan simpan riwayatnya di akunmu. Bisa dibuka lagi saat ganti HP.'
  },
  {
    icon: Briefcase,
    title: 'Pekerja lepas',
    example: 'Desainer, developer, penulis',
    description:
      'Buat nota untuk tiap proyek dengan nama usaha dan catatanmu. Tandai pembayaran yang sudah masuk.'
  },
  {
    icon: Wrench,
    title: 'Penyedia jasa',
    example: 'Jasa servis, salon, fotografer',
    description:
      'Catat pekerjaan, jumlah, dan total pembayaran di satu nota. Bagikan PDF-nya ke pelanggan.',
  },
  {
    icon: ShoppingBag,
    title: 'Toko online dan reseller',
    example: 'Toko online, reseller, distributor',
    description:
      'Impor daftar pelanggan dan barang dari Excel. Pakai lagi katalog saat membuat nota dan cek pembayaran yang belum masuk.'
  },
] as const;

/**
 * `#untuk-siapa`: the "this is you" section.
 *
 * Each card names a real audience and grounds it in a concrete use of a real
 * feature (WhatsApp share, Excel import, catalog, status tracking). No claim
 * here implies industry-specific functionality; Notain's feature set is the
 * same for everyone.
 */
export function UseCases() {
  return (
    <MotionConfig reducedMotion="user">
      <section id="untuk-siapa" className="scroll-mt-4 border-t border-border bg-card">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <SectionHeading
            title="Buat nota untuk berbagai jenis usaha."
            description="Warung, toko online, katering, salon, atau jasa. Mulai dari browser HP maupun laptop."
          />

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:gap-6">
            {CASES.map(({ icon: Icon, title, example, description }, index) => (
              <motion.article
                key={title}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.55, delay: index * 0.07, ease: EASE }}
                className="group rounded-card border border-border bg-background p-6 shadow-card transition-colors hover:border-accent/30"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold">{title}</h3>
                    <p className="truncate text-xs text-muted">{example}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted">{description}</p>
              </motion.article>
            ))}
          </div>

          <Reveal y={14} delay={0.2}>
            <p className="mt-8 text-center text-xs text-muted">
              Fitur yang sama bisa dipakai dari HP atau laptop: nota, pelanggan, katalog, dan PDF.
            </p>
          </Reveal>
        </div>
      </section>
    </MotionConfig>
  );
}
