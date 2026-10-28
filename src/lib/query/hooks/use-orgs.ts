import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptPendingInvites,
  createOrg,
  deleteOrgCascade,
  inviteOrgMember,
  listOrgMembers,
  listOrgs,
  removeOrgMember,
  renameOrg,
  setOrgBusinessType,
  type OrgView,
  type PendingInvite,
} from '../../../app/orgs';
import { getActiveOrgId, setActiveOrgId } from '../../../app/active-org';
import { queryPolicy } from '../policies';
import { queryKeys } from '../keys';

/**
 * React half of the organization surface.
 *
 * Two families:
 * - the ORG LIST (`useOrgs`), which is user-scoped — it feeds the org gate
 *   and the switcher, and is refetched when the selection changes (the gate's
 *   reset), which doubles as validation that the switch target still exists;
 * - one org's MEMBERS, keyed by org id so switching workspaces can never
 *   paint another org's people into the members table.
 *
 * Every mutation invalidates exactly what it can have changed: invites and
 * removals touch the member list, and anything that changes the *set* of orgs
 * a user belongs to (create, accept, delete) also refreshes the list the gate
 * decides from.
 */

/** Every organization the signed-in account belongs to, plus pending invites. */
export function useOrgs(enabled = true) {
  return useQuery({
    queryKey: queryKeys.orgs,
    queryFn: () => listOrgs(),
    enabled,
    ...queryPolicy('orgs'),
  });
}

/** Active members + pending invitations of one organization. */
export function useOrgMembers(orgId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.orgMembers(orgId ?? ''),
    queryFn: () => listOrgMembers(orgId ?? ''),
    enabled: Boolean(orgId) && enabled,
    ...queryPolicy('orgs'),
  });
}

/**
 * Accepts every invitation addressed to this account's email. Fire-and-forget
 * from the org gate: a failure here must not block the app (the invites are
 * simply still pending), which is why no UI couples to this mutation.
 */
export function useAcceptPendingInvites() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => acceptPendingInvites(),
    onSuccess: (accepted) => {
      // Only a real flip changes the org set; a normal load answers `[]`.
      if (accepted.length > 0) void queryClient.invalidateQueries({ queryKey: queryKeys.orgs });
    },
    // A rate-limited or offline accept is retried by the next page load —
    // never worth surfacing an error over an automatic background action.
    retry: false,
  });
}

/** Creates an organization and makes it the active one immediately. */
export function useCreateOrg() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name }: { name: string }) => createOrg(name),
    onSuccess: (org) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orgs });
      // The gate's switch handler clears per-org caches once this lands —
      // the new org's profile/stats/invoices must never show the old org's.
      setActiveOrgId(org.id);
    },
  });
}

/**
 * Renames one org (owner only).
 *
 * The org list cache is patched in place on success — the sidebar switcher
 * reads that same shared cache, so the new name is on screen synchronously,
 * with no refetch round-trip and no full-page rerender. The invalidation
 * that follows reconciles with the server and refreshes the profile, whose
 * `businessName` (invoice header, public page) is projected from the org row.
 */
export function useRenameOrg(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => renameOrg(orgId, name),
    onSuccess: (_result, name) => {
      queryClient.setQueryData<{ orgs: OrgView[]; pending: PendingInvite[] }>(
        queryKeys.orgs,
        (current) =>
          current
            ? {
                ...current,
                orgs: current.orgs.map((org) =>
                  org.id === orgId ? { ...org, name } : org,
                ),
              }
            : current,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.orgs });
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
    },
  });
}

/**
 * Sets (or clears) the active org's business type. Invalidates the org list
 * (the switcher's data) and the profile, whose `businessType` is projected
 * from the org row.
 */
export function useSetOrgBusinessType(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (businessType: string | null) => setOrgBusinessType(orgId, businessType),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orgs });
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
    },
  });
}

/**
 * Drives the server's budgeted cascade to completion, then drops every cache
 * that could still hold the dead org's data and falls back to the org list.
 */
export function useDeleteOrg() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orgId: string) => deleteOrgCascade(orgId),
    onSuccess: (_data, orgId) => {
      if (getActiveOrgId() === orgId) setActiveOrgId(null);
      queryClient.clear();
    },
  });
}

/** Invites an email (owner only); the member list is where it appears. */
export function useInviteOrgMember(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => inviteOrgMember(orgId, email),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orgMembers(orgId) });
    },
  });
}

/** Removes a member, withdraws an invitation, or (self) leaves the org. */
export function useRemoveOrgMember(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: string) => removeOrgMember(orgId, membershipId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orgMembers(orgId) });
      // Leaving changes the org *set*, which the gate decides from.
      void queryClient.invalidateQueries({ queryKey: queryKeys.orgs });
    },
  });
}
