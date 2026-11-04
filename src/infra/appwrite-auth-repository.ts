import { AppwriteException, ID, OAuthProvider } from 'appwrite';
import type {
  AuthRepository,
  CredentialsWithEmail,
  OAuthCompletion,
  OAuthRedirects,
  RecoveryCompletion,
  SessionUser,
  SignUpInput,
} from '../ports/auth-repository';
import { APPWRITE } from '../appwrite/config';
import { getAccount } from '../appwrite/client';
import { toAppError } from '../appwrite/errors';
import type { Models } from 'appwrite';

function toSessionUser(user: Models.User): SessionUser {
  return { id: user.$id, email: user.email, name: user.name };
}

export class AppwriteAuthRepository implements AuthRepository {
  async getSession(): Promise<SessionUser | null> {
    try {
      return toSessionUser(await getAccount().get());
    } catch (error) {
      if (isMissingSession(error)) return null;
      throw toAppError(error);
    }
  }

  async signIn(input: CredentialsWithEmail): Promise<SessionUser> {
    try {
      await getAccount().createEmailPasswordSession(input);
      return toSessionUser(await getAccount().get());
    } catch (error) {
      throw toAppError(error);
    }
  }

  /**
   * Creates the account, then opens a session for it.
   *
   * When the account already exists we do not stop at reporting it. The most
   * common reasons are a user who registered earlier and drifted back to the
   * register form, or a double submit — and in both cases the password they
   * just typed is worth trying, because landing them signed in is what they
   * came for. A wrong password then falls back to the friendly
   * "email already registered" copy rather than a raw credential error.
   */
  async signUp(input: SignUpInput): Promise<SessionUser> {
    const account = getAccount();

    try {
      await account.create({
        userId: ID.unique(),
        email: input.email,
        password: input.password,
        // Appwrite rejects an empty name, so the email's local part is a
        // harmless placeholder until onboarding collects the real one.
        name: input.email.split('@')[0] || '-',
      });
    } catch (error) {
      if (!isEmailTaken(error)) throw toAppError(error);
      return signInExistingAccount(input, error);
    }

    try {
      await account.createEmailPasswordSession({
        email: input.email,
        password: input.password,
      });
      return toSessionUser(await account.get());
    } catch (error) {
      throw toAppError(error);
    }
  }

  async signOut(): Promise<void> {
    try {
      await getAccount().deleteSession({ sessionId: 'current' });
    } catch (error) {
      if (isMissingSession(error)) return;
      throw toAppError(error);
    }
  }

  /**
   * Sends the reset link. `window.location.origin` is the only sane base for a
   * static site — the same build can be opened from localhost or any deploy
   * host, so baking a domain into the source would break one of them.
   *
   * A "no such user" answer is swallowed and treated as success. The email the
   * user typed may be mistyped or belong to a neighbour, and either way the
   * right move is the same: tell them to check their inbox, and let a real
   * inbox prove whether the account exists.
   */
  async createRecovery(email: string): Promise<void> {
    const url = typeof window === 'undefined' ? '' : `${window.location.origin}/reset-password`;
    try {
      await getAccount().createRecovery({ email, url });
    } catch (error) {
      if (isMissingUser(error)) return;
      throw toAppError(error);
    }
  }

  async completeRecovery(input: RecoveryCompletion): Promise<void> {
    try {
      await getAccount().updateRecovery(input);
    } catch (error) {
      throw toAppError(error);
    }
  }

  /**
   * Hands the browser to an OAuth provider (OAuth2 token flow). This returns
   * immediately — the navigation leaves the page.
   *
   * The URL is assembled by hand for two reasons. The SDK's
   * `createOAuth2Token` has no `state` parameter, and without one the success
   * URL cannot prove which tab started the round trip. And the request must go
   * to Appwrite's own endpoint, not the same-origin proxy: Appwrite sets a
   * short-lived state cookie on its domain that its callback reads back, so
   * proxying the start would put that cookie somewhere the callback never looks.
   * A top-level navigation is never treated as a third-party request, so this
   * hop works in every browser.
   *
   * No Turnstile token is spent here: the round trip is a redirect, not a
   * session-creating call, and Appwrite rate-limits the OAuth endpoint itself.
   */
  startGoogleOAuth(redirects: OAuthRedirects): void {
    this.startProviderOAuth(OAuthProvider.Google, redirects);
  }

  /** Same round trip, through Discord. */
  startDiscordOAuth(redirects: OAuthRedirects): void {
    this.startProviderOAuth(OAuthProvider.Discord, redirects);
  }

  private startProviderOAuth(
    provider: OAuthProvider,
    { success, failure, state }: OAuthRedirects,
  ): void {
    const url = new URL(
      `${APPWRITE.endpoint}/account/tokens/oauth2/${encodeURIComponent(provider)}`,
    );
    url.searchParams.set('project', APPWRITE.projectId);
    url.searchParams.set('success', success);
    url.searchParams.set('failure', failure);
    url.searchParams.set('state', state);
    window.location.assign(url.toString());
  }

  /**
   * Trades the success URL's `userId`/`secret` for a session — for any OAuth
   * provider (Google, Discord, …).
   *
   * This is the half of the token flow the app was missing: Appwrite redirects
   * back with credentials, not a cookie, and the session only exists once the
   * client exchanges them. `createSession` answers with the session cookie,
   * which through the proxy is first-party and therefore actually stored.
   */
  async completeGoogleOAuth({ userId, secret }: OAuthCompletion): Promise<SessionUser> {
    try {
      await getAccount().createSession({ userId, secret });
      return toSessionUser(await getAccount().get());
    } catch (error) {
      throw toAppError(error);
    }
  }
}

/**
 * Signs in an account that refused to be created because it is already there.
 *
 * Only credential failures are re-mapped: a rate limit or a network error here
 * is real and must reach the user instead of being disguised as "already
 * registered", which would send them to a login page that will fail the same
 * way.
 */
async function signInExistingAccount(input: SignUpInput, cause: unknown): Promise<SessionUser> {
  try {
    await getAccount().createEmailPasswordSession({
      email: input.email,
      password: input.password,
    });
    return toSessionUser(await getAccount().get());
  } catch (error) {
    if (isInvalidCredentials(error)) throw toAppError(cause);
    throw toAppError(error);
  }
}

function errorType(error: unknown): string {
  return error instanceof AppwriteException ? (error.type ?? '') : '';
}

function isEmailTaken(error: unknown): boolean {
  return errorType(error) === 'user_already_exists';
}

function isInvalidCredentials(error: unknown): boolean {
  return errorType(error) === 'invalid_credentials';
}

function isMissingSession(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 401
  );
}

function isMissingUser(error: unknown): boolean {
  return errorType(error) === 'user_not_found';
}
