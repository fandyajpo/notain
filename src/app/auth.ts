import { container } from '../infra/container';
import { toAppError } from '../appwrite/errors';
import { ERROR_CODES } from '../core/shared/errors';
import type {
  CredentialsWithEmail,
  RecoveryCompletion,
  SessionUser,
  SignUpInput,
} from '../ports/auth-repository';
import { forgetSession, rememberSession } from './session';

export async function signIn(input: CredentialsWithEmail): Promise<SessionUser> {
  const user = await container.auth.signIn(input);
  return rememberSession(user);
}

export async function signUp(input: SignUpInput): Promise<SessionUser> {
  const user = await container.auth.signUp(input);
  return rememberSession(user);
}

export async function signOut(): Promise<void> {
  try {
    await container.auth.signOut();
  } catch (error) {
    // A blocked account cannot end its own session server-side — Appwrite
    // rejects every request from it — and an already-gone session is a
    // no-op. Both are fine to sign out of locally; anything else keeps the
    // local session so the user does not silently "log out" over a blip.
    const code = toAppError(error).code;
    if (code !== ERROR_CODES.UNAUTHENTICATED && code !== ERROR_CODES.SUSPENDED) throw error;
  }
  forgetSession();
}

/** Emails the reset link. Never reveals whether the email is registered. */
export async function createRecovery(email: string): Promise<void> {
  await container.auth.createRecovery(email.trim());
}

/** Applies the new password from the emailed link's `userId`/`secret`. */
export async function completeRecovery(input: RecoveryCompletion): Promise<void> {
  await container.auth.completeRecovery(input);
}
