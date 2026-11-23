#!/usr/bin/env node
/**
 * Creates the `password_resets` table if missing.
 *
 * One row per ACCOUNT (the row id is derived from the user id), holding:
 *   tokenHash (string 64, SHA-256 hex of the emailed token — the token itself
 *              is never stored, so a leaked table cannot be replayed),
 *   userId    (string 36, the Appwrite account the link resets),
 *   expiresAt (string 32, ISO-8601 — 30 minutes after the request),
 *   origin    (string 128, the site the link was requested from).
 *
 * Row permissions stay empty like `support` and `audit_logs`: only the Pages
 * Functions in `functions/api/mail/password-reset*` read or write these rows,
 * with the API key, and nothing in the browser can ever see one.
 *
 * The `byTokenHash` index is what makes redemption a lookup instead of a scan:
 * the confirm endpoint knows the token, not the account.
 *
 * Idempotent: re-running skips anything that already exists.
 *
 * Needs an API key (Settings → API keys) with:
 *   collections.read, collections.write, documents.read, documents.write
 *
 * Put the key in `.env` as `APPWRITE_API_KEY=` (git-ignored — never commit it,
 * never paste it in chat). Revoke the key when you are done.
 *
 * Usage:
 *   node scripts/ensure-password-resets.mjs            # dry-run
 *   node scripts/ensure-password-resets.mjs --yes      # apply
 */

const databaseId = process.env.PUBLIC_APPWRITE_DATABASE_ID ?? 'notain_db';
const endpoint = (
  process.env.PUBLIC_APPWRITE_ENDPOINT ?? 'https://sgp.cloud.appwrite.io/v1'
).replace(/\/+$/, '');
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID ?? '6aca66fb003071c0ef43';
const apiKey = (process.env.APPWRITE_API_KEY ?? '').trim();
const tableId = 'password_resets';

const STRING_ATTRIBUTES = [
  { key: 'tokenHash', size: 64 },
  { key: 'userId', size: 36 },
  { key: 'expiresAt', size: 32 },
  { key: 'origin', size: 128 },
];

const INDEX = { key: 'byTokenHash', type: 'key', attributes: ['tokenHash'], orders: ['asc'] };

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
    const options = {
      method,
      headers: {
        'X-Appwrite-Project': projectId,
        'X-Appwrite-Key': apiKey,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
    };
    // A GET carries no payload — Appwrite reads path + query only, and fetch
    // rejects a body on GET in some runtimes.
    if (method !== 'GET' && body) options.body = JSON.stringify(body);
    const response = await fetch(`${endpoint}${path}`, options);

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

/** Appwrite reports either `columns` or the legacy `attributes`; accept both. */
function fieldsOf(collection) {
  return collection?.columns ?? collection?.attributes ?? [];
}

console.log(`Target: ${endpoint}  project=${projectId}  database=${databaseId}\n`);

try {
  // 1. The table itself.
  let table;
  try {
    table = await api('GET', `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}`);
    console.log(`  ✓ tabel \`${tableId}\` sudah ada`);
  } catch (error) {
    if (!String(error.message).includes('404')) throw error;
    if (!confirmed) {
      console.log(`  + buat tabel \`${tableId}\` (rowSecurity, permissions kosong)`);
      for (const attribute of STRING_ATTRIBUTES) {
        console.log(
          `  + buat kolom \`${tableId}.${attribute.key}\` (string, size ${attribute.size})`,
        );
      }
      console.log(`  + buat index \`${tableId}.${INDEX.key}\` (${INDEX.attributes.join(', ')})`);
      console.log('\nDry-run saja. Ulangi dengan `--yes` untuk benar-benar menerapkan.');
      process.exit(0);
    }
    table = await api('POST', `/databases/${databaseId}/collections`, {
      collectionId: tableId,
      name: 'Password resets',
      // No permission for any client: the token hash is a credential, and only
      // the API key (which bypasses rowSecurity) may touch these rows.
      permissions: [],
      rowSecurity: true,
    });
    console.log(`  ✔ tabel \`${tableId}\` dibuat`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  // 2. Attributes.
  table =
    table ??
    (await api('GET', `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}`));
  const present = new Set(fieldsOf(table).map((field) => field.key));

  for (const attribute of STRING_ATTRIBUTES) {
    if (present.has(attribute.key)) {
      console.log(`  ✓ kolom \`${tableId}.${attribute.key}\` sudah ada`);
      continue;
    }
    if (!confirmed) {
      console.log(
        `  + buat kolom \`${tableId}.${attribute.key}\` (string, size ${attribute.size})`,
      );
      continue;
    }
    await api(
      'POST',
      `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}/attributes/string`,
      { key: attribute.key, size: attribute.size, required: false, array: false },
    );
    console.log(`  ✔ kolom \`${tableId}.${attribute.key}\` dibuat`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  // 3. The redemption lookup index.
  const freshTable = await api(
    'GET',
    `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}`,
  );
  const indexes = new Set((freshTable?.indexes ?? []).map((index) => index.key));
  if (indexes.has(INDEX.key)) {
    console.log(`  ✓ index \`${tableId}.${INDEX.key}\` sudah ada`);
  } else if (!confirmed) {
    console.log(`  + buat index \`${tableId}.${INDEX.key}\` (${INDEX.attributes.join(', ')})`);
  } else {
    await api(
      'POST',
      `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}/indexes`,
      INDEX,
    );
    console.log(`  ✔ index \`${tableId}.${INDEX.key}\` dibuat`);
  }

  if (!confirmed) {
    console.log('\nDry-run saja. Ulangi dengan `--yes` untuk benar-benar menerapkan.');
    process.exit(0);
  }
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
