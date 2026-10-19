#!/usr/bin/env node
/**
 * Creates the `catalog` table (the owner's saved barang/jasa) if it is missing.
 *
 * Columns:
 *   ownerId (string 64), name (string 200), kind (string 16),
 *   unit (string 16), unitPrice (integer, default 0), lastUsedAt (string 32),
 *   plus the `owner_name` key index on ["ownerId", "name"] used by the list and
 *   duplicate-name queries.
 *
 * Document (row) security MUST stay on. The table grants only `create("users")`
 * at the table level and every read/update/delete rides on the row permissions
 * — with row security off, Appwrite ignores those and answers every list with
 * `401 user_unauthorized`, which looks exactly like a lapsed session and used
 * to bounce `/catalog` against `/login` forever. This script re-asserts it on
 * every run, so a hand-created table cannot silently drift back.
 *
 * No data migration: an empty table simply means the picker has nothing to
 * pre-fill yet, and rows arrive either from `/catalog` or from an invoice save
 * with the per-item "Simpan ke katalog" box ticked.
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
 *   node scripts/ensure-catalog.mjs            # dry-run
 *   node scripts/ensure-catalog.mjs --yes      # apply
 */

const databaseId = process.env.PUBLIC_APPWRITE_DATABASE_ID ?? 'notain_db';
const endpoint = (
  process.env.PUBLIC_APPWRITE_ENDPOINT ?? 'https://sgp.cloud.appwrite.io/v1'
).replace(/\/+$/, '');
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID ?? '6aca66fb003071c0ef43';
const apiKey = (process.env.APPWRITE_API_KEY ?? '').trim();
const tableId = 'catalog';

const STRING_ATTRIBUTES = [
  { key: 'ownerId', size: 64 },
  { key: 'name', size: 200 },
  { key: 'kind', size: 16 },
  { key: 'unit', size: 16 },
  { key: 'lastUsedAt', size: 32 },
];
const INTEGER_ATTRIBUTES = [{ key: 'unitPrice', size: 1_000_000_000_000 }];

const INDEX = {
  key: 'owner_name',
  type: 'key',
  attributes: ['ownerId', 'name'],
  orders: ['asc', 'asc'],
};

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
    const response = await fetch(`${endpoint}${path}`, {
      method,
      headers: {
        'X-Appwrite-Project': projectId,
        'X-Appwrite-Key': apiKey,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
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
      name: 'Catalog',
      // Same contract as invoices/customers/templates/stats: create is granted
      // at the table level, read/update/delete live on each row's permissions.
      permissions: ['create("users")'],
      // Appwrite's create/update collection API took `documentSecurity` over
      // the older `rowSecurity`; passing the old name is a silent no-op, which
      // is how the table ends up readable-by-nobody. Use the current field.
      documentSecurity: true,
    });
    console.log(`  ✔ tabel \`${tableId}\` dibuat`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  // 2. Row security: without it the per-row permissions are ignored and every
  // read answers 401, so this is what keeps the page usable.
  if (table && table.documentSecurity !== true) {
    if (!confirmed) {
      console.log(`  + aktifkan document security di \`${tableId}\` (wajib untuk baca baris)`);
    } else {
      table = await api(
        'PUT',
        `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}`,
        {
          name: table.name ?? 'Catalog',
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

  // 4. The owner lookup index.
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
