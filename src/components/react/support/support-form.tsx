import { useState, type FormEvent } from 'react';
import { Loader2, Mail, Send, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/button';
import { FieldShell, useFieldIds } from '../ui/field';
import { Input } from '../ui/input';
import { Notice } from '../ui/notice';
import { Textarea } from '../ui/textarea';
import { Turnstile } from '../auth/turnstile';
import { TURNSTILE_SITE_KEY, turnstileEnabled } from '../../../lib/turnstile';
import { sendSupport, type SupportSource } from '../../../app/support';

type Draft = { name: string; email: string; subject: string; message: string };

const EMPTY: Draft = { name: '', email: '', subject: '', message: '' };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_MESSAGE = 10;

/**
 * The public support/contact form, shared by the landing page and
 * `/contact` — one component, two `source` values so the stored row says
 * where the message came from.
 *
 * Anonymous by contract (no session): validation runs here for speed, the
 * server re-runs it, and Turnstile rides along in the body when the widget
 * is configured. A success swaps the form for a confirmation so a double
 * submit cannot send twice.
 */
export function SupportForm({ source }: { source: SupportSource }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [token, setToken] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const nameIds = useFieldIds();
  const emailIds = useFieldIds();
  const subjectIds = useFieldIds();
  const messageIds = useFieldIds();

  const captcha = turnstileEnabled();

  function setField(key: keyof Draft, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError(null);

    const next: Partial<Record<keyof Draft, string>> = {};
    const name = draft.name.trim();
    const email = draft.email.trim();
    const subject = draft.subject.trim();
    const message = draft.message.trim();
    if (name === '') next.name = 'Nama wajib diisi.';
    if (email === '' || !EMAIL_PATTERN.test(email)) next.email = 'Email wajib diisi dengan format yang benar.';
    if (message.length < MIN_MESSAGE) next.message = `Pesan minimal ${MIN_MESSAGE} karakter.`;
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    if (captcha && !token) {
      setServerError('Selesaikan kotak verifikasi keamanan dulu.');
      return;
    }

    setBusy(true);
    try {
      await sendSupport({ name, email, subject, message, source, turnstileToken: captcha ? token : null });
      setDone(true);
      setDraft(EMPTY);
    } catch (cause) {
      setServerError(cause instanceof Error ? cause.message : 'Pesan gagal dikirim. Coba lagi.');
      // The token is single-use; a failed attempt spends it.
      if (captcha) setNonce((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Notice variant="success">
        <p className="font-medium">Pesan terkirim</p>
        <p className="mt-1">
          Terima kasih! Pesan kamu sudah kami terima dan akan dibalas lewat email dalam 1–2 hari
          kerja.
        </p>
        <button
          type="button"
          className="mt-2 font-medium text-foreground underline underline-offset-2"
          onClick={() => {
            setDone(false);
            setServerError(null);
          }}
        >
          Kirim pesan lain
        </button>
      </Notice>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-4">
      {serverError && <Notice variant="danger">{serverError}</Notice>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldShell label="Nama" htmlFor={nameIds.id} required error={errors.name}>
          <Input
            id={nameIds.id}
            type="text"
            value={draft.name}
            autoComplete="name"
            placeholder="Nama kamu"
            invalid={Boolean(errors.name)}
            onChange={(event) => setField('name', event.target.value)}
          />
        </FieldShell>

        <FieldShell label="Email" htmlFor={emailIds.id} required error={errors.email}>
          <Input
            id={emailIds.id}
            type="email"
            value={draft.email}
            autoComplete="email"
            placeholder="nama@email.com"
            invalid={Boolean(errors.email)}
            onChange={(event) => setField('email', event.target.value)}
          />
        </FieldShell>
      </div>

      <FieldShell label="Subjek" htmlFor={subjectIds.id} hint="Opsional.">
        <Input
          id={subjectIds.id}
          type="text"
          value={draft.subject}
          placeholder="Misal: pertanyaan soal plan Business"
          onChange={(event) => setField('subject', event.target.value)}
        />
      </FieldShell>

      <FieldShell label="Pesan" htmlFor={messageIds.id} required error={errors.message}>
        <Textarea
          id={messageIds.id}
          rows={5}
          value={draft.message}
          placeholder="Ceritakan pertanyaan atau kendala kamu…"
          invalid={Boolean(errors.message)}
          onChange={(event) => setField('message', event.target.value)}
        />
      </FieldShell>

      {captcha && (
        <div>
          <Turnstile key={nonce} siteKey={TURNSTILE_SITE_KEY} onToken={setToken} />
        </div>
      )}

      <div>
        <Button
          type="submit"
          variant="primary"
          loading={busy}
          disabled={captcha && !token}
        >
          {busy ? (
            <>
              <Loader2 size={15} className="animate-spin" aria-hidden /> Mengirim…
            </>
          ) : captcha ? (
            <>
              <ShieldCheck size={15} aria-hidden /> Kirim pesan
            </>
          ) : (
            <>
              <Send size={15} aria-hidden /> Kirim pesan
            </>
          )}
        </Button>
      </div>

      <p className="flex items-start gap-1.5 text-xs text-muted">
        <Mail size={13} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Kami balas lewat email dalam 1–2 hari kerja. Butuh jawaban cepat? Email langsung ke{' '}
          <a
            href="mailto:halo@notain.my.id"
            className="font-medium text-foreground underline underline-offset-2"
          >
            halo@notain.my.id
          </a>
          .
        </span>
      </p>
    </form>
  );
}
