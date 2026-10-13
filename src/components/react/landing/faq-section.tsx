import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { EASE, Reveal } from './reveal';

const FAQS = [
  {
    question: 'Berapa biayanya?',
    answer:
      'Gratis untuk seluruh fitur inti: buat invoice, PDF, dan kirim lewat WhatsApp. Tanpa kartu kredit dan tanpa masa trial. Ada juga plan Pro (Rp 29.000/bulan) untuk template premium, invoice link, dan laporan bisnis — detailnya di halaman Harga.',
  },
  {
    question: 'Data invoice saya aman?',
    answer:
      'Invoice disimpan di akun kamu, bukan di browser ini. Artinya tidak hilang kalau ganti HP atau bersihkan data browser, dan tidak bisa dibuka orang lain.',
  },
  {
    question: 'Harus install aplikasi?',
    answer: 'Tidak. Notain jalan di browser, baik di HP maupun laptop. Buka, langsung pakai.',
  },
  {
    question: 'Bisa dipakai dari HP?',
    answer:
      'Bisa, dan memang dirancang untuk itu. Dari mengisi invoice sampai download PDF dan buka WhatsApp, semuanya nyaman di layar HP.',
  },
  {
    question: 'PDF-nya bisa dicetak?',
    answer:
      'Bisa. File berformat A4 dengan margin rapi, siap dicetak atau dikirim digital lewat WhatsApp dan email.',
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
