import { Account, Client, Storage, TablesDB } from 'appwrite';
import { APPWRITE } from './config';

/**
 * Lazily constructed, module-level Appwrite services. The whole app is a
 * static site, so every call happens in the browser after hydration.
 */

let client: Client | null = null;

function ensureClient(): Client {
  if (client) return client;
  if (typeof window === 'undefined') {
    throw new Error('Appwrite client accessed outside the browser.');
  }
  client = new Client().setEndpoint(APPWRITE.endpoint).setProject(APPWRITE.projectId);
  return client;
}

let account: Account | null = null;
let tables: TablesDB | null = null;
let storage: Storage | null = null;

export function getAccount(): Account {
  account ??= new Account(ensureClient());
  return account;
}

export function getTables(): TablesDB {
  tables ??= new TablesDB(ensureClient());
  return tables;
}

export function getStorage(): Storage {
  storage ??= new Storage(ensureClient());
  return storage;
}
