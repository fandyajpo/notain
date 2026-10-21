/**
 * DOKU Checkout (hosted payment page) — request signing, payload building and
 * notification verification, per the official non-SNAP docs:
 *
 * - Create:   POST https://api-sandbox.doku.com/checkout/v1/payment
 * - Signature components (one label per line, no trailing newline):
 *     Client-Id:{clientId}
 *     Request-Id:{requestId}
 *     Request-Timestamp:{utcIso8601}
 *     Request-Target:{request path}
 *     Digest:{base64(sha256(rawBody))}          ← omitted for GET
 *   then Base64 HMAC-SHA256 of that string with the Back Office **Secret
 *   Key**, sent as `Signature: HMACSHA256=…`.
 * - Notifications carry the same headers; Request-Target is the path of our
 *   notification URL. Body must be parsed non-strictly (new fields appear).
 *   Per DOKU: Checkout integrations must IGNORE `transaction.status=FAILED`
 *   (the customer may switch payment method inside one checkout session).
 *
 * Sources:
 * https://developers.doku.com/accept-payments/doku-checkout/integration-guide/backend-integration
 * https://developers.doku.com/get-started-with-doku-api/signature-component/non-snap/signature-component-from-request-header
 * https://developers.doku.com/get-started-with-doku-api/notification/best-practice
 */

/** Sandbox only. Production (`https://api.doku.com`) is deliberately absent. */
export const DOKU_CHECKOUT_ENDPOINT = 'https://api-sandbox.doku.com/checkout/v1/payment';

export const DOKU_SIGNATURE_PREFIX = 'HMACSHA256=';

const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** UTC ISO 8601 with `Z`, seconds precision — the format DOKU samples use. */
export function utcTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Base64-encoded SHA-256 of the exact bytes sent on the wire. */
export async function requestDigest(rawBody: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(rawBody));
  return bytesToBase64(new Uint8Array(hash));
}

/**
 * The canonical component string. `digest` is omitted for GET requests (no
 * body), exactly as documented for the Check Status API.
 */
export function signatureComponents(input: {
  clientId: string;
  requestId: string;
  timestamp: string;
  target: string;
  digest?: string;
}): string {
  const lines = [
    `Client-Id:${input.clientId}`,
    `Request-Id:${input.requestId}`,
    `Request-Timestamp:${input.timestamp}`,
    `Request-Target:${input.target}`,
  ];
  if (input.digest !== undefined) lines.push(`Digest:${input.digest}`);
  return lines.join('\n');
}

async function hmacSha256Base64(secretKey: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return bytesToBase64(new Uint8Array(signature));
}

/** Full `Signature` header value for an outgoing request. */
export async function signRequest(input: {
  secretKey: string;
  clientId: string;
  requestId: string;
  timestamp: string;
  target: string;
  rawBody?: string;
}): Promise<string> {
  const digest = input.rawBody === undefined ? undefined : await requestDigest(input.rawBody);
  const components = signatureComponents({
    clientId: input.clientId,
    requestId: input.requestId,
    timestamp: input.timestamp,
    target: input.target,
    digest,
  });
  return DOKU_SIGNATURE_PREFIX + (await hmacSha256Base64(input.secretKey, components));
}

/**
 * Constant-time comparison of an expected signature with the one a
 * notification carried. Length is not secret (both are fixed-format base64);
 * the content comparison itself leaks nothing per-character.
 */
export function signatureMatches(expected: string, received: string): boolean {
  if (expected.length !== received.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verifies a DOKU HTTP notification's authenticity. `requestTarget` is the
 * path of *our* notification URL (what DOKU posted to), `rawBody` the exact
 * bytes received — the digest covers them, so a re-serialized JSON body
 * would fail.
 */
export async function verifyNotificationSignature(input: {
  secretKey: string;
  expectedClientId: string;
  requestTarget: string;
  rawBody: string;
  clientIdHeader: string | null;
  requestIdHeader: string | null;
  timestampHeader: string | null;
  signatureHeader: string | null;
}): Promise<boolean> {
  const clientId = input.clientIdHeader;
  const requestId = input.requestIdHeader;
  const timestamp = input.timestampHeader;
  const signature = input.signatureHeader;
  if (!clientId || !requestId || !timestamp || !signature) return false;
  // A notification addressed to another merchant must not verify here.
  if (!signatureMatches(input.expectedClientId, clientId)) return false;

  const received = signature.startsWith(DOKU_SIGNATURE_PREFIX)
    ? signature.slice(DOKU_SIGNATURE_PREFIX.length)
    : signature;
  const expected = await signRequest({
    secretKey: input.secretKey,
    clientId,
    requestId,
    timestamp,
    target: input.requestTarget,
    rawBody: input.rawBody,
  }).then((value) => value.slice(DOKU_SIGNATURE_PREFIX.length));
  return signatureMatches(expected, received);
}

/* ------------------------------------------------------------------ *
 * Create-checkout payload (documented snake_case fields)
 * ------------------------------------------------------------------ */

export type CheckoutCustomer = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
};

export type CheckoutOrder = {
  amount: number;
  invoiceNumber: string;
  callbackUrl: string;
  /**
   * Where DOKU must POST HTTP notifications for this order. Set per-request
   * via the documented `additional_info.override_notification_url` so the
   * webhook target follows the origin that created the order.
   *
   * NB: DOKU only honours this override when a Notification URL is *also*
   * configured in the Back Office, and that configured path must equal this
   * one (`/api/payments/doku-notify`) — the domain may differ. See
   * docs/payments.md.
   */
  notificationUrl: string;
  customer: CheckoutCustomer;
  /** Minutes until the checkout page expires. Default is 60; kept explicit. */
  dueMinutes?: number;
};

/**
 * The create-checkout request body. Only documented fields are emitted;
 * amounts are whole IDR (no decimals) and `auto_redirect` is mandatory.
 */
export function buildCheckoutBody(order: CheckoutOrder): string {
  const customer: Record<string, string> = { id: order.customer.id };
  if (order.customer.name) customer.name = order.customer.name;
  if (order.customer.email) customer.email = order.customer.email;
  if (order.customer.phone) customer.phone = order.customer.phone;

  return JSON.stringify({
    order: {
      amount: order.amount,
      invoice_number: order.invoiceNumber,
      currency: 'IDR',
      callback_url: order.callbackUrl,
      auto_redirect: true,
    },
    payment: { payment_due_date: order.dueMinutes ?? 60 },
    customer,
    additional_info: { override_notification_url: order.notificationUrl },
  });
}

/** Parsed create-checkout response: the hosted page URL to redirect to. */
export type CheckoutResponse = {
  url: string;
  tokenId: string | null;
  expiredAt: string | null;
};

/**
 * Extracts `response.payment.url` from the create-checkout response. The
 * `expired_date` field is `yyyyMMddHHmmss` in UTC+7 and is converted to ISO.
 */
export function parseCheckoutResponse(raw: unknown): CheckoutResponse | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const payment = (raw as { response?: { payment?: unknown } }).response?.payment;
  if (typeof payment !== 'object' || payment === null) return null;
  const { url, token_id: tokenId, expired_date: expiredDate } = payment as {
    url?: unknown;
    token_id?: unknown;
    expired_date?: unknown;
  };
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return null;
  return {
    url,
    tokenId: typeof tokenId === 'string' ? tokenId : null,
    expiredAt: typeof expiredDate === 'string' ? parseExpiredDate(expiredDate) : null,
  };
}

/** `20261020143000` (UTC+7) → ISO string; `null` when unparseable. */
export function parseExpiredDate(value: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (!match) return null;
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+07:00`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/* ------------------------------------------------------------------ *
 * Notification body (non-strict parse)
 * ------------------------------------------------------------------ */

export type NotificationStatus =
  | 'SUCCESS'
  | 'FAILED'
  | 'PENDING'
  | 'EXPIRED'
  | 'REFUNDED'
  | 'TIMEOUT'
  | 'REDIRECT'
  | 'UNKNOWN';

const KNOWN_STATUSES: ReadonlySet<string> = new Set([
  'SUCCESS',
  'FAILED',
  'PENDING',
  'EXPIRED',
  'REFUNDED',
  'TIMEOUT',
  'REDIRECT',
]);

export type DokuNotification = {
  status: NotificationStatus;
  invoiceNumber: string | null;
  amount: number | null;
  transactionDate: string | null;
};

/**
 * Parses a notification (or Check Status) body without choking on fields we
 * don't know — DOKU extends these payloads over time and a strict parser
 * would turn every addition into an outage. Missing pieces come back `null`
 * so the caller decides; the signature check is what makes the body
 * trustworthy in the first place.
 */
export function parseNotification(raw: unknown): DokuNotification {
  if (typeof raw !== 'object' || raw === null) {
    return { status: 'UNKNOWN', invoiceNumber: null, amount: null, transactionDate: null };
  }
  const body = raw as {
    transaction?: { status?: unknown; date?: unknown };
    order?: { invoice_number?: unknown; amount?: unknown };
  };

  const rawStatus = typeof body.transaction?.status === 'string' ? body.transaction.status : '';
  const status = (KNOWN_STATUSES.has(rawStatus) ? rawStatus : 'UNKNOWN') as NotificationStatus;

  const invoiceNumber =
    typeof body.order?.invoice_number === 'string' ? body.order.invoice_number : null;
  const rawAmount = body.order?.amount;
  const amount = typeof rawAmount === 'number' && Number.isFinite(rawAmount) ? rawAmount : null;
  const transactionDate =
    typeof body.transaction?.date === 'string' ? body.transaction.date : null;

  return { status, invoiceNumber, amount, transactionDate };
}
