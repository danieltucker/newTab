import { Router, Request, Response } from 'express';
import nodeFetch from 'node-fetch';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { isSafeUrl } from '../lib/isSafeUrl';

type FetchOptions = Parameters<typeof nodeFetch>[1] & { timeout?: number };

const PALETTE = [
  '#5E6AD2', '#FF4500', '#EA4C89', '#1DB954', '#F48024', '#A259FF',
  '#E0479E', '#00A8E8', '#FF6600', '#24A0ED', '#7C5CFC', '#0FB57B',
];

function deriveColor(domain: string): string {
  let h = 0;
  for (const c of domain) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const HTML_ENTITIES: Record<string, string> = {
  quot: '"', apos: "'", amp: '&', lt: '<', gt: '>',
  nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  trade: '™', copy: '©', reg: '®',
};

function decodeEntities(str: string): string {
  return str.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity: string) => {
    try {
      if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
      if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    } catch { return match; }
    return HTML_ENTITIES[entity] ?? match;
  });
}


const MAX_HTML_BYTES = 500_000; // 500 KB — enough for any real <title>/<og:title>

const router = Router();

// favicon and color are intentionally public (favicon proxies Google; color is deterministic)
router.get('/favicon', async (req: Request, res: Response): Promise<void> => {
  const { domain } = req.query;
  if (!domain) { res.status(400).json({ error: 'domain required' }); return; }
  try {
    const url = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    const upstream = await nodeFetch(url, { timeout: 5000 } as FetchOptions);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    upstream.body?.pipe(res);
  } catch {
    res.status(502).json({ error: 'Failed to fetch favicon' });
  }
});

router.get('/color', (req: Request, res: Response): void => {
  const { domain } = req.query;
  if (!domain) { res.status(400).json({ error: 'domain required' }); return; }
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.json({ color: deriveColor(domain as string) });
});

router.get('/ip', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const r = await nodeFetch('https://ipinfo.io/json', { timeout: 5000 } as FetchOptions);
    const data = await r.json() as { ip: string; city?: string; region?: string; country?: string; org?: string };
    res.json({ ip: data.ip, city: data.city, region: data.region, country: data.country, org: data.org });
  } catch {
    res.status(502).json({ error: 'Could not reach ipinfo.io' });
  }
});

// page-meta requires auth — it fetches arbitrary URLs server-side (SSRF risk if public)
router.get('/page-meta', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { url } = req.query;
  if (!url || typeof url !== 'string') { res.status(400).json({ error: 'url required' }); return; }

  const fullUrl = url.startsWith('http') ? url : `https://${url}`;

  if (!(await isSafeUrl(fullUrl))) {
    res.status(400).json({ error: 'URL not allowed' });
    return;
  }

  try {
    const response = await nodeFetch(fullUrl, {
      timeout: 5000,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewTab/1.0)' },
    } as FetchOptions);

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      res.json({ title: null });
      return;
    }

    // Read up to MAX_HTML_BYTES — stop collecting once limit is hit
    const html = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let settled = false;
      const finish = (buf: string) => { if (!settled) { settled = true; resolve(buf); } };
      response.body!.on('data', (chunk: Buffer) => {
        if (settled) return;
        size += chunk.length;
        chunks.push(chunk);
        if (size >= MAX_HTML_BYTES) finish(Buffer.concat(chunks).toString('utf8'));
      });
      response.body!.on('end', () => finish(Buffer.concat(chunks).toString('utf8')));
      response.body!.on('error', (err) => { if (!settled) { settled = true; reject(err); } });
    });

    const ogMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    if (ogMatch) { res.json({ title: decodeEntities(ogMatch[1].trim()) }); return; }

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    res.json({ title: titleMatch ? decodeEntities(titleMatch[1].trim()) : null });
  } catch {
    res.json({ title: null });
  }
});

export default router;
