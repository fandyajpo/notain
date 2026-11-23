/**
 * Request validation and dispatch — the only place that decides what a valid
 * send request looks like.
 *
 * Nothing here imports @sendust/ts: the transport is injected (`deliver`), so
 * this module and its tests run before any native dependency is installed, and
 * a change to the SMTP library cannot change what the HTTP surface accepts.
 */

import {
  invoiceMessage,
  passwordResetMessage,
  welcomeMessage,
  MESSAGE_TYPES,
} from './messages.mjs';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_TYPES = new Set(MESSAGE_TYPES);

const LIMITS = {
  email: 254,
  name: 120,
  invoiceNumber: 64,
  businessName: 160,
  note: 1_000,
  url: 2_048,
};

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isEmail(value) {
  return value !== '' && value.length <= LIMITS.email && EMAIL_PATTERN.test(value);
}

/** Only absolute http(s) URLs: a reset link must never become `javascript:`. */
function httpUrl(value) {
  const raw = text(value, LIMITS.url);
  if (raw === '') return '';
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function positiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * @returns {{ ok: true, value: Record<string, unknown> } | { ok: false, message: string }}
 */
export function parseRequest(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, message: 'Body harus berupa objek JSON.' };
  }

  const body = /** @type {Record<string, unknown>} */ (raw);
  const type = text(body.type, 32);
  if (!VALID_TYPES.has(type)) {
    return { ok: false, message: `type harus salah satu dari: ${MESSAGE_TYPES.join(', ')}.` };
  }

  const to = text(body.to, LIMITS.email);
  if (!isEmail(to)) return { ok: false, message: 'Alamat email penerima tidak valid.' };

  if (type === 'welcome') {
    const loginUrl = httpUrl(body.loginUrl);
    if (loginUrl === '') return { ok: false, message: 'loginUrl tidak valid.' };
    return {
      ok: true,
      value: { type, to, name: text(body.name, LIMITS.name), loginUrl },
    };
  }

  if (type === 'password-reset') {
    const resetUrl = httpUrl(body.resetUrl);
    if (resetUrl === '') return { ok: false, message: 'resetUrl tidak valid.' };
    const rawExpiry = positiveNumber(body.expiresMinutes);
    return {
      ok: true,
      value: {
        type,
        to,
        name: text(body.name, LIMITS.name),
        resetUrl,
        expiresMinutes: rawExpiry === null ? 30 : Math.min(Math.max(rawExpiry, 5), 24 * 60),
      },
    };
  }

  // type === 'invoice'
  const invoiceUrl = httpUrl(body.invoiceUrl);
  if (invoiceUrl === '') return { ok: false, message: 'invoiceUrl tidak valid.' };
  const invoiceNumber = text(body.invoiceNumber, LIMITS.invoiceNumber);
  if (invoiceNumber === '') return { ok: false, message: 'invoiceNumber wajib diisi.' };
  const total = positiveNumber(body.total);
  if (total === null) return { ok: false, message: 'total harus angka.' };

  return {
    ok: true,
    value: {
      type,
      to,
      customerName: text(body.customerName, LIMITS.name),
      invoiceNumber,
      businessName: text(body.businessName, LIMITS.businessName),
      total,
      date: text(body.date, 32),
      dueDate: text(body.dueDate, 32),
      note: text(body.note, LIMITS.note),
      invoiceUrl,
      senderName: text(body.senderName, LIMITS.name),
    },
  };
}

/** Turns a validated request into the message handed to the transport. */
export function messageFor(value, config) {
  const shared = { appName: config.appName, logoUrl: config.logoUrl };

  if (value.type === 'welcome') {
    return welcomeMessage({ ...shared, to: value.to, name: value.name, loginUrl: value.loginUrl });
  }
  if (value.type === 'password-reset') {
    return passwordResetMessage({
      ...shared,
      to: value.to,
      name: value.name,
      resetUrl: value.resetUrl,
      expiresMinutes: value.expiresMinutes,
    });
  }
  return invoiceMessage({
    ...shared,
    to: value.to,
    customerName: value.customerName,
    invoiceNumber: value.invoiceNumber,
    businessName: value.businessName,
    total: value.total,
    date: value.date,
    dueDate: value.dueDate,
    note: value.note,
    invoiceUrl: value.invoiceUrl,
    senderName: value.senderName,
  });
}

/**
 * Validation + send, returning an HTTP-shaped answer.
 *
 * `deliver` is `(message) => Promise<{ status: 'accepted' | 'rejected' | 'unknown' }>`.
 * A `rejected`/`unknown` reply is a 502 for the caller: the relay did not take
 * responsibility, so Notain may say so instead of claiming the mail went out.
 *
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
export async function handleSend(raw, { config, deliver }) {
  const parsed = parseRequest(raw);
  if (!parsed.ok) {
    return { status: 400, body: { error: 'validation', message: parsed.message } };
  }

  let result;
  try {
    result = await deliver(messageFor(parsed.value, config));
  } catch (cause) {
    const code = cause && typeof cause.code === 'string' ? ` [${cause.code}]` : '';
    return {
      status: 502,
      body: { error: 'unavailable', message: `Relay email gagal${code}.` },
    };
  }

  if (result && result.status === 'accepted') {
    return { status: 200, body: { ok: true, status: 'accepted' } };
  }
  return {
    status: 502,
    body: {
      error: 'unavailable',
      message: `Relay email tidak menerima pesan (${result?.status ?? 'unknown'}).`,
    },
  };
}
