import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { currentSession } from '../../../app/session';
import { completeRecovery, createRecovery, signIn, signOut, signUp } from '../../../app/auth';
import { queryPolicy, shouldRetry } from '../policies';
import { adoptSession } from '../session-cache';
import { queryKeys } from '../keys';
import type {
  CredentialsWithEmail,
  RecoveryCompletion,
  SignUpInput,
} from '../../../ports/auth-repository';

export function useSession() {
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: () => currentSession(),
    ...queryPolicy('session'),
    // Retried only when the failure is transient. A 401 answers "signed out"
    // immediately, while a dropped connection gets the normal backoff instead
    // of dropping the user into an error state on the first blip.
    retry: shouldRetry,
  });
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CredentialsWithEmail) => signIn(input),
    onSuccess: (user) => {
      adoptSession(queryClient, user);
    },
  });
}

export function useSignUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SignUpInput) => signUp(input),
    onSuccess: (user) => {
      adoptSession(queryClient, user);
    },
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => signOut(),
    onSuccess: () => {
      adoptSession(queryClient, null);
    },
  });
}

export function useCreateRecovery() {
  return useMutation({
    mutationFn: (email: string) => createRecovery(email.trim()),
  });
}

export function useCompleteRecovery() {
  return useMutation({
    mutationFn: (input: RecoveryCompletion) => completeRecovery(input),
  });
}
