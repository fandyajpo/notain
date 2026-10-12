import type { ReactNode } from 'react';
import { ErrorBoundary } from './error-boundary';

type Props = { children: ReactNode };

/**
 * Root guard for a `client:only` island.
 *
 * These islands ship no server-rendered HTML, so if the component throws
 * before its first successful render there is nothing on screen at all — the
 * user gets a blank page with no way forward. This swaps in a message and a
 * reload instead.
 *
 * Deliberately avoids rendering any other app component in the fallback: the
 * error may well have come from one of them, and re-rendering it here would
 * throw again.
 */
export function IslandBoundary({ children }: Props) {
  return (
    <ErrorBoundary
      fallback={(error) => (
        <div
          role="alert"
          className="flex min-h-[50vh] flex-col items-center justify-center px-5 text-center"
        >
          <p className="text-base font-semibold">Halaman ini gagal dimuat</p>
          <p className="mt-2 max-w-sm text-sm text-muted">
            Muat ulang halaman untuk mencoba lagi. Data kamu tidak hilang.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-control bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 focus-ring"
          >
            Muat ulang
          </button>
          {import.meta.env.DEV && (
            <p className="mt-4 max-w-xl break-all text-xs text-danger" title={error.message}>
              {error.message}
            </p>
          )}
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
