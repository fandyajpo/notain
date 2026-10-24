import { fetchUpstream as fetch } from './http';
import type { Env } from './types';

const DATABASE_ID = 'notain_db';
const AUDIT_TABLE_ID = 'audit_logs';
const ACTOR_ID_MAX = 64;
const ACTOR_EMAIL_MAX = 128;
const ACTION_MAX = 64;
const TARGET_MAX = 128;
const DETAIL_MAX = 2048;

export type AuditEntry = {
  actorId: string;
  actorEmail: string;
  /** Short verb phrase, e.g. `user.suspend` or `user.update`. */
  action: string;
  targetType: string;
  targetId: string;
  /** Free-form JSON/text describing what changed. Kept small. */
  detail?: string;
};

/**
 * Writes one row to the `audit_logs` table. Never throws and never blocks the
 * caller: an audit write failing (table not created yet, key lacks
 * `documents.write`, Appwrite hiccup) must not turn a successful admin action
 * into an error the user sees.
 */
export async function writeAudit(env: Env, entry: AuditEntry): Promise<void> {
  const endpoint = env.PUBLIC_APPWRITE_ENDPOINT?.replace(/\/+$/, '');
  const projectId = env.PUBLIC_APPWRITE_PROJECT_ID;
  const apiKey = env.APPWRITE_API_KEY;
  if (!endpoint || !projectId || !apiKey) return;

  const data = {
    actorId: entry.actorId.slice(0, ACTOR_ID_MAX),
    actorEmail: entry.actorEmail.slice(0, ACTOR_EMAIL_MAX),
    action: entry.action.slice(0, ACTION_MAX),
    targetType: entry.targetType,
    targetId: entry.targetId.slice(0, TARGET_MAX),
    detail: (entry.detail ?? '').slice(0, DETAIL_MAX),
    createdAt: new Date().toISOString(),
  };

  try {
    await fetch(`${endpoint}/databases/${DATABASE_ID}/collections/${AUDIT_TABLE_ID}/documents`, {
      method: 'POST',
      headers: {
        'X-Appwrite-Project': projectId,
        'X-Appwrite-Key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        documentId: 'unique()',
        data,
        permissions: ['read("team:admins")'],
      }),
    });
  } catch {
    // Deliberately swallowed — see doc comment.
  }
}

/** Shared shape for the audit list endpoint. */
export type AuditRow = {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: string;
  createdAt: string;
};

export function auditRowToApi(row: {
  $id: string;
  actorId?: string | null;
  actorEmail?: string | null;
  action?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  detail?: string | null;
  createdAt?: string | null;
}): AuditRow {
  return {
    id: row.$id,
    actorId: row.actorId ?? '',
    actorEmail: row.actorEmail ?? '',
    action: row.action ?? '',
    targetType: row.targetType ?? '',
    targetId: row.targetId ?? '',
    detail: row.detail ?? '',
    createdAt: row.createdAt ?? '',
  };
}
