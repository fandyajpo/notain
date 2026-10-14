import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listAdminUsers, updateAdminUser, type AdminUserUpdate } from '../../../app/admin';
import { getTeams } from '../../../appwrite/client';
import { queryPolicy } from '../policies';
import { queryKeys } from '../keys';

/**
 * Admin user list. Cached so revisiting the admin page does not re-fetch;
 * the "Muat ulang" button invalidates explicitly.
 */
export function useAdminUsers() {
  return useQuery({
    queryKey: queryKeys.adminUsers,
    queryFn: () => listAdminUsers(),
    ...queryPolicy('adminUsers'),
  });
}

/**
 * Update a user's full profile (name, business, contact, plan, expiry). On
 * success the list is invalidated so the table reflects the change without a
 * manual reload.
 */
export function useUpdateAdminUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (update: AdminUserUpdate) => updateAdminUser(update),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers });
    },
  });
}

/**
 * Whether the signed-in user is a member of the `admins` team.
 *
 * Succeeds for members (they can list the team) and fails with 403/404 for
 * non-members, which we treat as `false` rather than surfacing an error.
 */
export function useAdminMembership(enabled = true) {
  return useQuery({
    queryKey: queryKeys.adminMembership,
    queryFn: async () => {
      await getTeams().listMemberships({ teamId: 'admins' });
      return true;
    },
    enabled,
    retry: false,
    ...queryPolicy('adminMembership'),
  });
}
