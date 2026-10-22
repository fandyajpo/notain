#!/usr/bin/env node
/**
 * Removes every session's direct write path to the `profiles` table, leaving
 * `PUT /api/profile` (and the API-key admin/checkout Functions) as the only
 * writers.
 *
 * Appwrite has no per-column permissions, so as long as a session can write
 * its own profile row it can write `plan` and `planExpiresAt` on it — the
 * client-side "never change the plan" guard in `saveProfile` is then the only
 * thing standing between a user and a forged paid plan. Two changes close it:
 *
 *   1. Drop the table-level `create("users")` permission. It was what let a
 *      brand-new account create its own row (with an arbitrary plan) before
 *      onboarding ever ran. The profile Function creates rows with the API
 *      key, which bypasses table permissions, so nothing the app does needs it.
 *   2. Rewrite each row's permissions to owner-read-only. Read stays because
 *      `getByOwner` is still a direct SDK read; update and delete go away,
 *      so an owner session can no longer PATCH the row around the Function.
 *
 * API-key writes (the profile Function, checkout plan flips, admin edits)
 * bypass row security, so all of those are unaffected.
 *
 * ---- RUN THIS ONLY AFTER THE PROFILE-FUNCTION DEPLOY IS GREEN ----
 * The currently deployed client still writes profile rows directly through
 * the SDK. Flip these permissions first and every settings save breaks for
 * every user until the new client ships. Correct order:
 *   1. push to `main`, wait for the Actions run to go green;
 *   2. confirm production serves the new build;
 *   3. run this script with `--yes`;
 *   4. re-probe: an owner-session PATCH of `plan` must answer 401/403, and an
 *      owner-session CREATE with `plan: "business"` must answer 403.
 *
 * Idempotent: re-running skips rows that are already read-only.
 *
 * Admin-only, so it needs an API key (Settings → API keys) with:
 *   collections.read, collections.write, documents.read, documents.write
 *
 * Put the key in `.env` as `APPWRITE_API_KEY=` (git-ignored — never commit it,
 * never paste it in chat). Revoke the key when you are done.
 *
 * Usage:
 *   node scripts/harden-profile-permissions.mjs            # dry-run
 *   node scripts/harden-profile-permissions.mjs --yes      # apply
 */

const databaseId = process.env.PUBLIC_APPWRITE_DATABASE_ID ?? 'notain_db';
const endpoint = (
  process.env.PUBLIC_APPWRITE_ENDPOINT ?? 'https://sgp.cloud.appwrite.io/v1'
).replace(/\/+$/, '');
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID ?? '6aca66fb003071c0ef43';
const apiKey = (process.env.APPWRITE_API_KEY ?? '').trim();
const collectionId = 'profiles';

/**
 * Page size for listing rows. The JSON-object query form is required by
 * Appwrite ≥2.4 (the legacy `limit(100)` string errors); 100 is the max.
 */
const LIST_LIMIT = 100;

const args = process.argv.slice(2);
const confirmed = args.includes('--yes');

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

if (!apiKey) {
  fail(
    'APPWRITE_API_KEY belum diisi.\n' +
      '  1. Appwrite Console → project ini → Settings → API keys → Create\n' +
      '  2. Centang scope: collections.read, collections.write, documents.read, documents.write\n' +
      '  3. Tambahkan ke .env: APPWRITE_API_KEY=key_...',
  );
}

async function api(method, path, body) {
  for (let attempt = 1; ; attempt += 1) {
    // `body` only for requests that carry one: a GET with a body (even
    // undefined) is what the fetch linter rejects.
    const response = await fetch(`${endpoint}${path}`, {
      method,
      headers: {
        'X-Appwrite-Project': projectId,
        'X-Appwrite-Key': apiKey,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (response.status === 429 && attempt < 6) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * attempt;
      console.log(`  rate-limited, tunggu ${Math.round(waitMs / 1000)}s…`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    if (!response.ok) {
      const text = (await response.text()).slice(0, 300).replace(/\s+/g, ' ');
      throw new Error(`${method} ${path} → ${response.status} ${text}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }
}

/** The only permission a hardened profile row keeps. */
function ownerRead(rowId) {
  return [`read("user:${rowId}")`];
}

function samePermissions(current, expected) {
  const byCodepoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const a = [...(current ?? [])].sort(byCodepoint);
  const b = [...expected].sort(byCodepoint);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Every row in the collection, following `cursorAfter` past the page limit. */
async function listRows() {
  const rows = [];
  let cursor = null;
  for (;;) {
    const params = new URLSearchParams();
    params.set('queries[0]', JSON.stringify({ method: 'limit', values: [LIST_LIMIT] }));
    if (cursor) params.set('cursorAfter', cursor);
    const page = await api(
      'GET',
      `/databases/${databaseId}/collections/${collectionId}/documents?${params}`,
    );
    rows.push(...page.documents);
    if (page.documents.length < LIST_LIMIT) break;
    cursor = page.documents.at(-1)?.$id;
    if (!cursor) break;
  }
  return rows;
}

console.log(`Target: ${endpoint}  project=${projectId}  database=${databaseId}\n`);
console.log(
  'Ingat: jalankan script ini HANYA setelah deploy `PUT /api/profile` hijau di production.\n',
);

try {
  // 1. Table-level: drop create("users").
  const table = await api('GET', `/databases/${databaseId}/collections/${collectionId}`);
  const tablePermissions = table.$permissions ?? [];
  // With documentSecurity off, Appwrite ignores every row-level permission —
  // a row reset would silently protect nothing. `false` therefore needs the
  // same PUT as a non-empty permission list.
  const docSecurityOff = table.documentSecurity !== true;
  const tableWouldChange = !confirmed && (tablePermissions.length > 0 || docSecurityOff);
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
    // `documentSecurity` MUST be repeated explicitly: Appwrite's update
    // endpoint binds an *absent* field to its default (`false`), and with
    // document security off every row-level permission is ignored — the owner
    // could no longer read their own profile. The request key is `permissions`
    // (the `$permissions` spelling is the read-side name only).
    await api('PUT', `/databases/${databaseId}/collections/${collectionId}`, {
      documentSecurity: true,
      permissions: [],
    });
    const verify = await api('GET', `/databases/${databaseId}/collections/${collectionId}`);
    if (verify.documentSecurity !== true) {
      fail('documentSecurity tidak kembali true setelah PUT — periksa manual di Console.');
    }
    console.log('  ✔ izin tabel dikosongkan, documentSecurity true (diverifikasi)');
  }

  // 2. Row-level: owner-read-only on every existing row.
  const rows = await listRows();
  console.log(`  ${rows.length} baris profil ditemukan`);
  let flipped = 0;
  for (const row of rows) {
    const expected = ownerRead(row.$id);
    if (samePermissions(row.$permissions, expected)) continue;
    if (!confirmed) {
      console.log(
        `  + ${row.$id}: ${JSON.stringify(row.$permissions ?? [])} → ${JSON.stringify(expected)}`,
      );
      flipped += 1;
      continue;
    }
    // Appwrite rejects a permissions-only update; re-sending the row's own
    // name is a no-op write that satisfies the "data required" check.
    await api(
      'PATCH',
      `/databases/${databaseId}/collections/${collectionId}/documents/${encodeURIComponent(row.$id)}`,
      { data: { name: row.name ?? '' }, permissions: expected },
    );
    console.log(`  ✔ ${row.$id}`);
    flipped += 1;
  }

  if (!confirmed) {
    const total = flipped + (tableWouldChange ? 1 : 0);
    console.log(
      `\nDry-run saja: ${total} perubahan akan diterapkan. Ulangi dengan \`--yes\` untuk menerapkan.`,
    );
    process.exit(0);
  }
  console.log(`\n${flipped} baris diperbarui.`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('401') || message.includes('403')) {
    fail(
      `API key ditolak (${message.slice(0, 120)}…).\n` +
        '  Pastikan key punya scope: collections.read, collections.write, documents.read, documents.write',
    );
  }
  fail(message);
}

console.log('\nSelesai. Sekarang cabut (revoke) API key-nya di Console → Settings → API keys.');
