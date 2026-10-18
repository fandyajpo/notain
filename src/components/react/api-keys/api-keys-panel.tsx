import { KeyRound } from 'lucide-react';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/state';
import { Notice } from '../ui/notice';

/**
 * API Keys page body — deliberately a stub. The Business plan's headline
 * benefit is API access (see the pricing card), so this panel sells the
 * upgrade instead of showing an empty table that reads like a broken feature.
 */
export function ApiKeysPanel() {
  return (
    <div className="flex flex-col gap-6">
      <Notice variant="accent">
        API Keys akan tersedia di plan <span className="font-medium">Business</span>. Kalau kamu
        butuh akses API untuk integrasi sendiri, intip dulu detailnya di halaman harga.
      </Notice>
      <EmptyState
        icon={KeyRound}
        title="API Keys belum tersedia"
        description="Fitur ini sedang disiapkan dan akan dibuka khusus untuk plan Business — buat key, atur scope, dan pantau pemakaian API kamu di sini."
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button href="/pricing" variant="primary" size="sm">
              Lihat plan Business
            </Button>
            <Button href="/developers" variant="secondary" size="sm">
              Halaman developer
            </Button>
          </div>
        }
      />
    </div>
  );
}
