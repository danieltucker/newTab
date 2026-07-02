import nodeFetch from 'node-fetch';

type FetchOptions = Parameters<typeof nodeFetch>[1] & { timeout?: number };

// ── RSS / Atom parser ──────────────────────────────────────────────────────

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function cleanContent(s: string): string {
  return decodeXmlEntities(s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim());
}

export interface FeedItem {
  title: string;
  link: string;
  date: Date | null;
  readTime: number | null;
  snippet: string | null;
  categories: string[];
}

function extractSnippet(raw: string, maxChars = 200): string | null {
  const text = stripHtml(cleanContent(raw)).replace(/\s+/g, ' ').trim();
  if (!text || text.length < 20) return null;
  if (text.length <= maxChars) return text;
  const cut = text.lastIndexOf(' ', maxChars);
  return (cut > 80 ? text.slice(0, cut) : text.slice(0, maxChars)) + '…';
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function estimateReadTime(raw: string): number | null {
  const text = stripHtml(cleanContent(raw));
  if (!text) return null;
  const words = text.split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

export function parseFeed(xml: string, limit = 100): FeedItem[] {
  const items: FeedItem[] = [];
  const isAtom = xml.includes('<feed') && (xml.includes('<entry>') || xml.includes('<entry '));
  const itemRe = isAtom
    ? /<entry[\s>]([\s\S]*?)<\/entry>/gi
    : /<item[\s>]([\s\S]*?)<\/item>/gi;

  let m;
  while ((m = itemRe.exec(xml)) !== null && items.length < limit) {
    const e = m[1];
    const rawTitle = e.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
    const title = cleanContent(rawTitle);
    const link = isAtom
      ? (e.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] ?? e.match(/<link>([^<]+)<\/link>/i)?.[1] ?? '')
      : (e.match(/<link[^>]*>([^<]+)<\/link>/i)?.[1] ?? '');
    const rawDate = isAtom
      ? (e.match(/<updated>([\s\S]*?)<\/updated>/i)?.[1] ?? e.match(/<published>([\s\S]*?)<\/published>/i)?.[1])
      : (e.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? e.match(/<dc:date>([\s\S]*?)<\/dc:date>/i)?.[1]);

    // Read time from content:encoded → description/summary (prefer longer)
    const contentRaw = e.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i)?.[1]
      ?? e.match(/<content[^>]*type=["'](?:html|text)["'][^>]*>([\s\S]*?)<\/content>/i)?.[1]
      ?? e.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1]
      ?? e.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1]
      ?? '';
    const readTime = estimateReadTime(contentRaw);
    const snippet = extractSnippet(contentRaw);

    // Categories
    const categories: string[] = [];
    if (isAtom) {
      const catRe = /<category[^>]+(?:term|label)=["']([^"']+)["']/gi;
      let cm;
      while ((cm = catRe.exec(e)) !== null) {
        const c = cleanContent(cm[1]).trim();
        if (c && !categories.includes(c)) categories.push(c);
      }
    } else {
      const catRe = /<category[^>]*>([^<]+)<\/category>/gi;
      let cm;
      while ((cm = catRe.exec(e)) !== null) {
        const c = cleanContent(cm[1]).trim();
        if (c && !categories.includes(c)) categories.push(c);
      }
    }

    if (title && link.trim()) {
      const date = rawDate ? new Date(rawDate.trim()) : null;
      items.push({
        title, link: link.trim(),
        date: date && !isNaN(date.getTime()) ? date : null,
        readTime, snippet,
        categories: categories.slice(0, 5),
      });
    }
  }
  return items;
}

export function parseFeedTitle(xml: string): string {
  const m = xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? cleanContent(m[1]) : '';
}

// ── Feed discovery ─────────────────────────────────────────────────────────

const COMMON_FEED_PATHS = ['/feed', '/rss', '/rss.xml', '/feed.xml', '/atom.xml', '/feed/rss2', '/index.xml'];

export async function discoverFeedUrl(domain: string): Promise<string | null> {
  const baseUrl = `https://${domain}`;
  try {
    const resp = await nodeFetch(baseUrl, {
      timeout: 6000,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewTab/1.0; +Feed)' },
    } as FetchOptions);
    if (!resp.ok) return null;

    const html = await resp.text();

    // Look for <link rel="alternate" type="application/rss+xml|atom+xml">
    const linkRe = /<link[^>]+rel=["']alternate["'][^>]*>/gi;
    let lm;
    while ((lm = linkRe.exec(html)) !== null) {
      const tag = lm[0];
      const typeMatch = tag.match(/type=["']application\/(rss|atom)\+xml["']/i);
      if (!typeMatch) continue;
      const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
      if (!hrefMatch) continue;
      const href = hrefMatch[1];
      if (href.startsWith('http')) return href;
      if (href.startsWith('//')) return `https:${href}`;
      return `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;
    }
  } catch {}

  // Probe common paths
  for (const path of COMMON_FEED_PATHS) {
    const url = `${baseUrl}${path}`;
    try {
      const r = await nodeFetch(url, {
        method: 'HEAD',
        timeout: 3000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewTab/1.0; +Feed)' },
      } as FetchOptions);
      const ct = r.headers.get('content-type') ?? '';
      if (r.ok && (ct.includes('xml') || ct.includes('rss') || ct.includes('atom'))) return url;
    } catch {}
  }

  return null;
}

// ── Feed checker ───────────────────────────────────────────────────────────

export interface FeedCheckResult {
  newCount: number;
  latestAt: Date | null;
}

export async function checkFeed(feedUrl: string, since: Date | null): Promise<FeedCheckResult> {
  const resp = await nodeFetch(feedUrl, {
    timeout: 8000,
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewTab/1.0; +Feed)' },
  } as FetchOptions);
  if (!resp.ok) throw new Error(`Feed returned ${resp.status}`);

  const xml = await resp.text();
  const items = parseFeed(xml, 100);

  if (items.length === 0) return { newCount: 0, latestAt: null };

  const dates = items.map(i => i.date).filter(Boolean) as Date[];
  const latestAt = dates.length > 0
    ? new Date(Math.max(...dates.map(d => d.getTime())))
    : null;

  // First check: establish baseline, no unread count yet
  if (!since) return { newCount: 0, latestAt };

  const newCount = dates.filter(d => d > since).length;
  return { newCount, latestAt };
}
