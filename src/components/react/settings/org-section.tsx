import { useSyncExternalStore, useState, type SyntheticEvent } from 'react';
import { Trash2, UserPlus } from 'lucide-react';
import { getActiveOrgId, subscribeActiveOrg } from '../../../app/active-org';
import { isAppError } from '../../../core/shared/errors';
import {
  useCreateOrg,
  useDeleteOrg,
  useInviteOrgMember,
  useOrgMembers,
  useOrgs,
  useRemoveOrgMember,
  useRenameOrg,
} from '../../../lib/query/hooks/use-orgs';
import { toast } from '../../../lib/ui/toast';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { FieldShell, useFieldIds } from '../ui/field';
import { Input } from '../ui/input';
import { ErrorState, LoadingState } from '../ui/state';

/**
 * `/settings → Organisasi`: everything one workspace can do to itself.
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
        </div>
      </Card>

      <MembersCard orgId={orgId} isOwner={isOwner} />

      {isOwner && <DangerZoneCard orgId={orgId} orgName={current.name} />}
    </>
  );
}

/** Owner-only "spin up another workspace" — switches to it on success. */
function NewOrgButton() {
  const create = useCreateOrg();
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={create.isPending}
      onClick={() => {
        const name = window.prompt('Nama organisasi baru:');
        if (name === null) return; // cancelled
        const trimmed = name.trim();
        if (trimmed === '') {
          toast('Nama organisasi wajib diisi.', { variant: 'error' });
          return;
        }
        create.mutate(
          { name: trimmed },
          {
            onSuccess: (org) => toast(`Organisasi "${org.name}" dibuat.`, { variant: 'success' }),
            onError: (error) =>
              toast(isAppError(error) ? error.message : 'Gagal membuat organisasi.', {
                variant: 'error',
              }),
          },
        );
      }}
    >
      Buat organisasi baru
    </Button>
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
