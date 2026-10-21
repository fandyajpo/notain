import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAdminInvoice,
  createAdminTemplate,
  deleteAdminContent,
  getAdminInvoiceDetail,
  getAdminNextInvoiceNumber,
  getAdminTemplateDetail,
  getAdminUserDrilldown,
  listAdminAudit,
  listAdminInvoices,
  listAdminSupport,
  listAdminTemplates,
  listAdminUsers,
  setAdminSupportSolved,
  setAdminUserStatus,
  updateAdminInvoiceContent,
  updateAdminTemplateContent,
  updateAdminUser,
  type AdminContentResource,
  type AdminDrillResource,
  type AdminUserUpdate,
} from '../../../app/admin';
import type { InvoiceDraft, InvoiceStatus } from '../../../core/invoice/model';
import type { AuthoredTemplate } from '../../../core/template/model';
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
      // The Detail modal has its own per-user cache — without this it keeps
      // showing the plan/status from before the edit for up to a minute.
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUserDrilldownAll });
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUserDrilldownAll });
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

/** Newest-first page of public support messages (cursor-paginated). */
export function useAdminSupport() {
  return useInfiniteQuery({
    queryKey: queryKeys.adminSupport,
    queryFn: ({ pageParam }) => listAdminSupport({ cursorAfter: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    ...queryPolicy('adminSupport'),
  });
}

/** Marks a support message solved, or reopens a solved one. */
export function useSetAdminSupportSolved() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; solved: boolean }) =>
      setAdminSupportSolved(input.id, input.solved),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminSupport });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminAudit });
    },
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

// --- "Konten pengguna" tab ---------------------------------------------------

/**
 * One selected user's templates. Keyed by the selected user *and* the
 * resource, so picking another user can never paint the previous user's rows.
 */
export function useAdminTemplates(userId: string | null) {
  return useInfiniteQuery({
    queryKey: queryKeys.adminContent(userId ?? '', 'templates'),
    queryFn: ({ pageParam }) => listAdminTemplates(userId as string, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(userId),
    ...queryPolicy('adminUsers'),
  });
}

/** One selected user's invoices. Same caching shape as {@link useAdminTemplates}. */
export function useAdminInvoices(userId: string | null) {
  return useInfiniteQuery({
    queryKey: queryKeys.adminContent(userId ?? '', 'invoices'),
    queryFn: ({ pageParam }) => listAdminInvoices(userId as string, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(userId),
    ...queryPolicy('adminUsers'),
  });
}

/**
 * One template's full design for the edit dialog. Off until a dialog asks for
 * it, and keyed per row so the cached design is reused next time the same
 * template is opened.
 */
export function useAdminTemplateDetail(userId: string | null, rowId: string | null) {
  return useQuery({
    queryKey: queryKeys.adminContentDetail(userId ?? '', 'templates', rowId ?? ''),
    queryFn: () => getAdminTemplateDetail(userId as string, rowId as string),
    enabled: Boolean(userId && rowId),
    ...queryPolicy('adminUsers'),
  });
}

/** One invoice's full content for the edit dialog. See {@link useAdminTemplateDetail}. */
export function useAdminInvoiceDetail(userId: string | null, rowId: string | null) {
  return useQuery({
    queryKey: queryKeys.adminContentDetail(userId ?? '', 'invoices', rowId ?? ''),
    queryFn: () => getAdminInvoiceDetail(userId as string, rowId as string),
    enabled: Boolean(userId && rowId),
    ...queryPolicy('adminUsers'),
  });
}

/**
 * The next free invoice number for the create dialog. Off while a dialog is
 * not asking for one (`userId: null`), and refreshed by any content write —
 * the key sits under the shared `admin-content` prefix.
 */
export function useAdminNextInvoiceNumber(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.adminContentNextNumber(userId ?? ''),
    queryFn: () => getAdminNextInvoiceNumber(userId as string),
    enabled: Boolean(userId),
    ...queryPolicy('adminUsers'),
  });
}

/**
 * Shared post-write refresh: the affected user's content list and the action
 * log both move (every write there lands in the audit trail), while the admin
 * user list itself only changes when a profile or account status changes.
 */
function useAdminContentRefresh() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminContentAll });
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminAudit });
  };
}

/** Copies a built-in design into the selected user's template library. */
export function useCreateAdminTemplate() {
  const refresh = useAdminContentRefresh();
  return useMutation({
    mutationFn: (input: { userId: string; name: string; base: 'classic' | 'minimal' | 'modern' }) =>
      createAdminTemplate(input),
    onSuccess: refresh,
  });
}

/** Saves a template's whole design for the selected user. */
export function useUpdateAdminTemplate() {
  const refresh = useAdminContentRefresh();
  return useMutation({
    mutationFn: (input: {
      userId: string;
      rowId: string;
      template: AuthoredTemplate;
      /** The `updatedAt` the dialog opened with; the server 409s on a mismatch. */
      expectedUpdatedAt?: string;
    }) => updateAdminTemplateContent(input),
    onSuccess: refresh,
  });
}

/** Creates a full invoice for the selected user from a validated draft. */
export function useCreateAdminInvoice() {
  const refresh = useAdminContentRefresh();
  return useMutation({
    mutationFn: (input: { userId: string; draft: InvoiceDraft }) => createAdminInvoice(input),
    onSuccess: refresh,
  });
}

/**
 * Saves one of the selected user's invoices: the full draft for the content
 * columns, plus the optional status change that the server checks against the
 * forward-only lifecycle.
 */
export function useUpdateAdminInvoice() {
  const refresh = useAdminContentRefresh();
  return useMutation({
    mutationFn: (input: {
      userId: string;
      rowId: string;
      draft: InvoiceDraft;
      status: InvoiceStatus | null;
      /** Fingerprint of the content the dialog loaded; the server 409s on a mismatch. */
      expectedContentHash?: string;
    }) => updateAdminInvoiceContent(input),
    onSuccess: refresh,
  });
}

/** Deletes one template or invoice belonging to the selected user. */
export function useDeleteAdminContent() {
  const refresh = useAdminContentRefresh();
  return useMutation({
    mutationFn: (input: { userId: string; resource: AdminContentResource; rowId: string }) =>
      deleteAdminContent(input),
    onSuccess: refresh,
  });
}
