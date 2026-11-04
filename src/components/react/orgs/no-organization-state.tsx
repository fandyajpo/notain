import { useState } from 'react';
import { useCreateOrg } from '../../../lib/query/hooks/use-orgs';
import { isAppError } from '../../../core/shared/errors';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/state';
import { FieldShell, useFieldIds } from '../ui/field';
import { Input } from '../ui/input';
import { Modal } from '../ui/modal';

export function NoOrganizationState() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <EmptyState
        title="Kamu belum punya usaha di Notain."
        description="Buat usaha untuk mulai memakai fitur ini."
        action={<Button onClick={() => setOpen(true)}>Buat usaha</Button>}
      />
      {open && <CreateOrganizationModal onClose={() => setOpen(false)} />}
    </>
  );
}

function CreateOrganizationModal({ onClose }: { onClose: () => void }) {
  const create = useCreateOrg();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const ids = useFieldIds('create-organization');

  async function submit(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 128) {
      setError('Isi nama usaha, maksimal 128 karakter.');
      return;
    }
    setError(undefined);
    try {
      await create.mutateAsync({ name: trimmed });
      onClose();
    } catch (cause) {
      setError(isAppError(cause) ? cause.message : 'Usaha belum bisa dibuat. Coba lagi ya.');
    }
  }

  return (
    <Modal
      open
      onClose={() => {
        if (!create.isPending) onClose();
      }}
      title="Buat usaha"
      actions={[
        { label: 'Batal', variant: 'secondary', onClick: onClose, disabled: create.isPending },
        { label: 'Buat usaha', onClick: () => void submit(), loading: create.isPending },
      ]}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FieldShell label="Nama usaha" htmlFor={ids.id} error={error} required>
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
