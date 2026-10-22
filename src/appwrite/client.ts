import { Account, Client, TablesDB, Teams } from 'appwrite';
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
let teams: Teams | null = null;

export function getAccount(): Account {
  account ??= new Account(ensureClient());
  return account;
}

export function getTables(): TablesDB {
  tables ??= new TablesDB(ensureClient());
  return tables;
}

export function getTeams(): Teams {
  teams ??= new Teams(ensureClient());
  return teams;
}

/**
 * Short-lived session token for the first-party `/api/*` Functions. Appwrite
 * expires it in ~15 min, so it is minted per call, never stored — the
 * Functions verify it with `GET /account` and never see a long-lived secret.
 */
export async function mintJwt(): Promise<string> {
  const { jwt } = await getAccount().createJWT();
  return jwt;
}
