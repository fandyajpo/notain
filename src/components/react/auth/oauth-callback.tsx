import { useEffect, useState } from 'react';
import { completeGoogleOAuth } from '../../../app/auth';
import { Button } from '../ui/button';
import { Notice } from '../ui/notice';
import { LoadingState } from '../ui/state';

/**
 * The landing page of a Google round trip.
 *
 * Appwrite sends the browser here with `userId`/`secret`/`state` on the query
 * string — credentials for a session, not the session itself. This island
 * trades them in and then forwards to wherever the user was heading. Without
 * this step the token flow ends signed out, which is exactly why every Google
 * sign-in used to bounce off the dashboard back to `/login`.
 *
 * A missing or rejected `state` is a real failure (the cookie is gone, the link
 * came from another tab, or someone is trying a login-CSRF link), so it shows
 * the reason and offers the login page instead of quietly redirecting.
 */
export function OAuthCallback() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('userId') ?? '';
    const secret = params.get('secret') ?? '';
    const state = params.get('state') ?? '';

    if (!userId || !secret) {
      setError('Tautan masuk Google tidak lengkap. Coba masuk lagi dari halaman masuk.');
      return;
    }

    completeGoogleOAuth({ userId, secret, state })
      .then((target) => {
        if (!cancelled) window.location.replace(target);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          typeof cause === 'object' && cause !== null && 'message' in cause
            ? String((cause as { message: unknown }).message)
            : 'Masuk dengan Google gagal. Coba lagi.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <Notice variant="danger">{error}</Notice>
        <Button full size="lg" onClick={() => window.location.assign('/login')}>
          Kembali ke halaman masuk
        </Button>
      </div>
    );
  }

  return <LoadingState label="Menyelesaikan masuk dengan Google…" />;
}
