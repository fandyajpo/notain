#!/usr/bin/env node
/**
 * One-off backfill for the profile→organization business-identity split, part
 * two: organization CONTACTS, the public slug, and the account identity rows.
 *
 * Part one is `scripts/migrate-org-identity.mjs` (name and business type). This
 * one fills what the split left empty:
 *
 *   organizations/<orgId> ← slug (always generated when missing: it is the
 *     public-URL key), and phone / address / logoFileId copied from the legacy
 *     `profiles/<orgId>` letterhead row — only when the organization's own
 *     value is still empty, so a later edit in Settings always wins.
 *   profiles/<ownerId>    ← the SHARED account identity (name, phone), created
 *     with the same attribute set the org-create Function writes when the row
 *     is missing. The two profile id spaces cannot collide: org ids start
 *     `org_`, Appwrite user ids do not.
 *
 * Deliberately NOT copied: the organization's contact email. The legacy profile
 * email was the creator's login address, and an organization's contact email is
 * its own data, filled in by its owner.
 *
 * Idempotent: a second run finds nothing empty and changes nothing.
 *
 * Needs an API key with `collections.read`, `documents.read`,
 * `documents.write` — put it in `.env` as `APPWRITE_API_KEY` (never commit it,
 * never paste it in chat) and revoke it when you are done.
 *
 * Usage:
 *   npm run migrate:org-contacts            # dry-run
 *   npm run migrate:org-contacts -- --yes   # apply
 */

import {
  apiSafe,
  confirmed,
  createRow,
  databaseId,
  documentPath,
  endpoint,
  fail,
  listAllRows,
  patchRow,
  projectId,
  requireApiKey,
} from './lib/appwrite-admin.mjs';

const SCOPES = ['collections.read', 'documents.read', 'documents.write'];

requireApiKey(SCOPES);

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

const asText = (value) => (typeof value === 'string' ? value : '');

console.log(`Target: ${endpoint}  project=${projectId}  database=${databaseId}\n`);

try {
  const organizations = await listAllRows('organizations');
  console.log(`  ${organizations.length} organisasi dipindai`);
  console.log('\nBackfill dari `profiles/<orgId>`…');

  let touched = 0;

  for (const org of organizations) {
    const orgId = org.$id;
    const profileResult = await apiSafe('GET', documentPath('profiles', orgId));
    const profile = profileResult.ok ? profileResult.body : null;

    // 1. organizations: slug always (generated), contacts only-if-empty.
    const orgPatch = {};
    const slug = fillIfEmpty(org, 'slug', slugify(asText(org.name) || 'org', orgId));
    if (slug !== null) orgPatch.slug = slug;
    const phone = fillIfEmpty(org, 'phone', profile?.phone ?? null);
    if (phone !== null) orgPatch.phone = phone;
    const address = fillIfEmpty(org, 'address', profile?.address ?? null);
    if (address !== null) orgPatch.address = address;
    const logoFileId = fillIfEmpty(org, 'logoFileId', profile?.logoFileId ?? null);
    if (logoFileId !== null) orgPatch.logoFileId = logoFileId;

    const orgKeys = Object.keys(orgPatch);
    if (orgKeys.length > 0) {
      touched += 1;
      if (!confirmed) {
        console.log(`  + organizations/${orgId}: isi ${orgKeys.join(', ')}`);
      } else {
        await patchRow('organizations', orgId, orgPatch);
        console.log(`  ✔ organizations/${orgId} ← ${orgKeys.join(', ')}`);
      }
    }

    // 2. profiles/<ownerId>: the account identity (the person, not the business).
    const ownerId = asText(org.ownerId);
    if (ownerId === '') continue;

    const existingResult = await apiSafe('GET', documentPath('profiles', ownerId));
    const existing = existingResult.ok ? existingResult.body : null;
    const name = asText(profile?.name);
    const nameMissing = existing === null || !existing.name;
    const phoneMissing = existing === null || !existing.phone;
    if (!nameMissing && !phoneMissing) continue;

    const identity = {};
    if (nameMissing && name) identity.name = name;
    if (phoneMissing && profile?.phone) identity.phone = profile.phone;
    if (Object.keys(identity).length === 0) continue;

    touched += 1;
    if (!confirmed) {
      console.log(`  + profiles/${ownerId}: ${existing === null ? 'buat' : 'isi'} identity`);
      continue;
    }
    if (existing === null) {
      // Same attribute set the org-create Function writes, so the row satisfies
      // the table without inventing values for billing.
      await createRow('profiles', ownerId, {
        name: identity.name ?? '',
        phone: identity.phone ?? '',
        address: null,
        email: '',
        logoFileId: null,
        plan: 'free',
        planExpiresAt: null,
      });
      console.log(`  ✔ profiles/${ownerId} dibuat`);
    } else {
      await patchRow('profiles', ownerId, identity);
      console.log(`  ✔ profiles/${ownerId} ← ${Object.keys(identity).join(', ')}`);
    }
  }

  if (!confirmed) {
    console.log(
      `\n${touched} baris akan diperbarui. Dry-run saja — ulangi dengan \`--yes\` untuk menerapkan.`,
    );
    process.exit(0);
  }
  console.log(`\n${touched} baris diperbarui.`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('401') || message.includes('403')) {
    fail(`API key ditolak (${message.slice(0, 120)}…).\n  Pastikan scope: ${SCOPES.join(', ')}`);
  }
  fail(message);
}

console.log('\nSelesai. Sekarang cabut (revoke) API key-nya di Console → Settings → API keys.');
