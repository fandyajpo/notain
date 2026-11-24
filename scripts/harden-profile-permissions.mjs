#!/usr/bin/env node
/**
 * Removes every session's direct write path to the `profiles` table, leaving
 * `PUT /api/profile` (and the API-key admin/checkout Functions) as the only
 * writers.
 *
 * Appwrite has no per-column permissions, so as long as a session can write its
 * own profile row it can write `plan` and `planExpiresAt` on it — the
 * client-side "never change the plan" guard in `saveProfile` is then the only
 * thing standing between a user and a forged paid plan. Two changes close it:
 *
 *   1. Drop the table-level `create("users")` permission. It was what let a
 *      brand-new account create its own row (with an arbitrary plan) before
 *      onboarding ever ran. The profile Function creates rows with the API key,
 *      which bypasses table permissions, so nothing the app does needs it.
 *   2. Rewrite each row's permissions to owner-read-only. Read stays because
 *      `getByOwner` is still a direct SDK read; update and delete go away, so
 *      an owner session can no longer PATCH the row around the Function.
 *
 * API-key writes (the profile Function, checkout plan flips, admin edits) bypass
 * row security, so all of those are unaffected.
 *
 * ---- RUN THIS ONLY AFTER THE PROFILE-FUNCTION DEPLOY IS GREEN ----
 * The currently deployed client still writes profile rows directly through the
 * SDK. Flip these permissions first and every settings save breaks for every
 * user until the new client ships. Correct order:
 *   1. push to `main`, wait for the Actions run to go green;
 *   2. confirm production serves the new build;
 *   3. run this script with `--yes`;
 *   4. re-probe: an owner-session PATCH of `plan` must answer 401/403, and an
 *      owner-session CREATE with `plan: "business"` must answer 403.
 *
 * Idempotent: re-running skips rows that are already read-only.
 *
 * Needs an API key with `collections.read`, `collections.write`,
 * `documents.read`, `documents.write`. Put it in `.env` as `APPWRITE_API_KEY`
 * (never commit it, never paste it in chat) and revoke it when you are done.
 *
 * Usage:
 *   npm run harden:profiles            # dry-run
 *   npm run harden:profiles -- --yes   # apply
 */

import {
  api,
  collectionPath,
  confirmed,
  databaseId,
  documentPath,
  endpoint,
  fail,
  listAllRows,
  projectId,
  requireApiKey,
  samePermissions,
} from './lib/appwrite-admin.mjs';

const SCOPES = ['collections.read', 'collections.write', 'documents.read', 'documents.write'];
const COLLECTION = 'profiles';

requireApiKey(SCOPES);

/** The only permission a hardened profile row keeps. */
function ownerRead(rowId) {
  return [`read("user:${rowId}")`];
}

console.log(`Target: ${endpoint}  project=${projectId}  database=${databaseId}\n`);
console.log(
  'Ingat: jalankan script ini HANYA setelah deploy `PUT /api/profile` hijau di production.\n',
);

try {
  // 1. Table-level: drop create("users") and make sure row security is on.
  const table = await api('GET', collectionPath(COLLECTION));
  const tablePermissions = table.$permissions ?? [];
  // With documentSecurity off, Appwrite ignores every row-level permission — a
  // row reset would silently protect nothing. `false` therefore needs the same
  // PUT as a non-empty permission list.
  // Read side is `rowSecurity`; `documentSecurity` is the write-side name.
  const docSecurityOff = (table.rowSecurity ?? table.documentSecurity) !== true;

  if (tablePermissions.length === 0 && !docSecurityOff) {
    console.log('  ✓ izin tabel sudah kosong, documentSecurity true');
  } else if (!confirmed) {
    if (tablePermissions.length > 0) {
      console.log(`  + hapus izin tabel: ${JSON.stringify(tablePermissions)}`);
    }
    if (docSecurityOff) {
      console.log('  + nyalakan documentSecurity (saat ini false — izin baris diabaikan)');
    }
  } else {
    // `documentSecurity` MUST be repeated explicitly: Appwrite's update endpoint
    // binds an *absent* field to its default (`false`), and with document
    // security off every row-level permission is ignored — the owner could no
    // longer read their own profile. The request key is `permissions` (the
    // `$permissions` spelling is the read-side name only).
    await api('PUT', collectionPath(COLLECTION), {
      documentSecurity: true,
      permissions: [],
    });
    const verify = await api('GET', collectionPath(COLLECTION));
    if ((verify.rowSecurity ?? verify.documentSecurity) !== true) {
      fail('documentSecurity tidak kembali true setelah PUT — periksa manual di Console.');
    }
    console.log('  ✔ izin tabel dikosongkan, documentSecurity true (diverifikasi)');
  }

  // 2. Row-level: owner-read-only on every existing row.
  const rows = await listAllRows(COLLECTION);
  console.log(`  ${rows.length} baris profil ditemukan`);

  let flipped = 0;
  for (const row of rows) {
    const expected = ownerRead(row.$id);
    if (samePermissions(row.$permissions, expected)) continue;
    if (!confirmed) {
      console.log(`  + ${row.$id}: ${JSON.stringify(row.$permissions ?? [])} → ${expected}`);
      flipped += 1;
      continue;
    }
    // Appwrite rejects a permissions-only update; re-sending the row's own name
    // is a no-op write that satisfies the "data required" check.
    await api('PATCH', documentPath(COLLECTION, row.$id), {
      data: { name: row.name ?? '' },
      permissions: expected,
    });
    console.log(`  ✔ ${row.$id}`);
    flipped += 1;
  }

  if (!confirmed) {
    console.log(
      `\nDry-run saja: ${flipped} baris akan diubah. Ulangi dengan \`--yes\` untuk menerapkan.`,
    );
    process.exit(0);
  }
  console.log(`\n${flipped} baris diperbarui.`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('401') || message.includes('403')) {
    fail(`API key ditolak (${message.slice(0, 120)}…).\n  Pastikan scope: ${SCOPES.join(', ')}`);
  }
  fail(message);
}

console.log('\nSelesai. Sekarang cabut (revoke) API key-nya di Console → Settings → API keys.');
