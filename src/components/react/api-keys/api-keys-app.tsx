import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { IslandBoundary } from '../ui/island-boundary';
import { PageHeader } from '../ui/page-header';
import { ApiKeysPanel } from './api-keys-panel';

export function ApiKeysApp() {
  return (
    <IslandBoundary>
      <AppProviders>
        <AuthGate>
          <div className="flex flex-col gap-6">
            <PageHeader
              title="Integration"
              description="Buat dan atur kunci akses API untuk integrasi kamu."
            />
            <ApiKeysPanel />
          </div>
        </AuthGate>
      </AppProviders>
    </IslandBoundary>
  );
}
