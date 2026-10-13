/**
 * Rules a logo file has to satisfy.
 *
 * Shared on purpose: the browser checks them before uploading so a user gets
 * instant feedback, and the Pages Function in `functions/api/` checks them
 * again because anything a browser enforces is only advisory. Keep this module
 * free of Appwrite, React and `import.meta` — it is bundled into a Worker.
 */

/** Hard ceiling. Larger uploads are rejected by client and server alike. */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** MIME types `<input accept>` advertises and the browser validates against. */
export const LOGO_ALLOWED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'image/webp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
] as const;

/**
 * Extension → content type for what the server will store.
 *
 * Derived from the file *name* rather than the browser-supplied `File.type`,
 * because the stored `Content-Type` is what the response is served with and
 * that must never be attacker-chosen. Every value here is also in
 * `LOGO_ALLOWED_TYPES`.
 */
export const LOGO_CONTENT_TYPE_BY_EXT: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  ico: 'image/x-icon',
};

/** Lowercase extension of `fileName`, or `null` when it is not a logo type. */
export function logoExtension(fileName: string): string | null {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return null;
  const ext = fileName.slice(dot + 1).toLowerCase();
  return Object.hasOwn(LOGO_CONTENT_TYPE_BY_EXT, ext) ? ext : null;
}
