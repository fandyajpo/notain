import { getActiveOrgGeneration, getActiveOrgId } from '../../app/active-org';
import { AppError, ERROR_CODES } from '../../core/shared/errors';

export type OrgMutationContext = Readonly<{
  orgId: string | null;
  generation: number;
}>;

const contextsByVariables = new WeakMap<object, OrgMutationContext[]>();

/** Captures the tenant context that owns a mutation's request and cache callbacks. */
export function captureOrgMutationContext(variables?: unknown): OrgMutationContext {
  const context = {
    orgId: getActiveOrgId(),
    generation: getActiveOrgGeneration(),
  };
  if (typeof variables === 'object' && variables !== null) {
    const pending = contextsByVariables.get(variables) ?? [];
    pending.push(context);
    contextsByVariables.set(variables, pending);
  }
  return context;
}

/** Refuses to start a request after its captured organization has changed. */
export function assertOrgMutationCurrent(variables: unknown): OrgMutationContext | undefined {
  if (typeof variables !== 'object' || variables === null) return undefined;
  const pending = contextsByVariables.get(variables);
  const context = pending?.shift();
  if (pending?.length === 0) contextsByVariables.delete(variables);
  assertOrgContextCurrent(context);
  return context;
}

/** Rechecks a captured context after an awaited step in a mutation. */
export function assertOrgContextCurrent(context: OrgMutationContext | undefined): void {
  if (context && !isCurrentOrgMutation(context)) {
    throw new AppError(ERROR_CODES.CONFLICT, 'Organisasi aktif berubah. Coba ulang tindakan ini.');
  }
}

/** Prevents a late mutation from restoring or writing data after an org switch. */
export function isCurrentOrgMutation(
  context: OrgMutationContext | null | undefined,
): context is OrgMutationContext {
  return (
    context !== null &&
    context !== undefined &&
    context.orgId === getActiveOrgId() &&
    context.generation === getActiveOrgGeneration()
  );
}
