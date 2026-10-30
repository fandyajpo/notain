#!/usr/bin/env node
/**
 * Creates the two multi-tenancy tables if missing:
 *
 *   organizations — the tenancy root. One row per organization:
 *     $id is the orgId every tenanted row carries; name (string 128) is what
 *     the switcher shows; ownerId (string 64) is the creator/owner, the only
 *     role allowed to delete the org or manage members; plan (string 16 —
 *     'free' | 'pro' | 'business') and planExpiresAt (string 32, nullable)
 *     hold the subscription — billing is per ORGANIZATION, so a checkout
 *     upgrades this row and deleting the org deletes the paid plan with it;
 *     businessType (string 64, nullable) — the taxonomy slug of the org's
 *     trade; `null` until someone picks one in Settings. It lives here (not on
 *     `profiles`) because it describes the workspace, and the public page and
 *     template grouping read it per org.
 *     createdAt (string 32, ISO).
 *
 *     Note: the rest of the business identity (kop usaha, logo, WhatsApp,
 *     address) does NOT live here — it stays in `profiles`, whose document id
 *     becomes the orgId. The business NAME is this row's `name`; `profiles`
 *     has no separate copy.
 *
 *   memberships — who belongs to which organization:
 *     orgId (string 64), userId (string 64 — empty until an invite is
 *     accepted), role (string 16 — 'owner' | 'member'), status (string 16 —
 *     'pending' | 'active'), inviteEmail (string 320 — the invited address;
 *     the acceptance lookup matches it against the signed-in account's
 *     email), invitedBy (string 64 — userId of the inviter), createdAt.
 *
 *     A custom table instead of Appwrite Teams is a deliberate project
 *     choice: roles, pending invites and cascade rules stay in data we own
 *     and can query. The consequence — row permissions cannot express
 *     "members of org X" — is answered by routing every tenanted read/write
 *     through Pages Functions (they check membership and use the API key),
 *     which is why table permissions here are empty: ONLY the API key reads
 *     or writes these rows.
 *
 * Indexes:
 *   organizations.byOwner (ownerId)          — "orgs I own" (settings, admin)
 *   memberships.byOrg (orgId)                — member list, cascade delete
 *   memberships.byUser (userId)              — "orgs I belong to" (login gate)
 *   memberships.byOrgEmail unique            — one invite per email per org
 *
 * Idempotent: re-running skips anything that already exists.
 *
 * Admin-only, so it needs an API key (Settings → API keys) with:
 *   collections.read, collections.write, documents.write
 *
 * Put the key in `.env` as `APPWRITE_API_KEY=` (git-ignored — never commit it,
 * never paste it in chat).
 *
 * Usage:
 *   node scripts/ensure-orgs.mjs            # dry-run
 *   node scripts/ensure-orgs.mjs --yes      # apply
 */

const databaseId = process.env.PUBLIC_APPWRITE_DATABASE_ID ?? 'notain_db';
const endpoint = (
  process.env.PUBLIC_APPWRITE_ENDPOINT ?? 'https://sgp.cloud.appwrite.io/v1'
).replace(/\/+$/, '');
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID ?? '6aca66fb003071c0ef43';
const apiKey = (process.env.APPWRITE_API_KEY ?? '').trim();

/** Table-level permissions are empty on purpose: API key only (see header). */
const TABLES = [
  {
    id: 'organizations',
    name: 'Organizations',
    stringAttributes: [
      { key: 'name', size: 128 },
      { key: 'ownerId', size: 64 },
      // Mirrors payments.plan: whole-word plan id, never a price.
      { key: 'plan', size: 16 },
      { key: 'planExpiresAt', size: 32 },
      { key: 'businessType', size: 64 },
      { key: 'createdAt', size: 32 },
    ],
    integerAttributes: [],
    indexes: [{ key: 'byOwner', type: 'key', attributes: ['ownerId'], orders: ['asc'] }],
  },
  {
    id: 'memberships',
    name: 'Memberships',
    stringAttributes: [
      { key: 'orgId', size: 64 },
      // '' until the invite is accepted — the acceptance query matches
      // inviteEmail instead, so a pending row still has a stable identity.
      { key: 'userId', size: 64 },
      { key: 'role', size: 16 },
      { key: 'status', size: 16 },
      { key: 'inviteEmail', size: 320 },
      { key: 'invitedBy', size: 64 },
      { key: 'createdAt', size: 32 },
    ],
    integerAttributes: [],
    indexes: [
      { key: 'byOrg', type: 'key', attributes: ['orgId'], orders: ['asc'] },
      { key: 'byUser', type: 'key', attributes: ['userId'], orders: ['asc'] },
      // One row per (org, email): a re-invite refreshes the existing pending
      // row instead of stacking duplicates, and two admins clicking "invite"
      // at once cannot both win.
      {
        key: 'byOrgEmail',
        type: 'unique',
        attributes: ['orgId', 'inviteEmail'],
        orders: ['asc', 'asc'],
      },
    ],
  },
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
  for (const table of TABLES) {
    // 1. The table itself.
    let fresh;
    try {
      fresh = await api(
        'GET',
        `/databases/${databaseId}/collections/${encodeURIComponent(table.id)}`,
      );
      console.log(`  ✓ tabel \`${table.id}\` sudah ada`);
    } catch (error) {
      if (!String(error.message).includes('404')) throw error;
      if (!confirmed) {
        console.log(`  + buat tabel \`${table.id}\` (rowSecurity, permissions kosong)`);
        for (const attribute of [...table.stringAttributes, ...table.integerAttributes]) {
          console.log(`  + buat kolom \`${table.id}.${attribute.key}\``);
        }
        for (const index of table.indexes) {
          console.log(
            `  + buat index \`${table.id}.${index.key}\` (${index.attributes.join(', ')})`,
          );
        }
        continue;
      }
      fresh = await api('POST', `/databases/${databaseId}/collections`, {
        collectionId: table.id,
        name: table.name,
        // Empty table permissions: only the Pages Functions touch these rows
        // through the API key (which bypasses rowSecurity). A session can
        // never read a membership list directly — membership is decided
        // server-side, by `requireOrg`.
        permissions: [],
        rowSecurity: true,
      });
      console.log(`  ✔ tabel \`${table.id}\` dibuat`);
      await sleep(1500);
      fresh = await api(
        'GET',
        `/databases/${databaseId}/collections/${encodeURIComponent(table.id)}`,
      );
    }

    // 2. Attributes.
    const present = new Set((fresh.columns ?? fresh.attributes ?? []).map((field) => field.key));
    for (const attribute of table.stringAttributes) {
      if (present.has(attribute.key)) {
        console.log(`  ✓ kolom \`${table.id}.${attribute.key}\` sudah ada`);
        continue;
      }
      if (!confirmed) {
        console.log(
          `  + buat kolom \`${table.id}.${attribute.key}\` (string, size ${attribute.size})`,
        );
        continue;
      }
      await api(
        'POST',
        `/databases/${databaseId}/collections/${encodeURIComponent(table.id)}/attributes/string`,
        { key: attribute.key, size: attribute.size, required: false, array: false },
      );
      console.log(`  ✔ kolom \`${table.id}.${attribute.key}\` dibuat`);
      await sleep(1500);
    }
    for (const attribute of table.integerAttributes) {
      if (present.has(attribute.key)) {
        console.log(`  ✓ kolom \`${table.id}.${attribute.key}\` sudah ada`);
        continue;
      }
      if (!confirmed) {
        console.log(`  + buat kolom \`${table.id}.${attribute.key}\` (integer)`);
        continue;
      }
      await api(
        'POST',
        `/databases/${databaseId}/collections/${encodeURIComponent(table.id)}/attributes/integer`,
        {
          key: attribute.key,
          required: false,
          min: attribute.min,
          max: attribute.max,
          array: false,
        },
      );
      console.log(`  ✔ kolom \`${table.id}.${attribute.key}\` dibuat`);
      await sleep(1500);
    }

    // 3. Indexes (re-read so creation races don't read stale state).
    const state = await api(
      'GET',
      `/databases/${databaseId}/collections/${encodeURIComponent(table.id)}`,
    );
    const indexes = new Set((state.indexes ?? []).map((index) => index.key));
    for (const index of table.indexes) {
      if (indexes.has(index.key)) {
        console.log(`  ✓ index \`${table.id}.${index.key}\` sudah ada`);
        continue;
      }
      if (!confirmed) {
        console.log(`  + buat index \`${table.id}.${index.key}\` (${index.attributes.join(', ')})`);
        continue;
      }
      await api(
        'POST',
        `/databases/${databaseId}/collections/${encodeURIComponent(table.id)}/indexes`,
        index,
      );
      console.log(`  ✔ index \`${table.id}.${index.key}\` dibuat`);
      await sleep(1500);
    }
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
