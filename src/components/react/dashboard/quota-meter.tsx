import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { getShellClient } from '../../../lib/query/shell-client';
import { useInvoiceQuota } from '../../../lib/query/hooks/use-invoices';
import { useSession } from '../../../lib/query/hooks/use-session';

/**
 * The free tier's monthly invoice allowance, parked in the sidebar next to
 * the nav — the place where "should I make one more invoice" is decided.
 *
 * It reads the same org-scoped query as the builder (one shared shell client),
 * so both surfaces agree and a save invalidates both. The sidebar lives outside
 * AuthGate, so it waits for the session and active organization before fetching.
 *
 * Paid plans (`remaining === null`) have no meter; a loading or error state is
 * shown instead of silently hiding the allowance while the query resolves.
 * The whole block carries `sidebar-label`, so the collapsed rail hides it too.
 */
export function QuotaMeter() {
  // Every island root supplies the shared shell client itself — the provider
  // does not travel across island boundaries, but the client is a singleton,
  // so this island and the builder's meter still read one cache.
  const [client] = useState(getShellClient);

  return (
    <QueryClientProvider client={client}>
      <QuotaMeterBody />
    </QueryClientProvider>
  );
}

function QuotaMeterBody() {
  const { data: session } = useSession();
  const { data, isError, isFetching, refetch } = useInvoiceQuota(Boolean(session));

  if (data?.remaining === null) return null;
  if (!data) {
    if (!isFetching && !isError) return null;
    return (
      <div
        data-tour="quota-meter"
        className="sidebar-label rounded-control bg-background p-3"
        aria-live="polite"
      >
        <div className="flex items-center justify-between gap-2 text-xs">
          <p className="text-muted">{isError ? 'Kuota nota gagal dimuat' : 'Memuat kuota nota…'}</p>
          {isError && (
            <button
              type="button"
              disabled={isFetching}
              onClick={() => void refetch()}
              className="font-medium text-accent hover:underline disabled:opacity-50"
            >
              Coba lagi
            </button>
          )}
        </div>
      </div>
    );
  }

  const used = Math.min(data.used, data.limit);
  const percent = Math.round((used / data.limit) * 100);
  const full = data.remaining === 0;

  return (
    <div data-tour="quota-meter" className="sidebar-label rounded-control bg-background p-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <p className="text-muted">Nota bulan ini</p>
        <p className="font-medium tabular-nums">
          {used} <span className="text-muted">/ {data.limit}</span>
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={data.limit}
        aria-valuenow={used}
        aria-label={`Nota dibuat bulan ini: ${used} dari ${data.limit}`}
        className="mt-2 h-1 overflow-hidden rounded-full bg-card"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${
            full ? 'bg-danger' : 'bg-accent'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted">
        {full ? (
          <>
            <span>Batas tercapai</span>
            <a href="/pricing" className="font-medium text-accent hover:underline">
              Lihat Pro
            </a>
          </>
        ) : (
          <>
            <span>{data.remaining} nota tersisa</span>
            <span>
              Batas baru{' '}
              {new Date(data.resetsAt).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'short',
              })}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
