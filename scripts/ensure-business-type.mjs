#!/usr/bin/env node
/**
 * Adds the columns this app expects but the original tables lack:
 *
 *   profiles.businessType  — string64, nullable. The account's chosen business
 *                            type; `null` until the user picks one (asked on
 *                            first template creation, editable in settings).
 *   templates.businessType — string64, nullable. The type a template was
 *                            authored for; `null` for the three built-ins'
 *                            saved copies and every older template.
 *   invoices.details       — text, nullable. Business-specific key-value facts
 *                            per invoice (plate number, weight…); `null` when
 *                            the invoice has none. Written as JSON, same as
 *                            the `items` column.
 *
 * No data backfill and no index: grouping happens client-side over the pages
 * already loaded, and nothing queries by these columns server-side.
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
 *   node scripts/ensure-business-type.mjs          # dry-run
 *   node scripts/ensure-business-type.mjs --yes    # apply
 */

const databaseId = process.env.PUBLIC_APPWRITE_DATABASE_ID ?? 'notain_db';
const endpoint = (
  process.env.PUBLIC_APPWRITE_ENDPOINT ?? 'https://sgp.cloud.appwrite.io/v1'
).replace(/\/+$/, '');
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID ?? '6aca66fb003071c0ef43';
const apiKey = (process.env.APPWRITE_API_KEY ?? '').trim();

/**
 * Columns to ensure, one entry per (table, column). The table must already
 * exist — this script never creates one. Sizes mirror what each payload can
 * hold: the businessType slugs are short, the details JSON carries up to 16
 * bounded values.
 */
const TARGETS = [
  { tableId: 'profiles', column: { key: 'businessType', size: 64 } },
  { tableId: 'templates', column: { key: 'businessType', size: 64 } },
  { tableId: 'invoices', column: { key: 'details', size: 100_000 } },
];

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
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 2000 * attempt;
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
  for (const { tableId, column } of TARGETS) {
    const table = await api(
      'GET',
      `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}`,
    ).catch((error) => {
      if (String(error.message).includes('404')) {
        fail(`Tabel \`${tableId}\` tidak ada. Jalankan script ensure tabel itu dulu.`);
      }
      throw error;
    });

    const present = fieldsOf(table).some((field) => field.key === column.key);
    if (present) {
      console.log(`  ✓ kolom \`${tableId}.${column.key}\` sudah ada`);
      continue;
    }

    if (!confirmed) {
      console.log(
        `  + buat kolom \`${tableId}.${column.key}\` (string, size ${column.size}, nullable)`,
      );
      continue;
    }

    await api(
      'POST',
      `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}/attributes/string`,
      { key: column.key, size: column.size, required: false, array: false },
    );
    console.log(`  ✔ kolom \`${tableId}.${column.key}\` dibuat`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
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
