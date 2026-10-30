#!/usr/bin/env node
/**
 * Multi-tenancy column pass: adds `orgId` to every tenanted table and locks
 * their table-level permissions to API-key-only.
 *
 *   orgId (string 64) — the organization a row belongs to. Every tenanted
 *   read/write now goes through a Pages Function that verifies the caller's
 *   membership (`requireOrg`) and stamps/filters this column itself; the
 *   browser never supplies it as authority, only as a request hint.
 *
 * Tables covered:
 *   invoices, customers, catalog, templates, stats — the product's data.
 *   payments — which org a checkout bought (plan is per organization).
 *   audit_logs — which org an admin action touched.
 *
 * Because every read/write moved server-side, the old table-level
 * `create("users")` permission is removed (set to `[]`): a session can no
 * longer create rows directly in these tables even by calling the SDK —
 * isolation is enforced by the Functions, not by hoping every client query
 * remembers its orgId filter.
 *
 * `profiles` is deliberately NOT here: its document id becomes the orgId
 * (it is the organization's public business identity), and its write path is
 * already the `/api/profile` Function.
 *
 * Indexes are NOT created here — `npm run indexes:ensure` owns those (the
 * org-scoped index definitions live in `scripts/ensure-indexes.mjs`). Run it
 * with `-- --yes` after this script.
 *
 * Idempotent: an existing column or already-empty permission set is skipped.
 *
 * Admin-only, so it needs an API key (Settings → API keys) with:
 *   collections.read, collections.write, documents.write
 *
 * Usage:
 *   node scripts/ensure-org-columns.mjs            # dry-run
 *   node scripts/ensure-org-columns.mjs --yes      # apply
 */

const databaseId = process.env.PUBLIC_APPWRITE_DATABASE_ID ?? 'notain_db';
const endpoint = (
  process.env.PUBLIC_APPWRITE_ENDPOINT ?? 'https://sgp.cloud.appwrite.io/v1'
).replace(/\/+$/, '');
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID ?? '6aca66fb003071c0ef43';
const apiKey = (process.env.APPWRITE_API_KEY ?? '').trim();

const TABLES = ['invoices', 'customers', 'catalog', 'templates', 'stats', 'payments', 'audit_logs'];

const ORG_COLUMN = { key: 'orgId', size: 64 };

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

console.log(`Target: ${endpoint}  project=${projectId}  database=${databaseId}\n`);

try {
  for (const tableId of TABLES) {
    const collection = await api(
      'GET',
      `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}`,
    );
    const columns = collection.columns ?? collection.attributes ?? [];
    const present = new Set(columns.map((column) => column.key));
    const permissions = collection.permissions ?? [];

    // 1. The orgId column.
    if (present.has(ORG_COLUMN.key)) {
      console.log(`  ✓ kolom \`${tableId}.orgId\` sudah ada`);
    } else if (!confirmed) {
      console.log(`  + buat kolom \`${tableId}.orgId\` (string, size ${ORG_COLUMN.size})`);
    } else {
      await api(
        'POST',
        `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}/attributes/string`,
        { key: ORG_COLUMN.key, size: ORG_COLUMN.size, required: false, array: false },
      );
      console.log(`  ✔ kolom \`${tableId}.orgId\` dibuat`);
      await sleep(1500);
    }

    // 2. Table permissions → API-key only.
    if (permissions.length === 0) {
      console.log(`  ✓ permissions \`${tableId}\` sudah kosong (API key only)`);
    } else if (!confirmed) {
      console.log(`  + kosongkan permissions \`${tableId}\` (sekarang: ${permissions.join(', ')})`);
    } else {
      // Name is required by Appwrite's update-collection endpoint.
      await api('PUT', `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}`, {
        name: collection.name,
        permissions: [],
      });
      console.log(`  ✔ permissions \`${tableId}\` dikosongkan (API key only)`);
      await sleep(1000);
    }
  }

  if (!confirmed) {
    console.log('\nDry-run saja. Ulangi dengan `--yes` untuk benar-benar menerapkan.');
    process.exit(0);
  }

  console.log('\nLangkah berikutnya: npm run indexes:ensure -- --yes  (index org-scoped)');
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
