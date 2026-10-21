/**
 * How a failed call reaches the UI.
 *
 * Normalising an SDK exception into an `AppError` needs to know what that
 * exception looks like, so the implementation stays with the adapter in
 * `src/appwrite/errors.ts`. This module is the seam above it: components and
 * the query layer import error handling from here, never from the adapter —
 * the shape of the SDK is not something a component is allowed to know.
 */
import { toAppError } from '../appwrite/errors';

export {
  appErrorFromStatus,
  isRateLimited,
  isUnauthenticated,
  toAppError,
} from '../appwrite/errors';

/**
 * Field-keyed validation messages on an error, or `null` when the failure was
 * not a validation one (duplicate, network, storage) and so has no field to
 * attach a message to.
 *
 * Lives here rather than next to either caller because it is the same rule
 * for every form in the app: `AppError.fieldErrors` already holds the map,
 * and an empty one means "not a field problem".
 */
export function takeFieldErrors(error: unknown): Record<string, string> | null {
  const fields = toAppError(error).fieldErrors;
  return Object.keys(fields).length > 0 ? { ...fields } : null;
}
