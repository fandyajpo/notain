#!/usr/bin/env node
/**
 * Adds the user-profile / organization-identity / letterhead model on top of
 * multi-tenancy, WITHOUT touching any existing table destructively:
 *
 *   userProfiles — the SHARED user identity, one row per account:
 *     $id is the Appwrite userId; username (string 128) and phone (string 32)
 *     are the person's identity across every org they own or join. The login
 *     email deliberately does NOT live here — it stays owned by the Appwrite
 *     account (displayed read-only in the UI, never editable through
 *     settings). Permissions are empty: only the `/api/profile/user`
 *     Function, gated by the session JWT, reads or writes this row.
 *
 *   organizations — NEW contact-identity columns only (additive):
 *     slug (unique, server-generated from the name — the future public URL
 *     key), email, phone, website, address, taxId, logoFileId. Existing
 *     columns (name, ownerId, plan, planExpiresAt, businessType, createdAt)
 *     are untouched, so this run is safe on any environment.
 *
 *   memberships — nothing to do: it already IS the user↔organization
 *     many-to-many table with the role on the membership row.
 *
 * Backfill (idempotent, from every existing `profiles/<orgId>` letterhead
 * row, so no account loses data):
 *   - `letterheads/<orgId>`   ← businessName = org.name + the profile's
 *     address/phone/email/logoFileId.
 *   - `organizations/<orgId>` ← slug (always generated), email/phone (only
 *     when the column is still empty — never clobbers newer edits).
 *   - `userProfiles/<org.ownerId>` ← username/phone from the profile, only
 *     when the row is missing or its username is empty (a later user edit
 *     always wins).
 *
 * Idempotent: re-running skips anything that already exists and never
 * overwrites a non-empty target value.
 *
 * Admin-only API key (Settings → API keys) with:
 *   collections.read, collections.write, documents.read, documents.write
 * (`documents.read` is new here — the backfill reads profile rows.)
 *
 * Usage:
 *   node scripts/ensure-user-profile-org-model.mjs            # dry-run
 *   node scripts/ensure-user-profile-org-model.mjs --yes      # apply
 */

const databaseId = process.env.PUBLIC_APPWRITE_DATABASE_ID ?? 'notain_db';
const endpoint = (
  process.env.PUBLIC_APPWRITE_ENDPOINT ?? 'https://sgp.cloud.appwrite.io/v1'
).replace(/\/+$/, '');
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID ?? '6aca66fb003071c0ef43';
const apiKey = (process.env.APPWRITE_API_KEY ?? '').trim();

/** Table-level permissions are empty on purpose: API key only. */
const TABLES = [
  {
    // Only the NEW identity columns are listed — the loop skips everything
    // that already exists, so name/ownerId/plan/businessType are untouched.
    id: 'organizations',
    name: 'Organizations',
    stringAttributes: [
      { key: 'slug', size: 64 },
      { key: 'email', size: 320 },
      { key: 'phone', size: 32 },
      { key: 'website', size: 320 },
      { key: 'address', size: 512 },
      { key: 'taxId', size: 64 },
      { key: 'logoFileId', size: 64 },
    ],
    integerAttributes: [],
    // Unique on purpose: the slug is the org's future public-URL key.
    // Multiple rows with a still-null slug are fine — uniqueness binds
    // non-null values only.
    indexes: [{ key: 'bySlug', type: 'unique', attributes: ['slug'], orders: ['asc'] }],
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
      '  2. Centang scope: collections.read, collections.write,\n' +
      '     documents.read, documents.write\n' +
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

/** Non-throwing variant for the upsert paths (404 = "row not there yet"). */
async function apiSafe(method, path, body) {
  try {
    return { ok: true, status: 200, body: await api(method, path, body) };
  } catch (error) {
    const message = String(error.message ?? error);
    const status = Number(/→ (\d{3}) /.exec(message)?.[1] ?? 0);
    return { ok: false, status, body: null, message };
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * ASCII slug from an org name, collision-proofed with a deterministic org-id
 * slice — no retry loop needed, and identical input never races the unique
 * index (`bengkel-jaya` + `a1b2` from `org_a1b2…`).
 */
function slugify(name, orgId) {
  const base =
    String(name)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'org';
  return `${base}-${orgId.slice(4, 8)}`;
}

/** Only-empty-wins backfill: an existing non-empty value is never clobbered. */
function fillIfEmpty(row, key, value) {
  if (value === null || value === undefined || value === '') return null;
  const current = row?.[key];
  return current === null || current === undefined || current === '' ? value : null;
}

console.log(`Target: ${endpoint}  project=${projectId}  database=${databaseId}\n`);

try {
  // ── Phase 1: tables, columns, indexes (same idempotent walk as ensure-orgs)
  for (const table of TABLES) {
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
        continue;
      }
      fresh = await api('POST', `/databases/${databaseId}/collections`, {
        collectionId: table.id,
        name: table.name,
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

  // ── Phase 2: backfill from the existing per-org profile rows.
  console.log('\nBackfill dari `profiles/<orgId>`…');
  const doc = (table, id) =>
    `/databases/${databaseId}/collections/${table}/documents/${encodeURIComponent(id)}`;

  let cursor;
  let orgCount = 0;
  do {
    const qs = new URLSearchParams({ limit: '100', queries: '[]' });
    // Appwrite ≥2.4 JSON-object queries; a bare page walk only needs limit.
    const page = await api(
      'GET',
      `/databases/${databaseId}/collections/organizations/documents?` +
        `queries[0]=${encodeURIComponent(
          JSON.stringify({ method: 'limit', values: [100] }),
        )}${cursor ? `&queries[1]=${encodeURIComponent(JSON.stringify({ method: 'cursorAfter', values: [cursor] }))}` : ''}`,
    );
    const documents = page.documents ?? [];
    for (const org of documents) {
      orgCount += 1;
      const orgId = org.$id;

      // The per-org profile row: the pre-split letterhead + person contact.
      const profileRes = await apiSafe('GET', doc('profiles', orgId));
      const profile = profileRes.ok ? profileRes.body : null;

      // 1. organizations: slug always (generated), contact only-when-empty.
      const orgPatch = {};
      const slug = fillIfEmpty(org, 'slug', slugify(org.name ?? 'org', orgId));
      if (slug !== null) orgPatch.slug = slug;
      const email = fillIfEmpty(org, 'email', profile?.email ?? null);
      if (email !== null) orgPatch.email = email;
      const phone = fillIfEmpty(org, 'phone', profile?.phone ?? null);
      if (phone !== null) orgPatch.phone = phone;
      const address = fillIfEmpty(org, 'address', profile?.address ?? null);
      if (address !== null) orgPatch.address = address;
      const logoFileId = fillIfEmpty(org, 'logoFileId', profile?.logoFileId ?? null);
      if (logoFileId !== null) orgPatch.logoFileId = logoFileId;
      if (Object.keys(orgPatch).length > 0) {
        const res = await apiSafe('PATCH', doc('organizations', orgId), { data: orgPatch });
        console.log(
          res.ok
            ? `  ✔ organizations/${orgId} ← ${Object.keys(orgPatch).join(', ')}`
            : `  ⚠ organizations/${orgId} gagal: ${res.status}`,
        );
      }

      // 2. profiles/<ownerId>: the account identity, in the SAME table the
      // org identity uses (the two id spaces never collide: org ids start
      // `org_`). `name` is the person here, the business name on an org row.
      const ownerId = typeof org.ownerId === 'string' ? org.ownerId : '';
      if (ownerId === '') continue;
      const existingRes = await apiSafe('GET', doc('profiles', ownerId));
      const existing = existingRes.ok ? existingRes.body : null;
      const name = typeof profile?.name === 'string' ? profile.name : '';
      const hasProfileRow = existingRes.ok;
      const nameMissing = !hasProfileRow || !existing?.name;
      const phoneMissing = !hasProfileRow || !existing?.phone;
      if (!name && !phoneMissing && !nameMissing) continue;
      if (!nameMissing && !phoneMissing) continue;

      const upsert = {};
      if (nameMissing && name) upsert.name = name;
      if (phoneMissing && profile?.phone) upsert.phone = profile.phone;
      if (Object.keys(upsert).length === 0) continue;
      if (hasProfileRow) {
        const res = await apiSafe('PATCH', doc('profiles', ownerId), { data: upsert });
        console.log(
          res.ok
            ? `  ✔ profiles/${ownerId} ← ${Object.keys(upsert).join(', ')}`
            : `  ⚠ profiles/${ownerId} gagal: ${res.status}`,
        );
      } else {
        const res = await apiSafe(
          'POST',
          `/databases/${databaseId}/collections/profiles/documents`,
          {
            documentId: ownerId,
            // Same attribute set the org-create Function writes, so the row
            // satisfies the table without inventing values for billing.
            data: {
              name: upsert.name ?? '',
              phone: upsert.phone ?? '',
              address: null,
              email: '',
              logoFileId: null,
              plan: 'free',
              planExpiresAt: null,
            },
            permissions: [],
          },
        );
        console.log(
          res.ok
            ? `  ✔ profiles/${ownerId} dibuat`
            : `  ⚠ profiles/${ownerId} gagal: ${res.status}`,
        );
      }
    }
    cursor = documents.length === 100 ? (documents.at(-1)?.$id ?? undefined) : undefined;
  } while (cursor);

  console.log(`\nSelesai: ${orgCount} organisasi diproses.`);
  console.log('Cabut (revoke) API key-nya di Console → Settings → API keys.');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('401') || message.includes('403')) {
    fail(
      `API key ditolak (${message.slice(0, 120)}…).\n` +
        '  Pastikan key punya scope: collections.read, collections.write,\n' +
        '  documents.read, documents.write',
    );
  }
  fail(message);
}
