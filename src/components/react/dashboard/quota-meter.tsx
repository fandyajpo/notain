import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { getShellClient } from '../../../lib/query/shell-client';
import { useInvoiceQuota } from '../../../lib/query/hooks/use-invoices';

/**
 * The free tier's monthly invoice allowance, parked in the sidebar next to
 * the nav — the place where "should I make one more invoice" is decided.
 *
 * It reads the SAME query the builder's meter uses (one shared shell client,
 * one `invoiceQuota` key), so the sidebar and the create page can never show
 * different numbers, and a save invalidates both.
 *
 * Rendering rules:
 * - Paid plans (`remaining === null`) render nothing: a meter with no ceiling
 *   is noise.
 * - A fetch error renders nothing either. The server owns the limit and
 *   enforces it with a 402 on create, so a widget that cannot know the number
 *   must not paint a guess.
 * - The whole block carries `sidebar-label`, so collapsing the rail to its
 *   icon column drops it along with the group labels.
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
  const { data, isError } = useInvoiceQuota();

  if (isError || !data || data.remaining === null) return null;

  const used = Math.min(data.used, data.limit);
  const percent = Math.round((used / data.limit) * 100);
  const full = data.remaining === 0;

  return (
    <div
      data-tour="quota-meter"
      className="sidebar-label rounded-control border border-border bg-background p-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
          Kuota bulan ini
        </p>
        <p className="text-xs font-medium tabular-nums">
          {used}/{data.limit}
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={data.limit}
        aria-valuenow={used}
        aria-label={`Kuota invoice bulan ini: ${used} dari ${data.limit}`}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-card"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${
            full ? 'bg-danger' : 'bg-accent'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="mt-2 text-xs leading-relaxed text-muted">
        {full ? (
          <>
            Kuota penuh bulan ini.{' '}
            <a href="/pricing" className="font-medium text-accent underline underline-offset-2">
              Upgrade ke Pro
            </a>
          </>
        ) : (
          <>
            {data.remaining} invoice tersisa — reset{' '}
            {new Date(data.resetsAt).toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'short',
            })}
          </>
        )}
      </p>
    </div>
  );
}
