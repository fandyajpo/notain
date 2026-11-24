#!/usr/bin/env node
/**
 * Provisions the whole Appwrite schema in one pass.
 *
 * This replaces twelve `ensure-*.mjs` scripts (2,600 lines that differed only
 * in the columns they listed) and the eleven `npm run <model>:ensure` commands
 * that had to be run in a particular order: the definitions now live in
 * `scripts/schema.mjs`, and this command applies all of them.
 *
 * Needs `APPWRITE_API_KEY` in `.env` (Console → Settings → API keys) with
 * `collections.read` and `collections.write`. Revoke the key when you are done.
 *
 * Usage:
 *   npm run db:ensure                          # dry-run: what is missing or drifted
 *   npm run db:ensure -- --yes                 # create/align everything
 *   npm run db:ensure -- --yes --only payments # one table (id from --list)
 *   npm run db:ensure -- --list                # the table ids and what each owns
 *
 * Idempotent and additive: existing tables, columns and indexes are skipped, and
 * nothing is ever dropped.
 */

import {
  argv,
  confirmed,
  databaseId,
  endpoint,
  fail,
  projectId,
  requireApiKey,
} from './lib/appwrite-admin.mjs';
import { provisionTable } from './lib/provision.mjs';
import { TABLES, UNMANAGED } from './schema.mjs';

const SCOPES = ['collections.read', 'collections.write'];

/** `--only a,b` / `--only a --only b`; no flag means every table. */
function selectedTables() {
  const wanted = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value =
      arg === '--only' ? argv[index + 1] : arg.startsWith('--only=') ? arg.slice(7) : '';
    if (value === '') continue;
    if (arg === '--only') {
      if (!value || value.startsWith('--')) fail('--only butuh nama tabel. Lihat --list.');
      index += 1;
    }
    wanted.push(...value.split(',').map((id) => id.trim()).filter(Boolean));
  }

  if (wanted.length === 0) return TABLES;

  const known = new Set(TABLES.map((table) => table.id));
  const options = [...known].join(', ');
  for (const id of wanted) {
    if (!known.has(id)) fail(`Tabel \`${id}\` tidak ada di schema.mjs. Pilihan: ${options}.`);
  }
  return TABLES.filter((table) => wanted.includes(table.id));
}

if (argv.includes('--list')) {
  for (const table of TABLES) {
    const scope = table.create === false ? 'kolom+index saja' : 'tabel penuh';
    console.log(`  ${table.id.padEnd(16)} ${scope.padEnd(15)} ${table.summary}`);
  }
  console.log(`\nTidak dikelola di sini: ${UNMANAGED.join(', ')} (lihat skripnya sendiri).`);
  process.exit(0);
}

requireApiKey(SCOPES);

console.log(`Target: ${endpoint}  project=${projectId}  database=${databaseId}`);

const tables = selectedTables();
const blocked = [];

try {
  for (const table of tables) {
    const outcome = await provisionTable(table, { confirmed });
    if (outcome.blocked) blocked.push(outcome.blocked);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('401') || message.includes('403')) {
    fail(`API key ditolak (${message.slice(0, 120)}…).\n  Pastikan scope: ${SCOPES.join(', ')}`);
  }
  fail(message);
}

if (blocked.length > 0) {
  console.error('\nTabel yang harus dibuat manual lebih dulu:');
  for (const reason of blocked) console.error(`  ⚠ ${reason}`);
  process.exit(1);
}

if (!confirmed) {
  console.log('\nDry-run saja. Ulangi dengan `--yes` untuk benar-benar menerapkan.');
  process.exit(0);
}

console.log('\nSelesai. Sekarang cabut (revoke) API key-nya di Console → Settings → API keys.');
