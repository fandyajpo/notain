import { AuthForm } from './auth-form';
import { AppProviders } from '../providers';
import { IslandBoundary } from '../ui/island-boundary';

type Props = {
  mode: 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password';
  redirectTo?: string;
};

/** Standalone auth page island. Owns its own providers because Astro islands cannot nest. */
export function AuthPage({ mode, redirectTo }: Props) {
  return (
    <IslandBoundary>
      <AppProviders>
        <AuthForm mode={mode} redirectTo={redirectTo} />
      </AppProviders>
    </IslandBoundary>
  );
}
