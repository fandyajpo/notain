import { Permission } from 'appwrite';

/**
 * Both tables run with row security enabled and only grant `create` at the
 * table level, so every row must carry its own owner-only permissions.
 * Appwrite grants access when *either* level allows it, so create stays at the
 * table while read/update/delete are pinned to the creator. Rows reject a
 * `create` permission outright — only `read`, `update`, `delete` and `write`
 * are accepted here.
 */
export function ownerRowPermissions(ownerId: string): string[] {
  const role = `user:${ownerId}`;
  return [Permission.read(role), Permission.update(role), Permission.delete(role)];
}
