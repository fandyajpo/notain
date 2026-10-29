import { isSubscriptionActive } from '../../src/core/billing/plans';
import { isAdminUser } from './admin';
import { getRow, type TableAuth } from './rows';
import type { Env } from './types';

/**
 * Does this caller's organization currently carry a paid plan? The one
 * place resource-level entitlement gates ask, so every 402 in the product
 * reads the plan the same way (`isSubscriptionActive`, expiry-aware).
 *
 * Admins always pass: plan limits are the product's boundary for customers,
 * not for the operators running it (the same exemption the invoice quota
 * and org-create gates apply).
 */
export async function orgHasPaidPlan(
  auth: TableAuth,
  orgId: string,
  callerUserId: string,
  env: Env,
): Promise<boolean> {
  if (await isAdminUser(callerUserId, env)) return true;
  const org = await getRow(auth, 'organizations', orgId, env);
  if (!org) return false;
  return isSubscriptionActive(
    typeof org.plan === 'string' ? org.plan : 'free',
    typeof org.planExpiresAt === 'string' ? org.planExpiresAt : null,
  );
}

/**
 * Message the custom-template 402 carries — one copy, written down once.
 * Custom templates (own block order, colors, branding — the Pro page's
 * "Template kustom" line) are what this gate protects on create and update.
 */
export const TEMPLATE_PRO_MESSAGE =
  'Template kustom adalah fitur plan Pro. Pakai template bawaan, atau upgrade ke Pro untuk membuat dan mengubah template sendiri — urutan blok, warna, dan branding.';
