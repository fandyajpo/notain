/**
 * Allowlist HTML sanitizer for the rich-text sections (header, content, footer).
 *
 * Section HTML is stored in Appwrite and rendered with
 * `dangerouslySetInnerHTML`, so it is not trusted just because the editor that
 * normally produces it is well behaved: a row can be written by any client, or
 * edited directly in the console.
 *
 * Design notes:
 *
 * - **No DOM dependency.** `InvoicePreview` is server-rendered on the landing
 *   page, so `DOMParser` is not available at build time. This is plain string
 *   processing and behaves identically in Node and the browser, which also
 *   keeps the rendered markup from differing between the two.
 * - **Nothing attacker-controlled is echoed as markup.** Tag names and
 *   attribute names are copied from our own allowlists, never from the input,
 *   and every piece of text and every attribute value is escaped on the way
 *   out. An imperfect tokenizer can therefore only produce odd text, never a
 *   tag we did not intend to allow.
 * - **Unknown elements are unwrapped, not kept.** Their children survive with
 *   the element's own attributes discarded, so `<div onclick=…>` loses the
 *   handler without losing the paragraph inside it. Elements whose content
 *   cannot be rendered safely at all are dropped together with their children.
 */

/** Elements that may appear, matching what TipTap's StarterKit can emit. */
const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'b',
  'em',
  'i',
  's',
  'strike',
  'del',
  'u',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'a',
]);

/** Elements with no end tag. */
const VOID_TAGS = new Set(['br', 'hr']);

/** Attributes each tag may keep. Anything else — class, style, id, handlers — is dropped. */
const ALLOWED_ATTRS: Record<string, ReadonlySet<string>> = {
  ol: new Set(['start']),
  a: new Set(['href']),
};

/**
 * Elements dropped together with their contents.
 *
 * Only non-void elements belong here: a void element has no children, so
 * treating one as a container would make the sanitizer skip everything after
 * it. `<img>`, `<input>`, `<meta>` and friends are removed by the ordinary
 * "not on the allowlist" path instead, which has the same effect.
 */
const DROP_WITH_CONTENT = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'noscript',
  'template',
  'textarea',
  'title',
  'svg',
  'math',
  'canvas',
  'video',
  'audio',
  'picture',
  'form',
  'select',
  'button',
  'frameset',
  'applet',
  'marquee',
  'noembed',
  'noframes',
]);

const SAFE_HREF_SCHEMES = /^(?:https?|mailto):/i;

type Token =
  | { kind: 'text'; value: string }
  | { kind: 'open'; name: string; attrs: string }
  | { kind: 'close'; name: string };

/**
 * Returns HTML that contains only allowlisted markup, or an empty string when
 * the input is not a string.
 */
export function sanitizeRichHtml(html: unknown): string {
  if (typeof html !== 'string' || html === '') return '';

  const out: string[] = [];
  const openStack: string[] = [];
  let skipUntil: string | null = null;
  let skipDepth = 0;

  for (const token of tokenize(html)) {
    if (skipUntil !== null) {
      if (token.kind === 'open' && token.name === skipUntil) {
        skipDepth += 1;
      } else if (token.kind === 'close' && token.name === skipUntil) {
        skipDepth -= 1;
        if (skipDepth === 0) skipUntil = null;
      }
      continue;
    }

    if (token.kind === 'text') {
      out.push(escapeText(decodeEntities(token.value)));
      continue;
    }

    if (token.kind === 'close') {
      // Tolerate unclosed tags the way a browser would: unwind to the nearest
      // matching open element and ignore a close with nothing open behind it.
      const index = openStack.lastIndexOf(token.name);
      if (index === -1) continue;
      while (openStack.length > index) {
        out.push(`</${openStack.pop() ?? ''}>`);
      }
      continue;
    }

    if (DROP_WITH_CONTENT.has(token.name)) {
      skipUntil = token.name;
      skipDepth = 1;
      continue;
    }

    if (!ALLOWED_TAGS.has(token.name)) continue;

    const rendered = `<${token.name}${renderAttrs(token.name, token.attrs)}>`;
    out.push(rendered);
    if (!VOID_TAGS.has(token.name)) openStack.push(token.name);
  }

  while (openStack.length > 0) {
    out.push(`</${openStack.pop() ?? ''}>`);
  }

  return out.join('');
}

/**
 * Splits HTML into text, open-tag and close-tag tokens.
 *
 * Comments, doctypes, CDATA and processing instructions are dropped without a
 * token — they cannot appear in output we build ourselves. A `<` that does not
 * start a tag is emitted as literal text and escaped by the caller.
 */
function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < html.length) {
    const lt = html.indexOf('<', index);
    if (lt === -1) {
      tokens.push({ kind: 'text', value: html.slice(index) });
      break;
    }
    if (lt > index) tokens.push({ kind: 'text', value: html.slice(index, lt) });

    const rest = html.slice(lt);

    if (rest.startsWith('<!--')) {
      const end = html.indexOf('-->', lt + 4);
      index = end === -1 ? html.length : end + 3;
      continue;
    }

    if (rest.startsWith('<!') || rest.startsWith('<?')) {
      const end = html.indexOf('>', lt + 2);
      index = end === -1 ? html.length : end + 1;
      continue;
    }

    // No whitespace is allowed between "<" and the tag name: "< b" is literal
    // text to a browser, and treating it as a tag would swallow real content.
    const close = /^<\/([a-zA-Z][^\s/>]*)\s*>/.exec(rest);
    if (close) {
      tokens.push({ kind: 'close', name: close[1].toLowerCase() });
      index = lt + close[0].length;
      continue;
    }

    const open = /^<([a-zA-Z][^\s/>]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/.exec(rest);
    if (open) {
      tokens.push({ kind: 'open', name: open[1].toLowerCase(), attrs: open[2] ?? '' });
      index = lt + open[0].length;
      continue;
    }

    tokens.push({ kind: 'text', value: '<' });
    index = lt + 1;
  }

  return tokens;
}

function parseAttrs(raw: string): Array<{ name: string; value: string }> {
  const found: Array<{ name: string; value: string }> = [];
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    let value = match[2] ?? '';
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'")) {
      value = value.slice(1, -1);
    }
    found.push({ name: match[1].toLowerCase(), value: decodeEntities(value) });
  }

  return found;
}

function renderAttrs(tag: string, raw: string): string {
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed) return '';

  const rendered: string[] = [];

  for (const { name, value } of parseAttrs(raw)) {
    if (!allowed.has(name)) continue;

    if (name === 'start') {
      const start = Number.parseInt(value, 10);
      if (!Number.isSafeInteger(start)) continue;
      rendered.push(` start="${escapeAttr(String(start))}"`);
      continue;
    }

    if (name === 'href') {
      const href = safeHref(value);
      if (href === null) continue;
      rendered.push(` href="${escapeAttr(href)}"`);
    }
  }

  return rendered.join('');
}

/**
 * Validates a link target, returning a cleaned value or `null` to drop it.
 *
 * The scheme is read from the *decoded* value so character references cannot
 * smuggle `javascript:` past the check, and the value that goes back into the
 * markup is the cleaned one — never the original — so control characters a
 * browser might ignore cannot reintroduce it.
 */
function safeHref(value: string): string | null {
  // Browsers ignore tab, newline and other control characters while parsing a
  // URL, so they are the usual way to spell `java\tscript:`. Strip them before
  // reading the scheme, and hand back the cleaned value — never the original.
  const cleaned = value.replace(/\p{C}/gu, '').trim();
  if (cleaned === '') return null;
  if (!SAFE_HREF_SCHEMES.test(cleaned)) {
    // A URL with no scheme at all (a path or a fragment) is harmless; one with
    // a scheme we do not recognise — javascript:, data:, vbscript: — is not.
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(cleaned)) return null;
  }
  return cleaned;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

/**
 * Resolves character references so a value can be inspected as the browser
 * would read it, and so a literal `&` in an author's text round-trips through
 * `escapeText` without being double-encoded.
 */
function decodeEntities(value: string): string {
  if (!value.includes('&')) return value;

  return value.replace(
    /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));?/g,
    (whole, decimal: string | undefined, hex: string | undefined, named: string | undefined) => {
      if (decimal !== undefined) return codePoint(Number.parseInt(decimal, 10), whole);
      if (hex !== undefined) return codePoint(Number.parseInt(hex, 16), whole);
      const mapped = named === undefined ? undefined : NAMED_ENTITIES[named];
      return mapped === undefined ? whole : mapped;
    },
  );
}

function codePoint(code: number, fallback: string): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return fallback;
  // Lone surrogates are not valid code points and cannot be serialized.
  if (code >= 0xd800 && code <= 0xdfff) return '';
  return String.fromCodePoint(code);
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}
