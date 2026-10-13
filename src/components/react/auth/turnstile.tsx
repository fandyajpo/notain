import { useEffect, useRef, useState } from 'react';

/**
 * Cloudflare's official Turnstile widget, loaded straight from the source.
 *
 * No wrapper dependency: the script exposes a single global (`window.turnstile`)
 * with `render`/`remove`, which is small enough to drive directly. The widget
 * is rendered explicitly so the host element and lifetime stay under React's
 * control.
 */

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

/** Loaded once per page; every widget on it shares the same script tag. */
let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  scriptPromise ??= new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Turnstile hanya tersedia di browser.'));
      return;
    }
    if (window.turnstile) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Skrip Turnstile gagal dimuat.'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

type Props = {
  siteKey: string;
  /** Hands back the fresh token, or `null` once it expires or errors. */
  onToken: (token: string | null) => void;
};

export function Turnstile({ siteKey, onToken }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  // Keep the newest callback reachable from the widget without re-rendering it.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    // Disabled (no sitekey): never reach for the network.
    if (!siteKey) return;

    let widgetId: string | undefined;
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => {
            setFailed(true);
            onTokenRef.current(null);
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (widgetId !== undefined) window.turnstile?.remove(widgetId);
    };
  }, [siteKey]);

  if (!siteKey) return null;

  return (
    <div className="flex flex-col gap-2">
      <div ref={containerRef} aria-live="polite" />
      {failed && (
        <p role="alert" className="text-sm text-danger">
          Verifikasi keamanan gagal dimuat. Muat ulang halaman, atau coba lagi.
        </p>
      )}
    </div>
  );
}
