import { motion, MotionConfig } from 'motion/react';
import { Briefcase, Coffee, ShoppingBag, Wrench } from 'lucide-react';
import { EASE, Reveal, SectionHeading } from './reveal';

const CASES = [
  {
    icon: Coffee,
    title: 'UMKM & usaha kecil',
    example: 'Warung, toko, katering',
    description:
      'Nota harian cetak rapi tanpa buku kas. Dikirim ke pelanggan lewat WhatsApp, dan riwayatnya tetap tersimpan walau ganti HP.',
  },
  {
    icon: Briefcase,
    title: 'Freelancer & profesional mandiri',
    example: 'Desainer, developer, penulis',
    description:
      'Invoice per proyek dengan kop dan catatan sendiri, jadi setiap klien menerima dokumen yang profesional, dan kamu tahu mana yang sudah lunas.',
  },
  {
    icon: Wrench,
    title: 'Penyedia jasa',
    example: 'Jasa servis, salon, fotografer',
    description:
      'Rincian pekerjaan, jumlah, dan total tagihan terangkum dalam satu dokumen. Pelanggan tinggal terima PDF-nya, tanpa perlu bertanya ulang.',
  },
  {
    icon: ShoppingBag,
    title: 'Online shop & reseller',
    example: 'Toko daring, reseller, distributor',
    description:
      'Punya daftar pembeli dan barang lama? Impor dari Excel, pakai ulang katalog, lalu pantau pesanan yang belum dibayar.',
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
            title="Cocok untuk yang pekerjaannya berputar di tagihan."
            description="Tidak perlu tim keuangan atau pelatihan khusus: cukup koneksi internet dan satu menit waktu kamu."
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
              Semua pengguna memakai fitur yang sama: Invoice, pelanggan, katalog, dan PDF, semuanya
              dibuka dari HP maupun laptop.
            </p>
          </Reveal>
        </div>
      </section>
    </MotionConfig>
  );
}
