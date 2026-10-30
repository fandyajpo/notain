import { KeyRound } from 'lucide-react';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/state';

/**
 * API Keys page body — deliberately a stub. The feature is not built yet, so
 * the page says exactly that: one clear "segera hadir" state instead of an
 * empty table that reads like a broken feature or a teaser for a paid plan.
 */
export function ApiKeysPanel() {
  return (
    <EmptyState
      icon={KeyRound}
      title="API Keys segera hadir"
      description="Fitur API masih disiapkan. Nanti kamu bisa membuat key, mengatur scope, dan memantau pemakaian API langsung di halaman ini."
      action={
        <Button href="/developers" variant="secondary" size="sm">
          Pelajari rencana API
        </Button>
      }
    />
  );
}
