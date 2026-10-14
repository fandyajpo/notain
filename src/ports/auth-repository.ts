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
}
