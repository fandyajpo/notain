#!/usr/bin/env node
/**
 * One-off backfill for the profile→organization business-identity split, part
 * one: the business NAME and TYPE.
 *
 * Before multi-tenancy, the business NAME and TYPE lived on the profile row
 * (`profiles.businessName`, `profiles.businessType`). The split moved both to
 * the organization (`organizations.name`, `organizations.businessType`) and
 * stopped writing the profile columns — but nothing copies the EXISTING values
 * over, so every org created before the split reads back as:
 *
 *   - businessType `null`  → the public site falls back to the `general`
 *                            template and the picker loses its grouping;
 *   - name blank           → the org was created through an older path that
 *                            allowed it, and the public site 404s on a blank
 *                            name.
 *
 * This script copies each profile's legacy values onto its organization, but
 * ONLY where the organization is still empty — an org that already has a name
 * or type (set deliberately after the split) is never overwritten. Profile row
 * ids ARE org ids for these legacy rows, so the join is by id.
 *
 * Retired/unknown business-type slugs are copied as-is: the read paths
 * (`functions/api/orgs.ts`, `src/core/business/issuer.ts`) validate against the
 * taxonomy and degrade unknown slugs to `null`, so a stale value is harmless.
 *
 * Part two is `scripts/migrate-org-contacts.mjs` (contacts, slug, identity rows).
 *
 * Idempotent: a second run finds nothing empty and changes nothing.
 *
 * Needs an API key with `collections.read` and `documents.write` — put it in
 * `.env` as `APPWRITE_API_KEY` (never commit it, never paste it in chat) and
 * revoke it when you are done.
 *
 * Usage:
 *   npm run migrate:org-identity            # dry-run
 *   npm run migrate:org-identity -- --yes   # apply
 */

import {
  apiSafe,
  confirmed,
  databaseId,
  documentPath,
  endpoint,
  fail,
  listAllRows,
  patchRow,
  projectId,
  requireApiKey,
} from './lib/appwrite-admin.mjs';

const SCOPES = ['collections.read', 'documents.write'];

requireApiKey(SCOPES);

const asTrimmed = (value) => (typeof value === 'string' ? value.trim() : '');

console.log(`Target: ${endpoint}  project=${projectId}  database=${databaseId}\n`);

try {
  const profiles = await listAllRows('profiles');
  console.log(`  ${profiles.length} baris profil dipindai`);

  let wouldPatch = 0;
  let patched = 0;

  for (const profile of profiles) {
    const orgId = profile.$id;
    const legacyName = asTrimmed(profile.businessName);
    const legacyType = asTrimmed(profile.businessType);
    if (!legacyName && !legacyType) continue;

    const orgResult = await apiSafe('GET', documentPath('organizations', orgId));
    // An orphan profile (org deleted) is not an error — skip it. Anything else
    // (a rejected key, an outage) must stop the run rather than pretend.
    if (!orgResult.ok) {
      if (orgResult.status === 404) continue;
      throw new Error(`GET organizations/${orgId} → ${orgResult.status} ${orgResult.message}`);
    }
    const org = orgResult.body;

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

    await patchRow('organizations', orgId, patch);
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
    fail(`API key ditolak (${message.slice(0, 120)}…).\n  Pastikan scope: ${SCOPES.join(', ')}`);
  }
  fail(message);
}

console.log('\nSelesai. Sekarang cabut (revoke) API key-nya di Console → Settings → API keys.');
