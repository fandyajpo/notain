import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { EASE, Reveal } from './reveal';
import { PLAN_PRICES } from '../../../core/billing/plan-benefits';
import { FREE_PLAN_LIMITS } from '../../../core/billing/plans';

/**
 * Every answer here is verified against the implementation: the print-based
 * PDF flow (`docs/architecture/adr/0007-print-based-pdf.md`), the free/pro/
 * entitlement rule (`core/billing/plans`), the checkout catalog, and the
 * pages that exist in `src/pages`. Prices are interpolated from
 * `PLAN_PRICES`, the same source the pricing page renders from, so a price
 * change cannot leave this FAQ stale.
 */
const FAQS = [
  {
    question: 'Apa itu Notain?',
    answer:
      'Notain membantu kamu membuat nota, menghitung total, menyimpan data pelanggan, dan membagikan PDF lewat WhatsApp. Bisa dipakai dari HP atau laptop.',
  },
  {
    question: 'Siapa yang bisa memakai Notain?',
    answer:
      'Pemilik warung, toko online, katering, salon, pekerja lepas, dan usaha jasa bisa memakai Notain untuk membuat nota.',
  },
  {
    question: 'Bagaimana cara membuat nota?',
    answer:
      'Buat akun, lalu pilih Buat nota. Pilih pelanggan dan barang yang sudah tersimpan, atur diskon atau pajak, lalu bagikan notanya.',
  },
  {
    question: 'Tampilan nota bisa diubah?',
    answer:
      'Bisa. Pilih template bawaan, tambahkan logo dan nama usaha, lalu isi catatan atau tanggal jatuh tempo di nota.',
  },
  {
    question: 'Bisa diunduh jadi PDF?',
    answer: `Bisa. Buka nota dalam ukuran A4, lalu pilih "Simpan sebagai PDF" di menu cetak browser. Setelah itu, kirim PDF ke pelanggan lewat WhatsApp.`, 
  },
  {
    question: 'Berapa biayanya?',
    answer: `Fitur dasar gratis selamanya, termasuk ${FREE_PLAN_LIMITS.invoicesPerMonth} nota baru per bulan, template bawaan, dan template buatan sendiri. Pro seharga ${PLAN_PRICES.pro.amount}${PLAN_PRICES.pro.period} menambah nota tanpa batas dan tautan invoice. Business sedang disiapkan dan belum bisa dibeli.`, 
  },
  {
    question: 'Bagaimana langganan dan perpanjangannya?',
    answer:
      'Pro dibayar per bulan lewat DOKU. Setelah pembayaran terkonfirmasi, langganan langsung aktif. Kalau memperpanjang lebih awal, sisa masa aktif tetap dihitung.',
  },
  {
    question: 'Apa yang terjadi setelah masa aktif berakhir?',
    answer:
      'Akunmu kembali ke Free. Data tetap tersimpan dan fitur dasar tetap bisa dipakai. Fitur Pro seperti laporan dan tautan invoice tidak bisa dipakai lagi.',
  },
  {
    question: 'Nota saya aman tersimpan?',
    answer:
      'Nota tersimpan di akunmu, jadi tetap ada saat kamu ganti HP. Orang lain tidak bisa membukanya.',
  },
  {
    question: 'Bagaimana mengelola akun dan data saya?',
    answer:
      'Profil usaha dan logo diatur di halaman Pengaturan. Kata sandi bisa diganti lewat tautan "Lupa password" yang dikirim ke email. Invoice dan pelanggan bisa dihapus dari halaman masing-masing, dan riwayatnya bisa diekspor ke Excel atau CSV. Notain jalan di browser HP maupun laptop, tanpa perlu install aplikasi.',
  },
];

/** FAQ accordion: one panel open at a time, height animated with motion. */
export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="scroll-mt-4 border-t border-border bg-card">
      <div className="mx-auto w-full max-w-3xl px-5 py-20 sm:px-8 sm:py-24">
        <Reveal scale y={18}>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Pertanyaan umum
          </p>
          <h2 className="mt-3 text-center text-title">Masih ragu? Ini jawabannya.</h2>
        </Reveal>

        <div className="mt-10 divide-y divide-border border-y border-border">
          {FAQS.map(({ question, answer }, index) => {
            const open = openIndex === index;
            return (
              <div key={question}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenIndex(open ? null : index)}
                  className="flex w-full cursor-pointer items-center justify-between gap-4 py-5 text-left font-medium focus-ring"
                >
                  {question}
                  <ChevronDown
                    size={17}
                    aria-hidden="true"
                    className={`shrink-0 text-muted transition-transform duration-300 ${
                      open ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="overflow-hidden"
                    >
                      <p className="pb-5 pr-8 text-sm leading-relaxed text-muted">{answer}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
