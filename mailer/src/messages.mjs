/**
 * The three messages Notain sends, as pure data.
 *
 * Each builder is a plain function of its input and returns
 * `{ to, subject, text, html }` — the exact shape `transport.send()` needs. No
 * I/O, no configuration reads, no clock: which is what makes them testable
 * without a relay (`test/messages.test.mjs`).
 */

import { formatDate, formatRupiah, renderEmail } from './render.mjs';

export const MESSAGE_TYPES = ['welcome', 'password-reset', 'invoice'];

/** Title-cased fallback for a recipient whose name we do not know. */
function salutation(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed === '' ? 'Halo' : `Halo ${trimmed}`;
}

/**
 * Sent right after an account is created. Deliberately one short paragraph and
 * one link: a first email that explains the whole product gets skimmed.
 */
export function welcomeMessage({ to, name, loginUrl, appName = 'Notain', logoUrl }) {
  const rendered = renderEmail({
    appName,
    logoUrl,
    heading: 'Selamat datang di Notain',
    greeting: salutation(name),
    paragraphs: [
      'Akun kamu sudah siap. Notain membuat nota untuk usahamu, lalu menyiapkannya untuk dicetak atau dikirim ke pelanggan.',
      'Langkah pertama: atur nama usaha dan logo di halaman organisasi. Setelah itu kamu bisa langsung membuat nota pertama.',
    ],
    cta: { label: 'Masuk ke Notain', url: loginUrl },
    footnote: 'Kamu menerima email ini karena akun Notain baru saja dibuat dengan alamat ini.',
  });

  return {
    to,
    subject: `Selamat datang di ${appName}`,
    text: rendered.text,
    html: rendered.html,
  };
}

/**
 * The password-reset link.
 *
 * The URL carries the only copy of the token; `expiresMinutes` is quoted in the
 * body so a user who finds the email hours later knows why it failed instead of
 * assuming the account is broken.
 */
export function passwordResetMessage({
  to,
  name,
  resetUrl,
  expiresMinutes = 30,
  appName = 'Notain',
  logoUrl,
}) {
  const rendered = renderEmail({
    appName,
    logoUrl,
    heading: 'Atur ulang kata sandi',
    greeting: salutation(name),
    paragraphs: [
      `Kami menerima permintaan untuk mengatur ulang kata sandi akun ${appName} kamu.`,
      `Tautan di bawah berlaku ${expiresMinutes} menit dan hanya bisa dipakai sekali.`,
    ],
    cta: {
      label: 'Pilih kata sandi baru',
      url: resetUrl,
      hint: 'Kalau kamu tidak meminta ini, abaikan email ini. Kata sandi kamu tidak berubah.',
    },
    footnote:
      'Demi keamanan, semua sesi lain di akun kamu diakhiri setelah kata sandi baru disimpan.',
  });

  return {
    to,
    subject: `Atur ulang kata sandi ${appName} kamu`,
    text: rendered.text,
    html: rendered.html,
  };
}

/**
 * The nota itself, mailed to the customer.
 *
 * The document is NOT attached: PDFs in Notain are the browser's print dialog
 * (ADR 0007), so there is no server-side renderer to attach. The email carries
 * the same numbers the print view prints plus the capability link, which is the
 * page the customer would otherwise have to be handed by WhatsApp.
 */
export function invoiceMessage({
  to,
  customerName,
  invoiceNumber,
  businessName,
  total,
  date,
  dueDate,
  note,
  invoiceUrl,
  senderName,
  appName = 'Notain',
  logoUrl,
}) {
  const facts = [{ label: 'Nomor nota', value: invoiceNumber }];

  const formattedDate = formatDate(date);
  if (formattedDate !== '') facts.push({ label: 'Tanggal', value: formattedDate });

  const formattedDue = formatDate(dueDate);
  if (formattedDue !== '') facts.push({ label: 'Jatuh tempo', value: formattedDue });

  facts.push({ label: 'Total', value: formatRupiah(total) });
  if (typeof businessName === 'string' && businessName.trim() !== '') {
    facts.push({ label: 'Dari', value: businessName.trim() });
  }

  const paragraphs = [];
  if (typeof note === 'string' && note.trim() !== '') paragraphs.push(note.trim());
  paragraphs.push(
    'Buka halaman tagihan di bawah untuk melihat nota lengkap dan mengirim bukti pembayaran.',
  );

  const rendered = renderEmail({
    appName,
    logoUrl,
    heading: `Nota ${invoiceNumber}`,
    greeting: salutation(customerName),
    paragraphs,
    facts,
    cta: { label: 'Buka halaman tagihan', url: invoiceUrl },
    footnote:
      senderName && senderName.trim() !== ''
        ? `Dikirim oleh ${senderName.trim()} lewat ${appName}.`
        : `Dikirim lewat ${appName}.`,
  });

  return {
    to,
    subject: `Nota ${invoiceNumber} dari ${businessName || appName}`,
    text: rendered.text,
    html: rendered.html,
  };
}
