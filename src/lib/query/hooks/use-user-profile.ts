import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getUserIdentity, saveUserIdentity } from '../../app/user-profile';
import type { UserIdentity, UserIdentityInput } from '../../app/user-profile';
import { queryPolicy } from '../policies';
import { queryKeys } from '../keys';

export function useUserIdentity(enabled = true) {
  return useQuery({
    queryKey: queryKeys.userProfile,
    queryFn: () => getUserIdentity(),
    enabled,
    ...queryPolicy('profile'),
  });
}

export function useSaveUserIdentity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UserIdentityInput) => saveUserIdentity(input),
    onSuccess: (identity: UserIdentity) => {
      queryClient.setQueryData(queryKeys.userProfile, identity);
    },
  });
}
