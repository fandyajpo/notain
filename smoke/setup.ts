/**
 * Reproduces the browser environment the Appwrite Web SDK expects.
 *
 * `Client.ensureClient()` refuses to construct outside `window`, and sessions
 * are handed back to the origin through an `X-Fallback-Cookies` header that the
 * SDK stores in `localStorage`. Shimming both lets the smoke test exercise the
 * exact same cross-origin session path a real browser uses against Cloud.
 */
const store = new Map<string, string>();

const localStorage = {
  get length(): number {
    return store.size;
  },
  key: (index: number) => [...store.keys()][index] ?? null,
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, String(value)),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
};

const globals = globalThis as unknown as Record<string, unknown>;
globals.localStorage = localStorage;
globals.window = globalThis;
globals.location = {
  host: 'localhost:4321',
  origin: 'http://localhost:4321',
  href: 'http://localhost:4321/',
};

export {};
