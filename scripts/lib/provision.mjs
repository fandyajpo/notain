/**
 * The provisioning pass: make Appwrite match `scripts/schema.mjs`.
 *
 * Additive and idempotent by design — it creates what is missing, re-asserts
 * row security and table permissions (a table hand-edited in the Console is
 * exactly how tenant data becomes readable by every session), and never drops,
 * shrinks or rewrites anything.
 *
 * Dry-run is the default: with `confirmed` false it only prints the plan, which
 * is what makes `npm run db:ensure` safe to run against production to see drift.
 */

import {
  api,
  apiSafe,
  collectionPath,
  databaseId,
  fieldsOf,
  samePermissions,
  sleep,
} from './appwrite-admin.mjs';

/**
 * Appwrite builds an attribute or index asynchronously. A write that lands
 * before the build finishes is answered with "attribute not found", so the old
 * scripts all waited between steps; 1.5 s is what they had converged on.
 */
const SETTLE_MS = 1500;

/** `{ found, collection }` — a 404 is an answer, every other failure is not. */
async function readCollection(tableId) {
  const result = await apiSafe('GET', collectionPath(tableId));
  if (result.ok) return { found: true, collection: result.body };
  if (result.status === 404) return { found: false, collection: null };
  throw new Error(`GET ${tableId} → ${result.status} ${result.message}`);
}

function describeString(attribute) {
  return `string, size ${attribute.size}`;
}

function describeInteger(attribute) {
  const range = `integer, ${attribute.min ?? 0}..${attribute.max}`;
  return attribute.default === undefined ? range : `${range}, default ${attribute.default}`;
}

function describeIndex(index) {
  return `${index.type}: ${index.attributes.join(', ')}`;
}

/** Prints the plan for a table that does not exist yet. */
function printPlan(spec) {
  const permissions = JSON.stringify(spec.permissions);
  console.log(`  + buat tabel \`${spec.id}\` (documentSecurity, permissions ${permissions})`);
  for (const attribute of spec.strings ?? []) {
    console.log(`  + buat kolom \`${spec.id}.${attribute.key}\` (${describeString(attribute)})`);
  }
  for (const attribute of spec.integers ?? []) {
    console.log(`  + buat kolom \`${spec.id}.${attribute.key}\` (${describeInteger(attribute)})`);
  }
  for (const index of spec.indexes ?? []) {
    console.log(`  + buat index \`${spec.id}.${index.key}\` (${describeIndex(index)})`);
  }
}

async function createCollection(spec) {
  await api('POST', `/databases/${databaseId}/collections`, {
    collectionId: spec.id,
    name: spec.name,
    // A session gets nothing at table level: every tenant read and write goes
    // through a Pages Function that checks membership first.
    permissions: spec.permissions,
    // `documentSecurity` is the current field name. The older `rowSecurity` is
    // a silently ignored no-op, which is how a table ends up with row
    // permissions that protect nothing.
    documentSecurity: true,
  });
  console.log(`  ✔ tabel \`${spec.id}\` dibuat`);
  await sleep(SETTLE_MS);
}

/** Re-asserts row security and the table-level permission set. */
async function alignPermissions(spec, collection, confirmed) {
  const current = collection.$permissions ?? [];
  // The WRITE field is `documentSecurity`; the READ field Appwrite returns is
  // `rowSecurity`. Comparing only the write name reads `undefined` on every
  // table, which turns this check into a permanent false positive — it printed
  // "+ aktifkan documentSecurity" even for tables that already had it on.
  const securityOff = (collection.rowSecurity ?? collection.documentSecurity) !== true;
  const permissionsDiffer = !samePermissions(current, spec.permissions);

  if (!securityOff && !permissionsDiffer) {
    console.log(`  ✓ izin \`${spec.id}\` sudah sesuai`);
    return collection;
  }

  if (!confirmed) {
    if (securityOff) console.log(`  + aktifkan documentSecurity \`${spec.id}\``);
    if (permissionsDiffer) {
      console.log(
        `  + set permissions \`${spec.id}\`: ${JSON.stringify(spec.permissions)} ` +
          `(sekarang ${JSON.stringify(current)})`,
      );
    }
    return collection;
  }

  // `documentSecurity` MUST be repeated: Appwrite binds an absent field to its
  // default (`false`), and with row security off every row permission is
  // ignored — the owner could no longer read their own rows.
  await api('PUT', collectionPath(spec.id), {
    name: collection.name ?? spec.name,
    permissions: spec.permissions,
    documentSecurity: true,
  });
  console.log(`  ✔ izin \`${spec.id}\` diselaraskan`);
  await sleep(SETTLE_MS);
  return (await readCollection(spec.id)).collection;
}

/** Creates the missing string and integer columns. */
async function alignColumns(spec, collection, confirmed) {
  const present = new Set(fieldsOf(collection).map((field) => field.key));

  for (const attribute of spec.strings ?? []) {
    if (present.has(attribute.key)) {
      console.log(`  ✓ kolom \`${spec.id}.${attribute.key}\` sudah ada`);
      continue;
    }
    if (!confirmed) {
      console.log(`  + buat kolom \`${spec.id}.${attribute.key}\` (${describeString(attribute)})`);
      continue;
    }
    await api('POST', `${collectionPath(spec.id)}/attributes/string`, {
      key: attribute.key,
      size: attribute.size,
      required: false,
      array: false,
    });
    console.log(`  ✔ kolom \`${spec.id}.${attribute.key}\` dibuat`);
    await sleep(SETTLE_MS);
  }

  for (const attribute of spec.integers ?? []) {
    if (present.has(attribute.key)) {
      console.log(`  ✓ kolom \`${spec.id}.${attribute.key}\` sudah ada`);
      continue;
    }
    if (!confirmed) {
      console.log(
        `  + buat kolom \`${spec.id}.${attribute.key}\` (${describeInteger(attribute)})`,
      );
      continue;
    }
    await api('POST', `${collectionPath(spec.id)}/attributes/integer`, {
      key: attribute.key,
      required: false,
      min: attribute.min ?? 0,
      max: attribute.max,
      ...(attribute.default === undefined ? {} : { default: attribute.default }),
      array: false,
    });
    console.log(`  ✔ kolom \`${spec.id}.${attribute.key}\` dibuat`);
    await sleep(SETTLE_MS);
  }
}

/** Creates the missing indexes. Re-reads first, so a fresh column is visible. */
async function alignIndexes(spec, confirmed) {
  const { collection } = await readCollection(spec.id);
  const present = new Set((collection?.indexes ?? []).map((index) => index.key));

  for (const index of spec.indexes ?? []) {
    if (present.has(index.key)) {
      console.log(`  ✓ index \`${spec.id}.${index.key}\` sudah ada`);
      continue;
    }
    if (!confirmed) {
      console.log(`  + buat index \`${spec.id}.${index.key}\` (${describeIndex(index)})`);
      continue;
    }
    const result = await api('POST', `${collectionPath(spec.id)}/indexes`, {
      key: index.key,
      type: index.type,
      attributes: index.attributes,
      orders: index.orders,
    });
    // Indexes build asynchronously; `processing` is the normal first answer.
    console.log(
      `  ✔ index \`${spec.id}.${index.key}\` dibuat — status ${result?.status ?? 'unknown'}`,
    );
    await sleep(SETTLE_MS);
  }
}

/**
 * Aligns one table. Returns `{ blocked }` with a reason when the table must be
 * created by hand (`create: false`) — the caller reports those together instead
 * of failing on the first one.
 */
export async function provisionTable(spec, { confirmed }) {
  console.log(`\n${spec.id} — ${spec.summary}`);

  const existing = await readCollection(spec.id);
  let collection = existing.collection;

  if (!existing.found) {
    if (spec.create === false) {
      return {
        blocked: `tabel \`${spec.id}\` belum ada dan sengaja tidak dibuat di sini — buat di Appwrite Console (lihat docs/data-model.md), lalu jalankan ulang`,
      };
    }
    if (!confirmed) {
      printPlan(spec);
      return {};
    }
    await createCollection(spec);
    collection = (await readCollection(spec.id)).collection;
  } else {
    console.log(`  ✓ tabel \`${spec.id}\` sudah ada`);
  }

  collection = await alignPermissions(spec, collection, confirmed);
  await alignColumns(spec, collection, confirmed);
  await alignIndexes(spec, confirmed);

  return {};
}
