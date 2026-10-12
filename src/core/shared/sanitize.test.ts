import { describe, expect, it } from 'vitest';
import { sanitizeRichHtml } from './sanitize';

describe('sanitizeRichHtml', () => {
  it('returns an empty string for non-string input', () => {
    expect(sanitizeRichHtml(null)).toBe('');
    expect(sanitizeRichHtml(undefined)).toBe('');
    expect(sanitizeRichHtml(42)).toBe('');
    expect(sanitizeRichHtml('')).toBe('');
  });

  it('keeps the markup TipTap can produce', () => {
    const html =
      '<h2>Judul</h2><p>Tebal <strong>biasa</strong> <em>miring</em> <s>coret</s> <u>bawah</u></p>' +
      '<ul><li>Satu</li><li>Dua</li></ul><ol start="3"><li>Tiga</li></ol>' +
      '<blockquote><p>Kutipan</p></blockquote><pre><code>code</code></pre><hr>';

    expect(sanitizeRichHtml(html)).toBe(html);
  });

  it('drops a script together with its contents', () => {
    expect(sanitizeRichHtml('<p>a</p><script>alert(1)</script><p>b</p>')).toBe('<p>a</p><p>b</p>');
  });

  it('drops style contents so injected CSS cannot restyle the page', () => {
    expect(sanitizeRichHtml('<style>body{display:none}</style><p>hi</p>')).toBe('<p>hi</p>');
  });

  it('removes an image and its onerror handler', () => {
    expect(sanitizeRichHtml('<p>a</p><img src=x onerror="alert(1)">')).toBe('<p>a</p>');
  });

  it('removes iframes along with whatever they embed', () => {
    expect(sanitizeRichHtml('<iframe src="https://evil.test"></iframe><p>ok</p>')).toBe(
      '<p>ok</p>',
    );
  });

  it('removes svg and math entirely, closing tags included', () => {
    expect(sanitizeRichHtml('<svg onload="alert(1)"><circle /></svg><p>ok</p>')).toBe('<p>ok</p>');
    expect(sanitizeRichHtml('<math><mtext>x</mtext></math><p>ok</p>')).toBe('<p>ok</p>');
  });

  it('unwraps an unknown element but keeps its children', () => {
    expect(sanitizeRichHtml('<div class="x" onclick="alert(1)"><p>isi</p></div>')).toBe(
      '<p>isi</p>',
    );
  });

  it('drops attributes the editor does not emit', () => {
    expect(sanitizeRichHtml('<p class="a" style="position:fixed" id="b">x</p>')).toBe('<p>x</p>');
  });

  it('rejects a javascript: link', () => {
    expect(sanitizeRichHtml('<a href="javascript:alert(1)">klik</a>')).toBe('<a>klik</a>');
    expect(sanitizeRichHtml('<a href="JaVaScRiPt:alert(1)">klik</a>')).toBe('<a>klik</a>');
    expect(sanitizeRichHtml('<a href="&#106;avascript:alert(1)">klik</a>')).toBe('<a>klik</a>');
    expect(sanitizeRichHtml('<a href="jav&#x09;ascript:alert(1)">klik</a>')).toBe('<a>klik</a>');
  });

  it('rejects data: and other unrecognised schemes', () => {
    expect(sanitizeRichHtml('<a href="data:text/html,<script>1</script>">x</a>')).toBe('<a>x</a>');
    expect(sanitizeRichHtml('<a href="vbscript:msgbox(1)">x</a>')).toBe('<a>x</a>');
  });

  it('keeps http, mailto and relative links', () => {
    expect(sanitizeRichHtml('<a href="https://notain.test/x?a=1&amp;b=2">x</a>')).toBe(
      '<a href="https://notain.test/x?a=1&amp;b=2">x</a>',
    );
    expect(sanitizeRichHtml('<a href="mailto:a@b.test">x</a>')).toBe(
      '<a href="mailto:a@b.test">x</a>',
    );
    expect(sanitizeRichHtml('<a href="/invoice/new">x</a>')).toBe('<a href="/invoice/new">x</a>');
    expect(sanitizeRichHtml('<a href="#bagian">x</a>')).toBe('<a href="#bagian">x</a>');
  });

  it('only keeps an integer start on ordered lists', () => {
    expect(sanitizeRichHtml('<ol start="3"><li>x</li></ol>')).toBe('<ol start="3"><li>x</li></ol>');
    expect(sanitizeRichHtml('<ol start="abc"><li>x</li></ol>')).toBe('<ol><li>x</li></ol>');
    expect(sanitizeRichHtml('<ol start="99999999999999999999"><li>x</li></ol>')).toBe(
      '<ol><li>x</li></ol>',
    );
  });

  it('escapes markup hiding in text', () => {
    expect(sanitizeRichHtml('<p>5 < 6 and 7 > 6</p>')).toBe('<p>5 &lt; 6 and 7 &gt; 6</p>');
    expect(sanitizeRichHtml('<p>&lt;img src=x onerror=alert(1)&gt;</p>')).toBe(
      '<p>&lt;img src=x onerror=alert(1)&gt;</p>',
    );
  });

  it('round-trips entities instead of double-encoding them', () => {
    expect(sanitizeRichHtml('<p>a &amp; b &lt;c&gt; &#39;d&#39;</p>')).toBe(
      "<p>a &amp; b &lt;c&gt; 'd'</p>",
    );
  });

  it('leaves a stray ampersand readable', () => {
    expect(sanitizeRichHtml('<p>AT&amp;T</p>')).toBe('<p>AT&amp;T</p>');
    expect(sanitizeRichHtml('<p>AT&T</p>')).toBe('<p>AT&amp;T</p>');
  });

  it('closes tags the input left open', () => {
    expect(sanitizeRichHtml('<p>satu<p>dua')).toBe('<p>satu<p>dua</p></p>');
    expect(sanitizeRichHtml('<ul><li>x')).toBe('<ul><li>x</li></ul>');
  });

  it('ignores a close tag with nothing open behind it', () => {
    expect(sanitizeRichHtml('teks</p> lanjut')).toBe('teks lanjut');
  });

  it('drops comments, doctypes and processing instructions', () => {
    expect(sanitizeRichHtml('<!-- evil --><p>x</p><![CDATA[y]]>')).toBe('<p>x</p>');
    expect(sanitizeRichHtml('<!DOCTYPE html><p>x</p>')).toBe('<p>x</p>');
  });

  it('treats a lone angle bracket as text', () => {
    expect(sanitizeRichHtml('<p>a < b</p>')).toBe('<p>a &lt; b</p>');
    expect(sanitizeRichHtml('<p>unclosed <')).toBe('<p>unclosed &lt;</p>');
  });

  it('does not let a void element swallow the rest of the document', () => {
    expect(sanitizeRichHtml('<input name="a"><p>sisa</p>')).toBe('<p>sisa</p>');
  });

  it('keeps hard breaks and paragraphs intact', () => {
    expect(sanitizeRichHtml('<p>satu<br>dua</p>')).toBe('<p>satu<br>dua</p>');
  });

  it('produces plain text when the input is nothing but script', () => {
    expect(sanitizeRichHtml('<script>alert(1)</script>')).toBe('');
  });
});
