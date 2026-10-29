import { useSyncExternalStore, useState, type SyntheticEvent } from 'react';
import { Check, Trash2, UserPlus } from 'lucide-react';
import { getActiveOrgId, setActiveOrgId, subscribeActiveOrg } from '../../../app/active-org';
import { beginOrgSwitch } from '../../../app/org-switch';
import type { OrgView } from '../../../app/orgs';
import { isAppError } from '../../../core/shared/errors';
import { isBusinessSubtypeSlug } from '../../../core/business/taxonomy';
import {
  useCreateOrg,
  useDeleteOrg,
  useInviteOrgMember,
  useOrgMembers,
  useOrgs,
  useRemoveOrgMember,
  useRenameOrg,
  useSetOrgBusinessType,
} from '../../../lib/query/hooks/use-orgs';
import { toast } from '../../../lib/ui/toast';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { FieldShell, useFieldIds } from '../ui/field';
import { Input } from '../ui/input';
import { Modal } from '../ui/modal';
import { ErrorState, LoadingState } from '../ui/state';
import { BusinessTypeField } from '../business/business-type-field';

/**
 * `/settings/organization` → Organisasi: everything one workspace can do to itself.
 *
 * Three cards, in the order the product needs them:
 *
 * 1. **Identity** — the active org's name (renameable by its owner) and the
 *    way to spin up an additional workspace. Members see the name read-only:
 *    the server answers 403 on their rename anyway, and a form that cannot
 *    succeed is worse than no form.
 * 2. **People** — the member list every member may read, plus the owner's
 *    invite/remove controls. The owner's own row has no remove button: a
 *    single-owner org whose owner left would be undeletable, which is exactly
 *    why the server refuses it too.
 * 3. **Danger zone** (owner only) — delete the organization and everything
 *    under it, through the server's budgeted cascade. The gate takes over the
 *    moment it finishes: losing the last org lands on the forced create
 *    screen, losing one of several falls back to the next.
 *
 * The section is keyed by the ACTIVE org (via `active-org`), so the switcher
 * in the sidebar and this card always describe the same workspace.
 */
export function OrgSection() {
  const activeOrgId = useSyncExternalStore(subscribeActiveOrg, getActiveOrgId, () => null);
  if (activeOrgId === null) return null;
  return <OrgSectionContent orgId={activeOrgId} />;
}

function OrgSectionContent({ orgId }: { orgId: string }) {
  const { data: orgs, isLoading: orgsLoading } = useOrgs();
  const current = orgs?.orgs.find((org) => org.id === orgId) ?? null;
  const isOwner = current?.isOwner ?? false;
  const setType = useSetOrgBusinessType(orgId);

  if (orgsLoading || !current) {
    return (
      <Card>
        <LoadingState label="Memuat organisasi…" />
      </Card>
    );
  }

  return (
    <>
      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <p className="font-medium">Organisasi aktif</p>
              <Badge variant={isOwner ? 'accent' : 'neutral'} size="sm">
                {isOwner ? 'Owner' : 'Anggota'}
              </Badge>
            </div>
            <NewOrgButton />
          </div>
          {isOwner ? (
            <RenameForm orgId={orgId} name={current.name} />
          ) : (
            <p className="text-sm text-muted">
              <span className="font-medium text-foreground">{current.name}</span> — hanya owner yang
              bisa mengganti nama.
            </p>
          )}
          <BusinessTypeField
            value={
              current.businessType && isBusinessSubtypeSlug(current.businessType)
                ? current.businessType
                : null
            }
            onChange={
              isOwner
                ? (slug) => {
                    void setType
                      .mutateAsync(slug)
                      .then(() => toast('Jenis bisnis disimpan.', { variant: 'success' }))
                      .catch((error) =>
                        toast(isAppError(error) ? error.message : 'Gagal menyimpan jenis bisnis.', {
                          variant: 'error',
                        }),
                      );
                  }
                : undefined
            }
            description="Dipakai untuk mengelompokkan template, mengisi contoh invoice, dan menentukan tampilan halaman usaha publik."
          />
        </div>
      </Card>

      <MembersCard orgId={orgId} isOwner={isOwner} />

      {isOwner && <DangerZoneCard orgId={orgId} orgName={current.name} />}
    </>
  );
}

/**
 * Owner-only "spin up another workspace", as a MODAL rather than the old
 * `window.prompt`: a native prompt has no label, no error slot, no pending
 * state and no success confirmation — it could only say "undefined" when the
 * server rejected the name.
 *
 * Three states, all inside the dialog:
 * - **form** — labelled input, Enter submits, validation and server errors
 *   land inline (`FieldShell` renders them as `role="alert"`), and the typed
 *   name survives a failure so the fix is a retry, not a retyping;
 * - **pending** — the primary action shows the spinner and dismissal is
 *   blocked, so a slow POST cannot be abandoned into a half-finished switch;
 * - **success** — a confirmation panel replaces the form before anything
 *   closes, naming the org that just landed in the sidebar dropdown (the
 *   mutation patches the shared cache, so it is already visible behind the
 *   dialog); its "Selesai" is what enters the new workspace, through the
 *   same blocking switch overlay the dropdown uses. Entering inside the
 *   mutation would unmount this panel mid-callback — the gate blanks its
 *   children while the active org changes — so the switch waits here.
 */
function NewOrgButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Buat organisasi baru
      </Button>
      {open && <NewOrgModal onClose={() => setOpen(false)} />}
    </>
  );
}

function NewOrgModal({ onClose }: { onClose: () => void }) {
  const create = useCreateOrg();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [created, setCreated] = useState<OrgView | null>(null);
  const ids = useFieldIds('new-org');

  // While the POST is in flight the dialog stays put: closing here would let
  // the switch underneath start with no way to show its result or its error.
  const handleClose = () => {
    if (!create.isPending) onClose();
  };

  /**
   * "Selesai": entering the new workspace is a real ORG SWITCH, so it runs
   * the same path the sidebar dropdown does — raise the blocking overlay
   * first, then flip the selection — and the gate's reset lands behind that
   * overlay instead of blanking the page under the user's cursor.
   */
  const enterCreated = () => {
    if (!created) return;
    const previous = getActiveOrgId();
    if (previous && previous !== created.id) beginOrgSwitch(previous, created.id, created.name);
    setActiveOrgId(created.id);
    onClose();
  };

  async function handleCreate(): Promise<void> {
    const trimmed = name.trim();
    if (trimmed === '') {
      setError('Nama organisasi wajib diisi.');
      return;
    }
    setError(undefined);
    try {
      // `switchTo: false` — the success panel below owns the switch, on
      // "Selesai". Flipping the selection inside the hook would unmount this
      // dialog mid-callback (the gate blanks its children while the active
      // org changes), so the confirmation would never be seen.
      const org = await create.mutateAsync({ name: trimmed, switchTo: false });
      setCreated(org);
      // The shared cache was patched by the hook, so the new org is already
      // in the sidebar dropdown behind this dialog — this is the confirmation.
      toast(`Organisasi "${org.name}" dibuat.`, { variant: 'success' });
    } catch (cause) {
      // The server's own copy (duplicate name, quota, 403) is more precise
      // than anything invented here.
      setError(isAppError(cause) ? cause.message : 'Gagal membuat organisasi. Coba lagi.');
    }
  }

  if (created) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Organisasi dibuat"
        actions={[{ label: 'Selesai', onClick: enterCreated }]}
      >
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-success-soft text-success">
            <Check size={22} aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-1">
            <p className="font-medium text-foreground">{created.name}</p>
            <p className="text-sm text-muted">
              Sudah muncul di daftar organisasi di sidebar. Tekan Selesai untuk masuk ke ruang kerja
              baru ini.
            </p>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={handleClose}
      title="Buat organisasi baru"
      ariaLabelledBy="new-org-title"
      actions={[
        { label: 'Batal', variant: 'secondary', onClick: handleClose, disabled: create.isPending },
        {
          label: 'Buat organisasi',
          onClick: () => void handleCreate(),
          loading: create.isPending,
        },
      ]}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleCreate();
        }}
      >
        <FieldShell
          label="Nama organisasi"
          htmlFor={ids.id}
          error={error}
          hint="Ruang kerja terpisah: data invoice, pelanggan, dan pembayarannya tidak bercampur dengan organisasi lain."
          required
        >
          <Input
            id={ids.id}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(undefined);
            }}
            placeholder="Bengkel Jaya"
            autoComplete="organization"
            maxLength={128}
            autoFocus
          />
        </FieldShell>
      </form>
    </Modal>
  );
}

function RenameForm({ orgId, name }: { orgId: string; name: string }) {
  const rename = useRenameOrg(orgId);
  const [value, setValue] = useState(name);
  const ids = useFieldIds(`rename-${orgId}`);

  async function handleRename(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === name) return;
    try {
      await rename.mutateAsync(trimmed);
      toast('Nama organisasi disimpan.', { variant: 'success' });
    } catch (error) {
      // Keep the typed value: the fix is usually a retry, not a retyping.
      toast(isAppError(error) ? error.message : 'Gagal menyimpan nama.', { variant: 'error' });
    }
  }

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(event) => void handleRename(event)}
    >
      <div className="flex-1">
        <FieldShell label="Nama organisasi" htmlFor={ids.id}>
          <Input
            id={ids.id}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={128}
            required
          />
        </FieldShell>
      </div>
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        loading={rename.isPending}
        disabled={value.trim() === '' || value.trim() === name}
      >
        Simpan
      </Button>
    </form>
  );
}

function MembersCard({ orgId, isOwner }: { orgId: string; isOwner: boolean }) {
  const members = useOrgMembers(orgId);

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <p className="font-medium">Anggota</p>

        {members.isLoading ? (
          <LoadingState label="Memuat anggota…" />
        ) : members.isError ? (
          <ErrorState
            title="Anggota gagal dimuat"
            message="Periksa koneksi internet kamu."
            action={
              <Button variant="secondary" size="sm" onClick={() => void members.refetch()}>
                Coba lagi
              </Button>
            }
          />
        ) : members.data && members.data.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border">
            {members.data.map((member) => (
              <MemberRow key={member.id} orgId={orgId} member={member} isOwner={isOwner} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Belum ada anggota.</p>
        )}

        {isOwner && <InviteForm orgId={orgId} />}
      </div>
    </Card>
  );
}

function MemberRow({
  orgId,
  member,
  isOwner,
}: {
  orgId: string;
  member: {
    id: string;
    email: string;
    role: string;
    status: string;
    isOwner: boolean;
    isMe: boolean;
  };
  isOwner: boolean;
}) {
  const remove = useRemoveOrgMember(orgId);
  const [confirming, setConfirming] = useState(false);

  // The owner's row is immovable (server-enforced), including by themselves:
  // an ownerless org would be undeletable. Leaving, for an owner, is the
  // delete flow below.
  const removable = isOwner && !member.isOwner;

  async function handleRemove(): Promise<void> {
    try {
      await remove.mutateAsync(member.id);
      setConfirming(false);
      toast(
        member.isMe
          ? 'Kamu keluar dari organisasi ini.'
          : member.status === 'pending'
            ? 'Undangan dibatalkan.'
            : 'Anggota dihapus dari organisasi.',
        { variant: 'success' },
      );
    } catch (error) {
      setConfirming(false);
      toast(isAppError(error) ? error.message : 'Gagal menghapus anggota.', { variant: 'error' });
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm text-foreground">{member.email}</span>
        {member.isOwner && (
          <Badge variant="accent" size="sm">
            Owner
          </Badge>
        )}
        {member.status === 'pending' && (
          <Badge variant="warning" size="sm">
            Tertunda
          </Badge>
        )}
        {member.isMe && !member.isOwner && (
          <Badge variant="neutral" size="sm">
            Kamu
          </Badge>
        )}
      </div>

      {removable &&
        (confirming ? (
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted">Hapus?</span>
            <Button
              variant="danger"
              size="sm"
              loading={remove.isPending}
              onClick={() => void handleRemove()}
            >
              Ya, hapus
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Batal
            </Button>
          </span>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            {member.isMe ? 'Keluar' : member.status === 'pending' ? 'Batalkan' : 'Hapus'}
          </Button>
        ))}
    </li>
  );
}

function InviteForm({ orgId }: { orgId: string }) {
  const invite = useInviteOrgMember(orgId);
  const [email, setEmail] = useState('');
  const ids = useFieldIds(`invite-${orgId}`);

  async function handleInvite(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (trimmed === '') return;
    try {
      await invite.mutateAsync(trimmed);
      setEmail('');
      // The invitee accepts automatically on their next sign-in — this is the
      // whole join flow from the owner's side.
      toast(`Undangan dikirim ke ${trimmed}.`, { variant: 'success' });
    } catch (error) {
      // 409 ("already a member") and validation errors carry the server's own
      // copy — the message is more precise than anything invented here.
      toast(isAppError(error) ? error.message : 'Undangan gagal dikirim.', { variant: 'error' });
    }
  }

  return (
    <form
      className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end"
      onSubmit={(event) => void handleInvite(event)}
    >
      <div className="flex-1">
        <FieldShell
          label="Undang lewat email"
          htmlFor={ids.id}
          hint="Undangan aktif otomatis saat pemilik email masuk ke Notain."
        >
          <Input
            id={ids.id}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nama@contoh.com"
            autoComplete="email"
            maxLength={320}
          />
        </FieldShell>
      </div>
      <Button type="submit" variant="secondary" size="sm" loading={invite.isPending}>
        <UserPlus size={15} aria-hidden="true" />
        Kirim undangan
      </Button>
    </form>
  );
}

function DangerZoneCard({ orgId, orgName }: { orgId: string; orgName: string }) {
  const remove = useDeleteOrg();
  const [confirming, setConfirming] = useState(false);

  return (
    <Card className="border-danger/25">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-danger">Hapus organisasi</p>
            <p className="text-sm text-muted">
              Menghapus <span className="font-medium text-foreground">{orgName}</span> ikut
              menghapus seluruh datanya — invoice, pelanggan, katalog, template, pembayaran, dan
              anggota. Tindakan ini tidak bisa dibatalkan.
            </p>
          </div>
          {!confirming && (
            <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
              <Trash2 size={15} aria-hidden="true" />
              Hapus
            </Button>
          )}
        </div>

        {confirming && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-danger/25 bg-danger-soft p-3">
            <p className="text-sm text-danger">
              Yakin menghapus <span className="font-semibold">{orgName}</span> beserta semua
              datanya? Tindakan ini tidak bisa dibatalkan.
            </p>
            <span className="flex items-center gap-2">
              <Button
                variant="danger"
                size="sm"
                loading={remove.isPending}
                onClick={() =>
                  remove.mutate(orgId, {
                    // Success: the gate already cleared the selection — if this
                    // was the last org the create screen appears; otherwise the
                    // next org becomes active.
                    onSuccess: () => toast('Organisasi dihapus.', { variant: 'success' }),
                    onError: (error) => {
                      // A partial wipe continues on the next attempt — the
                      // server answers done:false until it is finished.
                      toast(
                        isAppError(error) ? error.message : 'Penghapusan terhenti. Coba lagi.',
                        { variant: 'error' },
                      );
                      setConfirming(false);
                    },
                  })
                }
              >
                Ya, hapus permanen
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Batal
              </Button>
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
