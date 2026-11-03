import { useEffect, useState } from 'react';
import { toAppError } from '../../../app/errors';
import { useSaveUserIdentity, useUserIdentity } from '../../../lib/query/hooks/use-user-profile';
import { useSession } from '../../../lib/query/hooks/use-session';
import { toast } from '../../../lib/ui/toast';
import { Button } from '../ui/button';
import { FieldShell, useFieldIds } from '../ui/field';
import { Input } from '../ui/input';
import { Notice } from '../ui/notice';
import { LoadingState } from '../ui/state';

/**
 * "Kelola Profil" — the SHARED account identity (`userProfiles/<userId>`):
 * username and phone are editable and apply across every organization the
 * account owns or joins, including the no-org state (the endpoint is
 * session-gated rather than org-gated).
 *
 * The login email renders read-only from the session: it is owned by the
 * Appwrite account and no settings flow can modify it. What an invoice
 * PRINTS (business name, logo, header/footer, contact block) is the
 * organization's letterhead — edited in Kelola Organisasi, not here.
 */
const phonePattern = /^(?:\+?62|0)8\d{7,12}$/;

export function UserProfileEditor() {
  const { data: identity, isLoading, isError, refetch } = useUserIdentity();
  const { data: session } = useSession();
  const save = useSaveUserIdentity();
  const [serverError, setServerError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [hydrated, setHydrated] = useState(false);

  // Hydrate the inputs exactly once — a background refetch must never clobber
  // what the user is typing.
  useEffect(() => {
    if (!identity || hydrated) return;
    setUsername(identity.username);
    setPhone(identity.phone);
    setHydrated(true);
  }, [identity, hydrated]);

  const nameIds = useFieldIds();
  const phoneIds = useFieldIds();
  const emailIds = useFieldIds();

  if (isLoading) {
    return <LoadingState label="Memuat profil…" />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-danger">Profil gagal dimuat. Periksa koneksi internet kamu.</p>
        <Button variant="secondary" size="sm" onClick={() => void refetch()}>
          Coba lagi
        </Button>
      </div>
    );
  }

  const email = session?.email ?? '';
  const phoneError =
    phone !== '' && !phonePattern.test(phone)
      ? 'Masukkan nomor WhatsApp yang valid, contoh 081234567890.'
      : null;

  async function handleSave() {
    setServerError(null);
    if (username.trim().length === 0) {
      setServerError('Masukkan nama kamu terlebih dahulu.');
      return;
    }
    if (phoneError) {
      setServerError(phoneError);
      return;
    }
    try {
      await save.mutateAsync({ username: username.trim(), phone: phone.trim() });
      toast('Profil berhasil disimpan.', { variant: 'success' });
    } catch (error) {
      setServerError(toAppError(error).message);
    }
  }

  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void handleSave();
      }}
    >
      {serverError && <Notice variant="danger">{serverError}</Notice>}

      <FieldShell
        label="Email login"
        htmlFor={emailIds.id}
        hint="Email login kamu — terkunci ke akun Appwrite dan tidak bisa diubah dari sini."
      >
        <Input id={emailIds.id} type="email" value={email} readOnly className="text-muted" />
      </FieldShell>

      <FieldShell label="Nama pengguna" htmlFor={nameIds.id} required>
        <Input
          id={nameIds.id}
          value={username}
          placeholder="Fandy Ahmad"
          autoComplete="name"
          onChange={(event) => setUsername(event.target.value)}
        />
      </FieldShell>

      <FieldShell
        label="Nomor WhatsApp (opsional)"
        htmlFor={phoneIds.id}
        hint="Identitas akun — dipakai di seluruh organisasi, bukan hanya satu workspace."
        error={phoneError ?? undefined}
      >
        <Input
          id={phoneIds.id}
          inputMode="tel"
          value={phone}
          placeholder="081234567890"
          autoComplete="tel"
          invalid={Boolean(phoneError)}
          aria-invalid={phoneError ? 'true' : undefined}
          onChange={(event) => setPhone(event.target.value)}
        />
      </FieldShell>

      <div>
        <Button type="submit" size="lg" loading={save.isPending}>
          Simpan profil
        </Button>
      </div>
    </form>
  );
}
