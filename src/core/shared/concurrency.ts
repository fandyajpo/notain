/**
 * Runs `task` over `items` with at most `limit` in flight at once.
 *
 * A tiny inline pool rather than a dependency: the whole app is one small
 * static bundle, and bulk deletes/imports are the only callers. Five is a
 * deliberate middle ground — enough to hide per-row latency, low enough to
 * stay under the Appwrite rate limiter, which punishes a parallel burst far
 * more than the extra round-trips cost.
 */
export async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await task(items[index] as T);
    }
  });
  await Promise.all(workers);
}
