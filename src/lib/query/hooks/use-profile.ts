import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getProfile, removeLogo, saveProfile, uploadLogo } from '../../../app/profile';
import { queryPolicy } from '../policies';
import { queryKeys } from '../keys';
import type { BusinessProfile } from '../../../core/profile/model';

export function useProfile(enabled = true) {
  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => getProfile(),
    enabled,
    ...queryPolicy('profile'),
  });
}

export function useSaveProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profile: BusinessProfile) => saveProfile(profile),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.profile, profile);
    },
  });
}

export function useUploadLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, current }: { file: File; current: BusinessProfile }) =>
      uploadLogo(file, current),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.profile, profile);
    },
  });
}

export function useRemoveLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (current: BusinessProfile) => removeLogo(current),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.profile, profile);
    },
  });
}
