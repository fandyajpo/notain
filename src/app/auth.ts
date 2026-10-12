import { container } from '../infra/container';
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
  await container.auth.signOut();
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
