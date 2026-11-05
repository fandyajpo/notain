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
              title="Integrasi"
              description="Kunci API untuk menghubungkan aplikasi lain sedang disiapkan."
            />
            <ApiKeysPanel />
          </div>
        </AuthGate>
      </AppProviders>
    </IslandBoundary>
  );
}
