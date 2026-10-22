import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { EASE, Reveal } from './reveal';
import { PLAN_PRICES } from '../../../core/billing/plan-benefits';

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
      'Notain adalah aplikasi berbasis web untuk membuat, mengelola, dan mengirim invoice profesional, lengkap dengan kop usaha, diskon, pajak, dan PDF A4, untuk UMKM, freelancer, dan penyedia jasa di Indonesia.',
  },
  {
    question: 'Siapa yang bisa memakai Notain?',
    answer:
      'Siapa pun yang perlu mengirim tagihan: pemilik UMKM, freelancer, jasa servis, sampai online shop. Tidak perlu latar belakang akuntansi, semua dirancang untuk dipakai langsung tanpa pelatihan.',
  },
  {
    question: 'Bagaimana cara membuat invoice?',
    answer:
      'Daftar, lengkapi profil usaha sekali, lalu tekan "Buat Invoice". Pilih pelanggan dan barang dari daftar yang sudah tersimpan, atur diskon dan pajak, totalnya dihitung otomatis. Selesai dalam hitungan detik.',
  },
  {
    question: 'Bisakah detail invoice disesuaikan?',
    answer:
      'Bisa. Pakai template bawaan, unggah logo, dan isi kop, catatan, serta zona teks bebas di invoice. Nama usaha, alamat, dan nomor WhatsApp kamu tampil otomatis di setiap invoice.',
  },
  {
    question: 'Bisa diunduh jadi PDF?',
    answer:
      `Bisa. Invoice dibuka di tampilan cetak berukuran A4. Pilih "Simpan sebagai PDF" di dialog cetak browser, lalu kirim ke pelanggan. Dari aplikasinya, kamu juga bisa langsung membuka WhatsApp-nya.`,
  },
  {
    question: 'Berapa biayanya?',
    answer: `Gratis selamanya untuk fitur inti: invoice tanpa batas, PDF, kirim lewat WhatsApp, dan data pelanggan, tanpa kartu kredit dan tanpa masa trial. Butuh lebih? Pro ${PLAN_PRICES.pro.amount}${PLAN_PRICES.pro.period} untuk template premium dan laporan bisnis, serta Business ${PLAN_PRICES.business.amount}${PLAN_PRICES.business.period} untuk akses API. Detailnya ada di halaman Harga.`,
  },
  {
    question: 'Bagaimana langganan dan perpanjangannya?',
    answer:
      'Plan Pro dan Business dibayar per bulan lewat DOKU. Setelah pembayaran terkonfirmasi, plan langsung aktif. Perpanjangan memperpanjang masa aktif dari tanggal berakhirnya, jadi bayar lebih awal tidak mengurangi hari. Tidak ada biaya di luar harga yang tertera, dan kamu bisa berhenti kapan saja.',
  },
  {
    question: 'Apa yang terjadi setelah masa aktif berakhir?',
    answer:
      'Akun kamu kembali ke plan Free. Semua data tetap tersimpan dan fitur inti tetap bisa dipakai; yang kembali tertutup hanya fitur berbayar, seperti laporan bisnis, template premium, dan invoice link.',
  },
  {
    question: 'Data invoice saya aman?',
    answer:
      'Invoice disimpan di akun kamu, bukan di browser ini. Artinya tidak hilang kalau ganti HP atau bersihkan data browser, dan tidak bisa dibuka orang lain.',
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
