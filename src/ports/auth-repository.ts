/** Authenticated user as the application layer sees it. */
export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

export type CredentialsWithEmail = {
  email: string;
  password: string;
};

export type SignUpInput = CredentialsWithEmail;

/** Credentials for finishing a password reset off the emailed link. */
export type RecoveryCompletion = {
  userId: string;
  secret: string;
  password: string;
};

/**
 * Redirects for an OAuth provider round-trip. Both must be absolute URLs on
 * an origin registered as a platform in the Appwrite console — the server
 * refuses the redirect otherwise, before the provider is ever reached.
 */
export type OAuthRedirects = {
  /** Where the browser lands after a successful sign-in. */
  success: string;
  /** Where it lands when the provider refuses or the round-trip fails. */
  failure: string;
  /**
   * Opaque value echoed back on the success and failure URLs. The caller sends
   * it, Appwrite does not invent one, so the landing page can prove the round
   * trip it is finishing is the one this tab started (login CSRF).
   */
  state: string;
};

/** The one-time credentials Appwrite appends to the success URL. */
export type OAuthCompletion = {
  userId: string;
  secret: string;
};

/** Port through which the application layer reads and mutates the session. */
export interface AuthRepository {
  /** Resolves the current session, or `null` when signed out. */
  getSession(): Promise<SessionUser | null>;
  signIn(input: CredentialsWithEmail): Promise<SessionUser>;
  signUp(input: SignUpInput): Promise<SessionUser>;
  signOut(): Promise<void>;
  /**
   * Emails a password-reset link. Resolves even when the account does not
   * exist so the UI can show the same confirmation either way — telling an
   * attacker which emails are registered is an account-enumeration leak.
   */
  createRecovery(email: string): Promise<void>;
  /** Completes the reset with the `userId`/`secret` from the emailed link. */
  completeRecovery(input: RecoveryCompletion): Promise<void>;
  /**
   * Sends the browser to the OAuth provider ("Masuk dengan Google").
   * Full-page redirect: this resolves when the browser leaves, not with a
   * session.
   */
  startGoogleOAuth(redirects: OAuthRedirects): void;
  /**
   * Exchanges the `userId`/`secret` pair Appwrite puts on the success URL for a
   * real session. Without this the round trip ends signed out: Appwrite's token
   * flow hands the credentials to the landing page and expects the client to
   * trade them in, and nothing else does it.
   */
  completeGoogleOAuth(completion: OAuthCompletion): Promise<SessionUser>;
}
