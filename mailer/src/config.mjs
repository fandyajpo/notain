/**
 * Everything this service reads from the environment, in one place.
 *
 * The service is deliberately configuration-thin: it owns the SMTP relay
 * credentials, the envelope sender and the shared token that Notain's Pages
 * Functions present. It does NOT own the product copy or the links — those
 * arrive in each request, because only the caller knows which origin a reset
 * link has to point at.
 */

/** SMTP transport security modes @sendust/ts accepts. Plaintext is not one. */
const SECURITY_MODES = new Set(['tls', 'starttls']);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Google's relay, and the everyday domains that use it.
 *
 * Gmail is the relay most small businesses actually have, and it needs no host
 * or port knowledge: an `@gmail.com` account IS `smtp.gmail.com`. Treating that
 * as the default is the difference between "fill in two lines" and "go read
 * Google's SMTP documentation" — so an @gmail.com / @googlemail.com
 * `SMTP_USER` supplies the host when `SMTP_HOST` is absent. A Workspace domain
 * (`@mycompany.com`, still `smtp.gmail.com`) keeps working by setting
 * `SMTP_HOST` explicitly.
 */
const GOOGLE_SMTP_HOST = 'smtp.gmail.com';
const GOOGLE_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/** The part after the last `@`, lowercased — `''` when there is no domain. */
function emailDomain(email) {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).toLowerCase();
}

/** Whether an address belongs to a domain Google gives a hosted mailbox. */
export function isGoogleAccount(email) {
  return GOOGLE_DOMAINS.has(emailDomain(email));
}

/** A misconfiguration must be loud at boot, not a 500 on the first real email. */
export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

function read(env, name) {
  const raw = env[name];
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * Resolves the runtime configuration.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {{ requireServiceToken?: boolean }} [options]
 *   The HTTP entry point requires the shared token (it is reachable from the
 *   internet); the Appwrite Function entry point does not, because Appwrite
 *   itself decides who may execute the function.
 */
export function loadConfig(env = process.env, options = {}) {
  const { requireServiceToken = true } = options;

  const user = read(env, 'SMTP_USER');
  const rawPass = read(env, 'SMTP_PASS');
  if ((user === '') !== (rawPass === '')) {
    throw new ConfigError('SMTP_USER dan SMTP_PASS harus diisi bersama, atau dikosongkan bersama.');
  }

  // The one piece of host knowledge this service lets you skip: a Gmail account
  // implies Google's relay. Everything else must name its host.
  const host = read(env, 'SMTP_HOST') || (isGoogleAccount(user) ? GOOGLE_SMTP_HOST : '');
  if (host === '') {
    throw new ConfigError(
      'SMTP_HOST belum diisi. Untuk Gmail cukup isi SMTP_USER (@gmail.com) dan SMTP_PASS; ' +
        'relay lain harus menyebut SMTP_HOST-nya.',
    );
  }
  const googleRelay = host.toLowerCase() === GOOGLE_SMTP_HOST;

  const rawPort = read(env, 'SMTP_PORT') || '465';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new ConfigError(`SMTP_PORT tidak valid: ${rawPort}`);
  }

  // 465 is implicit TLS, 587 is STARTTLS. Defaulting from the port keeps the
  // common relay profiles working with two variables instead of three.
  const rawSecurity = read(env, 'SMTP_SECURITY') || (port === 587 ? 'starttls' : 'tls');
  if (!SECURITY_MODES.has(rawSecurity)) {
    throw new ConfigError(`SMTP_SECURITY harus 'tls' atau 'starttls', bukan '${rawSecurity}'.`);
  }

  // Google displays app passwords in four groups ("abcd efgh ijkl mnop") and
  // rejects the spaces. Normalising that one shape is kinder than making
  // someone retype a credential Google already made awkward.
  const pass = googleRelay ? rawPass.replace(/\s+/g, '') : rawPass;

  // Google accepts only the authenticated address — or a verified "Send mail
  // as" alias — in `From`, so the sender defaults to the account instead of
  // demanding a fourth line everyone would fill in with the same value.
  const fromEmail = read(env, 'MAIL_FROM') || user;
  if (!EMAIL_PATTERN.test(fromEmail)) {
    throw new ConfigError(
      'MAIL_FROM belum diisi dengan alamat email yang valid (dan SMTP_USER kosong, jadi tidak ada nilai bawaan).',
    );
  }

  const warnings = [];
  if (googleRelay) {
    if (user === '') {
      throw new ConfigError('Relay Google butuh SMTP_USER: alamat akun yang mengirim.');
    }
    if (pass === '') {
      throw new ConfigError(
        'SMTP_PASS kosong. Google menolak kata sandi akun biasa — buat App Password ' +
          '(https://myaccount.google.com/apppasswords) dan isi 16 karakternya.',
      );
    }
    if (pass.length !== 16) {
      warnings.push(
        'SMTP_PASS bukan 16 karakter. App Password Google selalu 16 karakter; kata sandi akun ' +
          'biasa akan ditolak relay dengan 535.',
      );
    }
    // Strictly the account address, not just its domain: a different local part
    // on the same domain is still something Google will rewrite unless it is a
    // verified alias.
    if (fromEmail.toLowerCase() !== user.toLowerCase()) {
      warnings.push(
        `MAIL_FROM (${fromEmail}) bukan alamat SMTP_USER (${user}). Google hanya ` +
          'mengizinkan alamat akun itu atau alias "Send mail as" yang sudah diverifikasi.',
      );
    }
  } else if (emailDomain(fromEmail) !== emailDomain(user) && user !== '') {
    // Not fatal — plenty of relays legitimately send for another domain — but
    // it is the most common cause of "the mail arrives from the wrong address".
    warnings.push(
      `MAIL_FROM (${fromEmail}) bukan alamat SMTP_USER (${user}); pastikan relay mengizinkannya.`,
    );
  }

  const serviceToken = read(env, 'MAIL_SERVICE_TOKEN');
  if (requireServiceToken && serviceToken.length < 32) {
    throw new ConfigError(
      'MAIL_SERVICE_TOKEN wajib diisi minimal 32 karakter (token acak, bukan kata sandi).',
    );
  }

  const rawHttpPort = read(env, 'PORT') || '8080';
  const httpPort = Number(rawHttpPort);
  if (!Number.isInteger(httpPort) || httpPort < 1 || httpPort > 65_535) {
    throw new ConfigError(`PORT tidak valid: ${rawHttpPort}`);
  }

  return {
    smtp: {
      host,
      port,
      secure: rawSecurity,
      // A relay that trusts this host by IP needs no auth at all.
      auth: user === '' ? null : { user, pass },
    },
    from: { email: fromEmail },
    appName: read(env, 'MAIL_APP_NAME') || 'Notain',
    /** Optional logo URL for the header; omitted rather than broken when unset. */
    logoUrl: read(env, 'MAIL_LOGO_URL'),
    serviceToken,
    httpPort,
    /**
     * Things that work but probably will not do what the operator expects
     * (a non-Google-shaped app password, a From domain Google will rewrite).
     * Logged at boot; never fatal, because a warning is not a reason to refuse
     * to start.
     */
    warnings,
  };
}
