import { motion, MotionConfig } from 'motion/react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { EASE, SectionHeading } from './reveal';

const STEPS = [
  {
    icon: Download,
    title: 'Unduh template',
    description: 'Format siap pakai dengan kolom Nama & WhatsApp.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Isi di Excel',
    description: 'Salin daftar customer kamu, simpan sebagai .xlsx atau .csv.',
  },
  {
    icon: Upload,
    title: 'Upload kembali',
    description: 'Customer langsung masuk, tanpa ketik ulang satu-satu.',
  },
];

/** Light section explaining Excel import/export, with a mock template preview. */
export function ExcelSection() {
  return (
    <MotionConfig reducedMotion="user">
      <section id="excel" className="scroll-mt-4 border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <SectionHeading
                title="Sudah punya daftar di Excel? Tinggal pindah."
                description="Ekspor & impor customer dan invoice dalam format Excel (.xlsx) atau CSV. Tidak perlu input ulang satu-satu."
              />

              <div className="mt-8 flex flex-col gap-5">
                {STEPS.map(({ icon: Icon, title, description }, index) => (
                  <motion.div
                    key={title}
                    initial={{ opacity: 0, x: -14 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ duration: 0.5, delay: index * 0.08, ease: EASE }}
                    className="flex items-start gap-3"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent">
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <div>
                      <p className="font-medium">{title}</p>
                      <p className="text-sm text-muted">{description}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.6, ease: EASE }}
              className="rounded-card border border-border bg-card p-4 shadow-card"
            >
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <FileSpreadsheet size={16} className="shrink-0 text-accent" aria-hidden="true" />
                <span className="truncate text-sm font-medium">template-customer.xlsx</span>
              </div>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="py-2 font-medium">Nama</th>
                    <th className="py-2 font-medium">WhatsApp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="py-2">Budi Santoso</td>
                    <td className="py-2">081234567890</td>
                  </tr>
                  <tr>
                    <td className="py-2">Siti Rahma</td>
                    <td className="py-2">081298765432</td>
                  </tr>
                </tbody>
              </table>
            </motion.div>
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}
