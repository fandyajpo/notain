/**
 * The one place a failed `/api/*` answer becomes copy a person reads.
 *
 * Every endpoint in this app answers `{ error, message }` on failure, and the
 * message is written next to the rule that refused — so the server's own copy
 * wins whenever it has one, and an endpoint without one falls back to the
 * caller's generic sentence.
 *
 * This lived as a private copy in nine modules. Four of them had already drifted
 * (`body?.message` in five, `body.message` in four) and one had dropped the
 * `undefined` return type, which is exactly the kind of difference nobody
 * notices until a screen prints "undefined".
 */

export async function serverMessage(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' ? body.message : undefined;
  } catch {
    // A body that is not JSON is not a message: the caller uses its own copy.
    return undefined;
  }
}
