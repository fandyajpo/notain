#!/usr/bin/env node
/**
 * Creates the `stats` table (dashboard counter cache) if it is missing.
 *
 * The table holds exactly one row per account:
 *   ownerId (string 64), totalInvoices / sentCount / paidCount / voidCount /
 *   totalCustomers / totalTemplates (integer, default 0), plus the `owner`
 *   key index on ["ownerId"] used by the single-row lookup.
 *
 * No data migration: the row is created by the app itself on the first
 * dashboard visit (`refreshDashboardStats`), which also backfills any account
 * that existed before this table.
 *
 * Document (row) security MUST stay on. The table grants only `create("users")`
 * at the table level and the single row carries the owner's read/update — with
 * row security off, Appwrite ignores that and answers the dashboard's lookup
 * with `401 user_unauthorized`, so the cache never loads. This script re-asserts
 * it on every run so a hand-created table cannot drift back.
 *
 * Idempotent: re-running skips anything that already exists.
 *
 * Admin-only, so it needs an API key (Settings → API keys) with:
 *   collections.read, collections.write
 *
 * Put the key in `.env` as `APPWRITE_API_KEY=` (git-ignored — never commit it,
 * never paste it in chat). Revoke the key when you are done.
 *
 * Usage:
 *   node scripts/ensure-stats.mjs            # dry-run
 *   node scripts/ensure-stats.mjs --yes      # apply
 */

const databaseId = process.env.PUBLIC_APPWRITE_DATABASE_ID ?? 'notain_db';
const endpoint = (
  process.env.PUBLIC_APPWRITE_ENDPOINT ?? 'https://sgp.cloud.appwrite.io/v1'
).replace(/\/+$/, '');
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID ?? '6aca66fb003071c0ef43';
const apiKey = (process.env.APPWRITE_API_KEY ?? '').trim();
const tableId = 'stats';

const STRING_ATTRIBUTES = [{ key: 'ownerId', size: 64 }];
const INTEGER_ATTRIBUTES = [
  'totalInvoices',
  'sentCount',
  'paidCount',
  'voidCount',
  'totalCustomers',
  'totalTemplates',
].map((key) => ({ key, size: 10_000_000 }));

const INDEX = { key: 'owner', type: 'key', attributes: ['ownerId'], orders: ['asc'] };

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
      '  2. Centang scope: collections.read, collections.write\n' +
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
      // Nothing exists yet: lay out the whole plan in one go, there is no
      // attribute/index listing to compare against.
      console.log(`  + buat tabel \`${tableId}\` (documentSecurity, create: users)`);
      for (const attribute of STRING_ATTRIBUTES) {
        console.log(
          `  + buat kolom \`${tableId}.${attribute.key}\` (string, size ${attribute.size})`,
        );
      }
      for (const attribute of INTEGER_ATTRIBUTES) {
        console.log(
          `  + buat kolom \`${tableId}.${attribute.key}\` (integer, min 0, max ${attribute.size}, default 0)`,
        );
      }
      console.log(`  + buat index \`${tableId}.${INDEX.key}\` (${INDEX.attributes.join(', ')})`);
      console.log('\nDry-run saja. Ulangi dengan `--yes` untuk benar-benar menerapkan.');
      process.exit(0);
    }
    table = await api('POST', `/databases/${databaseId}/collections`, {
      collectionId: tableId,
      name: 'Stats',
      // Same contract as invoices/customers/templates: create is granted at
      // the table level, read/update/delete live on each row's permissions.
      permissions: ['create("users")'],
      // `documentSecurity` is the current field name; the older `rowSecurity`
      // is a silent no-op, which leaves the table unreadable.
      documentSecurity: true,
    });
    console.log(`  ✔ tabel \`${tableId}\` dibuat`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  // 2. Row security: without it the per-row permissions are ignored and the
  // dashboard lookup answers 401, so the cached counters never load.
  if (table && table.documentSecurity !== true) {
    if (!confirmed) {
      console.log(`  + aktifkan document security di \`${tableId}\` (wajib untuk baca baris)`);
    } else {
      table = await api(
        'PUT',
        `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}`,
        {
          name: table.name ?? 'Stats',
          permissions: ['create("users")'],
          documentSecurity: true,
        },
      );
      console.log(`  ✔ document security \`${tableId}\` diaktifkan`);
    }
  } else if (table) {
    console.log(`  ✓ document security \`${tableId}\` aktif`);
  }

  // 3. Attributes (re-read the table so a dry-run's "+ buat" list is real).
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

  for (const attribute of INTEGER_ATTRIBUTES) {
    if (present.has(attribute.key)) {
      console.log(`  ✓ kolom \`${tableId}.${attribute.key}\` sudah ada`);
      continue;
    }
    if (!confirmed) {
      console.log(
        `  + buat kolom \`${tableId}.${attribute.key}\` (integer, min 0, max ${attribute.size})`,
      );
      continue;
    }
    await api(
      'POST',
      `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}/attributes/integer`,
      {
        key: attribute.key,
        min: 0,
        max: attribute.size,
        required: false,
        default: 0,
        array: false,
      },
    );
    console.log(`  ✔ kolom \`${tableId}.${attribute.key}\` dibuat`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  // 4. The single-owner lookup index.
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
        '  Pastikan key punya scope: collections.read, collections.write',
    );
  }
  fail(message);
}

console.log('\nSelesai. Sekarang cabut (revoke) API key-nya di Console → Settings → API keys.');
