#!/usr/bin/env node
/**
 * Creates the `audit_logs` table (admin action log) if it is missing.
 *
 * One row per admin action:
 *   actorId (string 64), actorEmail (string 128), action (string 64),
 *   targetType (string 64), targetId (string 128), detail (string 2048,
 *   JSON/text), createdAt (string 32, ISO-8601) — plus the `byCreatedAt`
 *   key index on ["createdAt"] used by the newest-first listing.
 *
 * Row permissions: read("team:admins") only. Writes come from the admin
 * Pages Function via the API key (which bypasses row permissions), so no
 * client ever creates or edits a row.
 *
 * Idempotent: re-running skips anything that already exists.
 *
 * Admin-only, so it needs an API key (Settings → API keys) with:
 *   collections.read, collections.write, documents.write
 *
 * Put the key in `.env` as `APPWRITE_API_KEY=` (git-ignored — never commit it,
 * never paste it in chat). Revoke the key when you are done.
 *
 * Usage:
 *   node scripts/ensure-audit.mjs            # dry-run
 *   node scripts/ensure-audit.mjs --yes      # apply
 */

const databaseId = process.env.PUBLIC_APPWRITE_DATABASE_ID ?? 'notain_db';
const endpoint = (
  process.env.PUBLIC_APPWRITE_ENDPOINT ?? 'https://sgp.cloud.appwrite.io/v1'
).replace(/\/+$/, '');
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID ?? '6aca66fb003071c0ef43';
const apiKey = (process.env.APPWRITE_API_KEY ?? '').trim();
const tableId = 'audit_logs';

const STRING_ATTRIBUTES = [
  { key: 'actorId', size: 64 },
  { key: 'actorEmail', size: 128 },
  { key: 'action', size: 64 },
  { key: 'targetType', size: 64 },
  { key: 'targetId', size: 128 },
  { key: 'detail', size: 2048 },
  { key: 'createdAt', size: 32 },
];

const INDEX = { key: 'byCreatedAt', type: 'key', attributes: ['createdAt'], orders: ['desc'] };

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
      '  2. Centang scope: collections.read, collections.write, documents.write\n' +
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
      console.log(`  + buat tabel \`${tableId}\` (rowSecurity, create: users)`);
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
      name: 'Audit Logs',
      // Table-level permissions stay empty: only the API key writes (it
      // bypasses rowSecurity), and reads are granted per-row as
      // read("team:admins") by `writeAudit`.
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

  // 3. The newest-first listing index.
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
        '  Pastikan key punya scope: collections.read, collections.write, documents.write',
    );
  }
  fail(message);
}

console.log('\nSelesai. Sekarang cabut (revoke) API key-nya di Console → Settings → API keys.');
