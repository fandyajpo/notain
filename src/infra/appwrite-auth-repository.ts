import { AppwriteException, ID } from 'appwrite';
import type {
  AuthRepository,
  CredentialsWithEmail,
  RecoveryCompletion,
  SessionUser,
  SignUpInput,
} from '../ports/auth-repository';
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
        name: input.name,
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
