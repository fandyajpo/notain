import { motion, MotionConfig } from 'motion/react';
import { useMemo } from 'react';
import { CheckCheck, FileText, MessageCircle, Paperclip, Phone, Send } from 'lucide-react';
import { calculateTotals } from '../../../core/invoice/calculator';
import { createSampleInvoice } from '../../../core/invoice/sample';
import { buildInvoiceWhatsAppMessage } from '../../../core/whatsapp';
import { EASE, Reveal, SectionHeading } from './reveal';

const BULLETS = [
  {
    icon: Send,
    title: 'Pesan tinggal kirim',
    description: 'Nomor invoice, nama pelanggan, dan totalnya sudah terisi otomatis.',
  },
  {
    icon: MessageCircle,
    title: 'Chat langsung terbuka',
    description: 'Nomor WhatsApp pelanggan tersambung, tanpa perlu salin tempel.',
  },
  {
    icon: Paperclip,
    title: 'PDF tinggal dilampirkan',
    description: 'File sudah siap di perangkat kamu sebelum pesan dikirim.',
  },
];

const BUBBLE = {
  hidden: { opacity: 0, y: 14, scale: 0.96 },
  shown: { opacity: 1, y: 0, scale: 1 },
} as const;

type PhoneChatProps = {
  businessName: string;
  message: string;
  fileName: string;
};

/** Phone frame whose chat bubbles appear in the order the real flow happens. */
function PhoneChat({ businessName, message, fileName }: PhoneChatProps) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative mx-auto w-full max-w-[19rem]">
        {/* Glow pulse echoing the phone silhouette (3rem radius) under blur. */}
        <motion.div
          aria-hidden="true"
          className="absolute -inset-6 -z-10 rounded-[3rem] bg-accent/12 blur-3xl will-change-transform"
          animate={{ opacity: [0.6, 1, 0.6], scale: [1, 1.05, 1] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Device mockup: the frame/screen radii mimic a phone body, deliberate
            hardware chrome, not app-card radii (rounded-card/control/item). */}
        <div className="rounded-[2.5rem] border border-border bg-foreground p-2 shadow-modal">
          <div className="relative overflow-hidden rounded-[2rem] bg-background">
            <div
              aria-hidden="true"
              className="absolute left-1/2 top-0 z-10 h-5 w-28 -translate-x-1/2 rounded-b-xl bg-foreground"
            />

            <div className="flex items-center gap-2.5 border-b border-border bg-card px-4 pb-3 pt-7">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                {businessName
                  .split(' ')
                  .map((word) => word[0])
                  .slice(0, 2)
                  .join('')}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{businessName}</p>
                <p className="text-xs text-muted">online</p>
              </div>
              <Phone size={15} aria-hidden="true" className="ml-auto shrink-0 text-muted" />
            </div>

            {/* Chat wallpaper: 14px radial dot grid, foreground-tinted,
                part of the messaging mockup, not the app texture. */}
            <motion.div
              initial="hidden"
              whileInView="shown"
              viewport={{ once: true, amount: 0.4 }}
              transition={{ staggerChildren: 0.35, delayChildren: 0.15 }}
              className="min-h-[21rem] space-y-2.5 bg-[radial-gradient(color-mix(in_srgb,var(--color-foreground)_7%,transparent)_1px,transparent_1px)] px-3.5 py-5 [background-size:14px_14px]"
            >
              <motion.div
                variants={BUBBLE}
                transition={{ duration: 0.5, ease: EASE }}
                className="ml-auto max-w-[88%] rounded-2xl rounded-br-md border border-accent/20 bg-accent-soft px-3.5 py-2.5"
              >
                <p className="whitespace-pre-line text-[13px] leading-relaxed">{message}</p>
                <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted">
                  09.41
                  <CheckCheck size={12} aria-hidden="true" className="text-accent" />
                </span>
              </motion.div>

              <motion.div
                variants={BUBBLE}
                transition={{ duration: 0.5, ease: EASE }}
                className="ml-auto flex w-[78%] items-center gap-2.5 rounded-2xl rounded-br-md border border-accent/20 bg-accent-soft px-3 py-2.5"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-card text-accent shadow-card">
                  <FileText size={16} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{fileName}</p>
                  <p className="text-[10px] text-muted">PDF · A4</p>
                </div>
              </motion.div>

              <motion.div
                variants={BUBBLE}
                transition={{ duration: 0.5, ease: EASE }}
                className="max-w-[82%] rounded-2xl rounded-bl-md border border-border bg-card px-3.5 py-2.5 shadow-card"
              >
                <p className="text-[13px] leading-relaxed">Siap, nanti saya bayar sore ini 🙏</p>
                <span className="mt-1 block text-right text-[10px] text-muted">09.42</span>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}

/** "Kirim. Selesai." made visible: the prepared message inside a phone chat. */
export function WhatsAppSection() {
  const { business, draft } = useMemo(
    () => createSampleInvoice(new Date(Date.UTC(2026, 9, 8))),
    [],
  );
  const totals = calculateTotals({
    items: draft.items,
    discount: draft.discount,
    tax: draft.tax,
  });
  const message = buildInvoiceWhatsAppMessage({
    customerName: draft.customerName,
    invoiceNumber: draft.invoiceNumber,
    businessName: business.name,
    total: totals.grandTotal,
  });

  return (
    <section id="whatsapp" className="scroll-mt-4">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:gap-16 lg:py-20">
        <div>
          <SectionHeading
            title="Sampai ke pelanggan dalam satu ketukan"
            description="Notain menyiapkan pesan WhatsApp-nya untuk kamu. Buka chat, lampirkan PDF, kirim."
          />

          <ul className="mt-8 space-y-5">
            {BULLETS.map(({ icon: Icon, title, description }, index) => (
              <Reveal key={title} y={16} delay={0.08 * index}>
                <li className="flex gap-3.5">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent">
                    <Icon size={15} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="mt-0.5 text-sm text-muted">{description}</p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ul>

          <Reveal y={16} delay={0.3}>
            <p className="mt-8 text-xs text-muted">
              Tanpa API WhatsApp dan tanpa biaya tambahan, memakai chat biasa yang sudah kamu punya.
            </p>
          </Reveal>
        </div>

        <Reveal y={28} delay={0.1}>
          <PhoneChat
            businessName={business.name}
            message={message}
            fileName={`${draft.invoiceNumber}.pdf`}
          />
        </Reveal>
      </div>
    </section>
  );
}
