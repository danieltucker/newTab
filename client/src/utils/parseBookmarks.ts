export interface ParsedBookmark {
  name: string;
  domain: string;
  color: string;
}

const PALETTE = [
  '#5E6AD2', '#FF4500', '#EA4C89', '#1DB954', '#F48024', '#A259FF',
  '#E0479E', '#00A8E8', '#FF6600', '#24A0ED', '#7C5CFC', '#0FB57B',
];

function deriveColor(domain: string): string {
  let h = 0;
  for (const c of domain) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function parseBookmarkHTML(html: string): ParsedBookmark[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const seen = new Set<string>();
  const results: ParsedBookmark[] = [];

  for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
    const href = a.getAttribute('href') ?? '';
    if (!href.startsWith('http://') && !href.startsWith('https://')) continue;

    let domain: string;
    try {
      domain = new URL(href).hostname.replace(/^www\./, '');
    } catch {
      continue;
    }
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);

    const name = a.textContent?.trim() || domain;
    results.push({ name, domain, color: deriveColor(domain) });
  }

  return results;
}
