/**
 * Runtime configuration for the Appwrite backend. Override via `.env`.
 *
 * Appwrite Cloud is region-scoped: a project only answers on
 * `https://<region>.cloud.appwrite.io/v1`, and the global
 * `cloud.appwrite.io` endpoint rejects it with `general_access_forbidden`.
 */
function readEnv(key: string, fallback: string): string {
  const value = import.meta.env[key];
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

export const APPWRITE = {
  endpoint: readEnv('PUBLIC_APPWRITE_ENDPOINT', 'https://sgp.cloud.appwrite.io/v1'),
  projectId: readEnv('PUBLIC_APPWRITE_PROJECT_ID', '6aca66fb003071c0ef43'),
  databaseId: readEnv('PUBLIC_APPWRITE_DATABASE_ID', 'notain_db'),
  profilesTableId: 'profiles',
  invoicesTableId: 'invoices',
  templatesTableId: 'templates',
  customersTableId: 'customers',
  catalogTableId: 'catalog',
  statsTableId: 'stats',
  auditTableId: 'audit_logs',
} as const;
