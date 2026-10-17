import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getAdminUserDrilldown,
  listAdminAudit,
  listAdminUsers,
  setAdminUserStatus,
  updateAdminUser,
  type AdminDrillResource,
  type AdminUserUpdate,
} from '../../../app/admin';
import { getTeams } from '../../../appwrite/client';
import { queryPolicy } from '../policies';
import { queryKeys } from '../keys';

/**
 * Admin user list. Cursor-paginated ("Muat lebih banyak"), cached so
 * revisiting the admin page does not re-fetch; the "Muat ulang" button
 * invalidates explicitly.
 */
export function useAdminUsers() {
  return useInfiniteQuery({
    queryKey: queryKeys.adminUsers,
    queryFn: ({ pageParam }) => listAdminUsers({ cursorAfter: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminAudit });
    },
  });
}

/** Suspend (block) or re-activate a user's account. */
export function useSetAdminUserStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; action: 'suspend' | 'unsuspend' }) =>
      setAdminUserStatus(input.userId, input.action),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminAudit });
    },
  });
}

/** Newest-first page of admin action logs (cursor-paginated). */
export function useAdminAudit() {
  return useInfiniteQuery({
    queryKey: queryKeys.adminAudit,
    queryFn: ({ pageParam }) => listAdminAudit({ cursorAfter: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    ...queryPolicy('adminAudit'),
  });
}

/** Read-only drill-down into one user's data, fetched only while the modal is open. */
export function useAdminUserDrilldown(
  userId: string | null,
  resource: AdminDrillResource,
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.adminUserDrilldown(userId ?? ''), resource],
    queryFn: ({ pageParam }) =>
      getAdminUserDrilldown(userId as string, resource, { cursorAfter: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      'nextCursor' in lastPage && lastPage.nextCursor ? lastPage.nextCursor : undefined,
    enabled: Boolean(userId) && enabled,
    ...queryPolicy('adminUsers'),
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
