import { Mail, Send } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/button';
import { FieldShell, useFieldIds } from '../ui/field';
import { Input } from '../ui/input';
import { Modal } from '../ui/modal';
import { Notice } from '../ui/notice';
import { Textarea } from '../ui/textarea';
import { useSendInvoiceEmail } from '../../../lib/query/hooks/use-mail';
import { toast } from '../../../lib/ui/toast';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  /** The address the invoice already carries, if the customer has one. */
  defaultEmail?: string | undefined;
};

/**
 * "Email" next to the builder's WhatsApp action: mails the saved nota to the
 * customer through `POST /api/mail/nota`.
 *
 * Why not just attach the PDF: there is no server-side PDF (ADR 0007 — the
 * document is the browser's print dialog). The email carries the numbers and
 * the capability link instead, which is the same page the customer would open
 * from WhatsApp, and it can accept a payment proof.
 *
 * The interface states two things plainly, because both surprise people
 * otherwise: a Free organization cannot use this at all (the invoice link is a
 * Pro benefit, and the server answers 402), and a successful send flips an
 * unset invoice to Terkirim.
 */
export function EmailNotaDialog({ invoiceId, invoiceNumber, customerName, defaultEmail }: Props) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultEmail ?? '');
  const [note, setNote] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [serverError, setServerError] = useState<string | null>(null);
  const send = useSendInvoiceEmail();
  const emailIds = useFieldIds();
  const noteIds = useFieldIds();

  function close() {
    // Closing mid-flight would leave the user without the outcome of a request
    // that is already on its way.
    if (send.isPending) return;
    setOpen(false);
    setServerError(null);
  }

  async function submit() {
    setServerError(null);
    const email = to.trim();
    if (!EMAIL_PATTERN.test(email)) {
      setFieldError('Tulis alamat email pelanggan yang valid.');
      return;
    }
    setFieldError(undefined);
    try {
      const trimmedNote = note.trim();
      const result = await send.mutateAsync({
        invoiceId,
        to: email,
        ...(trimmedNote === '' ? {} : { note: trimmedNote }),
      });
      setOpen(false);
      setNote('');
      toast(
        result.status === 'sent'
          ? `Nota ${invoiceNumber} dikirim ke ${result.to} dan ditandai Terkirim.`
          : `Nota ${invoiceNumber} dikirim ke ${result.to}.`,
        { variant: 'success' },
      );
    } catch (cause) {
      setServerError(
        cause instanceof Error
          ? cause.message
          : 'Nota belum terkirim. Coba lagi beberapa saat lagi.',
      );
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setOpen(true)}
        className="col-span-2 sm:col-span-1"
      >
        <Mail size={14} aria-hidden="true" />
        Email
      </Button>
      <Modal
        open={open}
        onClose={close}
        title="Kirim nota lewat email"
        size="md"
        actions={[
          { label: 'Batal', variant: 'secondary', onClick: close },
          {
            label: 'Kirim nota',
            variant: 'primary',
            loading: send.isPending,
            onClick: () => void submit(),
          },
        ]}
      >
        <div className="flex flex-col gap-4">
          {serverError && <Notice variant="danger">{serverError}</Notice>}

          <p className="text-sm text-muted">
            Pelanggan menerima nomor nota, total, dan tautan halaman tagihan. Berkas PDF tetap kamu
            lampirkan sendiri setelah nota dicetak.
          </p>

          <FieldShell label="Email pelanggan" htmlFor={emailIds.id} required error={fieldError}>
            <Input
              id={emailIds.id}
              type="email"
              value={to}
              placeholder="pelanggan@email.com"
              autoComplete="email"
              invalid={Boolean(fieldError)}
              onChange={(event) => {
                setTo(event.target.value);
                setFieldError(undefined);
              }}
            />
          </FieldShell>

          <FieldShell
            label="Pesan tambahan"
            htmlFor={noteIds.id}
            hint="Opsional. Muncul di badan email sebelum tautan tagihan."
          >
            <Textarea
              id={noteIds.id}
              rows={3}
              value={note}
              placeholder={
                customerName === ''
                  ? 'Terima kasih sudah memesan.'
                  : `Halo ${customerName}, terima kasih sudah memesan.`
              }
              onChange={(event) => setNote(event.target.value)}
            />
          </FieldShell>

          <p className="flex items-start gap-1.5 text-xs text-muted">
            <Send size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              Nota yang belum berstatus apa pun akan menjadi Terkirim setelah email berhasil
              dikirim. Mengirim email memakai halaman tagihan, jadi hanya tersedia di plan Pro.
            </span>
          </p>
        </div>
      </Modal>
    </>
  );
}
