#!/usr/bin/env node
/**
 * One-off backfill for the profile→organization business-identity split.
 *
 * Before multi-tenancy, the business NAME and TYPE lived on the profile row
 * (`profiles.businessName`, `profiles.businessType`). The split moved both to
 * the organization (`organizations.name`, `organizations.businessType`) and
 * stopped writing the profile columns — but nothing copies the EXISTING values
 * over, so every org created before the split reads back as:
 *
 *   - businessType `null`  → public site falls back to the `general` template
 *                            and the template picker loses its grouping;
 *   - name blank           → the org was created through an older path that
 *                            allowed it, and the public site 404s on a blank
 *                            name.
 *
 * This script copies each profile's legacy values onto its organization, but
 * ONLY where the organization is still empty — an org that already has a name
 * or type (set deliberately after the split) is never overwritten. Profile row
 * ids ARE org ids (`ensure-orgs.mjs` rekeys them), so the join is by id.
 *
 * Retired/unknown business-type slugs are copied as-is: the read paths
 * (`functions/api/orgs.ts`, `src/core/business/issuer.ts`) validate against
 * the taxonomy and degrade unknown slugs to `null`, so a stale value is
 * harmless and rewriting it here would duplicate that logic.
 *
 * Idempotent: a second run finds nothing empty and changes nothing.
 *
 * Admin-only, so it needs an API key (Settings → API keys) with:
 *   collections.read, documents.write
 *
 * Put the key in `.env` as `APPWRITE_API_KEY=` (git-ignored — never commit it,
 * never paste it in chat). Revoke the key when you are done.
 *
 * Usage:
 *   node scripts/migrate-org-identity.mjs            # dry-run
 *   node scripts/migrate-org-identity.mjs --yes      # apply
 */

const databaseId = process.env.PUBLIC_APPWRITE_DATABASE_ID ?? 'notain_db';
const endpoint = (
  process.env.PUBLIC_APPWRITE_ENDPOINT ?? 'https://sgp.cloud.appwrite.io/v1'
).replace(/\/+$/, '');
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID ?? '6aca66fb003071c0ef43';
const apiKey = (process.env.APPWRITE_API_KEY ?? '').trim();

const PROFILES = 'profiles';
const ORGANIZATIONS = 'organizations';
const PAGE_LIMIT = 100;

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
      '  2. Centang scope: collections.read, documents.write\n' +
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

/** Every profile row, following the cursor past the page limit. */
async function listProfiles() {
  const rows = [];
  for (let cursor = null; ;) {
    const params = new URLSearchParams();
    params.set('queries[0]', JSON.stringify({ method: 'limit', values: [PAGE_LIMIT] }));
    if (cursor) params.set('cursorAfter', cursor);
    const page = await api(
      'GET',
      `/databases/${databaseId}/collections/${encodeURIComponent(PROFILES)}/documents?${params}`,
    );
    const docs = page?.documents ?? [];
    rows.push(...docs);
    if (docs.length < PAGE_LIMIT) break;
    cursor = docs.at(-1)?.$id;
    if (!cursor) break;
  }
  return rows;
}

const asTrimmed = (value) => (typeof value === 'string' ? value.trim() : '');

console.log(`Target: ${endpoint}  project=${projectId}  database=${databaseId}\n`);

try {
  const profiles = await listProfiles();
  console.log(`  ${profiles.length} baris profil dipindai`);

  let wouldPatch = 0;
  let patched = 0;

  for (const profile of profiles) {
    const orgId = profile.$id;
    const legacyName = asTrimmed(profile.businessName);
    const legacyType = asTrimmed(profile.businessType);
    if (!legacyName && !legacyType) continue;

    const org = await api(
      'GET',
      `/databases/${databaseId}/collections/${encodeURIComponent(ORGANIZATIONS)}/documents/${encodeURIComponent(orgId)}`,
    ).catch((error) => {
      // An orphan profile (org deleted) is not an error — skip it.
      if (String(error).includes('404')) return null;
      throw error;
    });
    if (!org) continue;

    const patch = {};
    // Never overwrite a value chosen after the split; only fill the empties.
    if (!asTrimmed(org.name) && legacyName) patch.name = legacyName;
    if (!asTrimmed(org.businessType) && legacyType) patch.businessType = legacyType;
    if (Object.keys(patch).length === 0) continue;

    wouldPatch += 1;
    const what = Object.keys(patch).join(', ');
    if (!confirmed) {
      console.log(`  + ${orgId}: salin ${what} dari profil lama`);
      continue;
    }

    await api(
      'PATCH',
      `/databases/${databaseId}/collections/${encodeURIComponent(ORGANIZATIONS)}/documents/${encodeURIComponent(orgId)}`,
      patch,
    );
    patched += 1;
    console.log(`  ✔ ${orgId}: ${what} di-backfill`);
  }

  if (!confirmed) {
    console.log(
      `\n${wouldPatch} organisasi akan di-backfill. Dry-run saja — ulangi dengan \`--yes\` untuk menerapkan.`,
    );
    process.exit(0);
  }
  console.log(`\n${patched} organisasi di-backfill.`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('401') || message.includes('403')) {
    fail(
      `API key ditolak (${message.slice(0, 120)}…).\n` +
        '  Pastikan key punya scope: collections.read, documents.write',
    );
  }
  fail(message);
}

console.log('\nSelesai. Sekarang cabut (revoke) API key-nya di Console → Settings → API keys.');
