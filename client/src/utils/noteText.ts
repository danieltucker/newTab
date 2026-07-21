// Notes are stored as editor HTML. Searching (and the snippets shown beside a
// hit) works on the plain text behind that markup.

const cache = new Map<string, string>();

export function noteText(html: string): string {
  if (!html) return '';
  const hit = cache.get(html);
  if (hit !== undefined) return hit;
  const el = document.createElement('div');
  el.innerHTML = html;
  // Block boundaries carry no whitespace of their own — without a separator
  // "<p>one</p><p>two</p>" would read as "onetwo" and never match "one two".
  el.querySelectorAll('p, div, li, tr, br, h1, h2, h3, blockquote, pre')
    .forEach(n => n.after(document.createTextNode(' ')));
  el.querySelectorAll('td, th').forEach(n => n.after(document.createTextNode(' ')));
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (cache.size > 200) cache.clear();
  cache.set(html, text);
  return text;
}

// A short window of `text` around the first match of `q`, ellipsised at both
// ends when it's cut from a longer body.
export function noteSnippet(text: string, q: string, width = 90): string {
  if (!text) return '';
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return text.length > width ? `${text.slice(0, width).trimEnd()}…` : text;
  const start = Math.max(0, i - Math.floor(width / 3));
  const end = Math.min(text.length, start + width);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}
