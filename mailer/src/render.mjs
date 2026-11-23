/**
 * The shared email chrome: one layout, rendered twice (HTML and plain text).
 *
 * Email clients are a hostile rendering target, so the HTML is deliberately
 * boring: inline styles, no external CSS, no web fonts, no images unless the
 * operator configured a logo, and tables only where a client would otherwise
 * collapse a two-column row. Everything interpolated is escaped — a customer
 * name is user input, and it lands in a message sent to someone else.
 */

const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const BODY_FONT =
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** `1250000` → `Rp1.250.000` — Indonesian grouping, no decimals. */
export function formatRupiah(value) {
  const amount = Number.isFinite(value) ? Math.round(value) : 0;
  const sign = amount < 0 ? '-' : '';
  const digits = String(Math.abs(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}Rp${digits}`;
}

/**
 * `2026-10-08` → `8 Oktober 2026`.
 *
 * Parsed by splitting, never through `Date`: a half-open ISO date is midnight
 * UTC, and rendering it in the server's local zone would silently move the day
 * backwards for every invoice issued in the first hours of the month.
 */
export function formatDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof value === 'string' ? value : '');
  if (!match) return '';
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return '';
  return `${Number(match[3])} ${month} ${match[1]}`;
}

/**
 * @param {{
 *   appName: string,
 *   logoUrl?: string,
 *   heading: string,
 *   greeting?: string,
 *   paragraphs?: string[],
 *   facts?: Array<{ label: string, value: string }>,
 *   cta?: { label: string, url: string, hint?: string },
 *   footnote?: string,
 * }} input
 * @returns {{ html: string, text: string }}
 */
export function renderEmail(input) {
  const { appName, logoUrl, heading, greeting, paragraphs = [], facts = [], cta, footnote } = input;

  const brand = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="" width="28" height="28" style="display:block;border-radius:6px">`
    : '';
  // Text-only when no logo URL is configured: an image a client refuses to load
  // is worse than no image, and the name still identifies the sender.
  const header = `<div style="margin:0 0 24px;${BODY_FONT};font-size:15px;font-weight:600;color:#111827">${brand}${
    brand ? '<div style="height:8px"></div>' : ''
  }${escapeHtml(appName)}</div>`;

  const greetingHtml = greeting
    ? `<p style="margin:0 0 12px;${BODY_FONT};font-size:15px;line-height:1.6;color:#111827">${escapeHtml(greeting)}</p>`
    : '';

  const paragraphsHtml = paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 12px;${BODY_FONT};font-size:15px;line-height:1.6;color:#374151">${escapeHtml(text)}</p>`,
    )
    .join('');

  const factsHtml =
    facts.length === 0
      ? ''
      : `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:20px 0;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb">${facts
          .map(
            (fact) =>
              `<tr><td style="padding:8px 0;${BODY_FONT};font-size:13px;color:#6b7280">${escapeHtml(fact.label)}</td><td align="right" style="padding:8px 0;${BODY_FONT};font-size:14px;font-weight:600;color:#111827">${escapeHtml(fact.value)}</td></tr>`,
          )
          .join('')}</table>`;

  const ctaHtml = cta
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#111827;color:#ffffff;${BODY_FONT};font-size:15px;font-weight:600;text-decoration:none">${escapeHtml(cta.label)}</a></p>${
        cta.hint
          ? `<p style="margin:16px 0 0;${BODY_FONT};font-size:12px;line-height:1.6;color:#6b7280">${escapeHtml(cta.hint)}</p><p style="margin:6px 0 0;${BODY_FONT};font-size:12px;line-height:1.6;color:#6b7280;word-break:break-all">${escapeHtml(cta.url)}</p>`
          : ''
      }`
    : '';

  const footnoteHtml = footnote
    ? `<p style="margin:28px 0 0;padding-top:16px;border-top:1px solid #e5e7eb;${BODY_FONT};font-size:12px;line-height:1.6;color:#6b7280">${escapeHtml(footnote)}</p>`
    : '';

  const html = `<!doctype html>
<html lang="id">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(heading)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f3f4f6;padding:32px 12px">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px">
<tr><td style="padding:28px 28px 32px">
${header}
<h1 style="margin:0 0 16px;${BODY_FONT};font-size:20px;line-height:1.4;color:#111827">${escapeHtml(heading)}</h1>
${greetingHtml}
${paragraphsHtml}
${factsHtml}
${ctaHtml}
${footnoteHtml}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    appName,
    '',
    heading,
    greeting ? `\n${greeting}` : '',
    ...paragraphs.map((text_) => `\n${text_}`),
    facts.length > 0 ? `\n${facts.map((fact) => `${fact.label}: ${fact.value}`).join('\n')}` : '',
    cta ? `\n${cta.label}: ${cta.url}` : '',
    footnote ? `\n${footnote}` : '',
  ]
    .filter((line) => line !== '')
    .join('\n');

  return { html, text };
}
