import { Router, Response } from 'express';
import nodeFetch from 'node-fetch';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { isSafeUrl } from '../lib/isSafeUrl';

type FetchOptions = Parameters<typeof nodeFetch>[1] & { timeout?: number };

// ── Feed utilities ────────────────────────────────────────────────────────────

const FEED_PATHS = ['/feed', '/feed.xml', '/rss', '/rss.xml', '/atom.xml', '/index.xml', '/blog/feed', '/feed/rss'];

function findFeedInHtml(html: string, base: string): string | null {
  for (const [, attrs] of html.matchAll(/<link([^>]+)>/gi)) {
    const isAlternate = /rel=["']alternate["']/i.test(attrs);
    const isFeed = /type=["'](application\/(rss|atom)\+xml)["']/i.test(attrs);
    if (isAlternate && isFeed) {
      const m = attrs.match(/href=["']([^"']+)["']/i);
      if (m) return m[1].startsWith('http') ? m[1] : new URL(m[1], base).toString();
    }
  }
  return null;
}

async function fetchXml(url: string, maxBytes = 150_000): Promise<string | null> {
  try {
    const res = await nodeFetch(url, { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewTab/1.0)' } } as FetchOptions);
    if (!res.ok) return null;
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    return await new Promise<string | null>(resolve => {
      const finish = (v: string | null) => { if (!settled) { settled = true; resolve(v); } };
      res.body!.on('data', (c: Buffer) => { if (settled) return; chunks.push(c); size += c.length; if (size >= maxBytes) finish(Buffer.concat(chunks).toString('utf8')); });
      res.body!.on('end', () => finish(Buffer.concat(chunks).toString('utf8')));
      res.body!.on('error', () => finish(null));
    });
  } catch { return null; }
}

function isFeedXml(text: string): boolean {
  const t = text.trimStart();
  return (t.startsWith('<?xml') || t.startsWith('<rss') || t.startsWith('<feed')) &&
    (text.includes('<item') || text.includes('<entry') || text.includes('<channel'));
}

function parseFeedDates(xml: string): Date[] {
  const dates: Date[] = [];
  const isAtom = xml.includes('<feed') && (xml.includes('<entry>') || xml.includes('<entry '));
  const itemRe = isAtom ? /<entry[\s>]([\s\S]*?)<\/entry>/gi : /<item[\s>]([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const e = m[1];
    const raw = isAtom
      ? (e.match(/<updated>([\s\S]*?)<\/updated>/i)?.[1] ?? e.match(/<published>([\s\S]*?)<\/published>/i)?.[1])
      : (e.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? e.match(/<dc:date>([\s\S]*?)<\/dc:date>/i)?.[1]);
    if (raw) { const d = new Date(raw.trim()); if (!isNaN(d.getTime())) dates.push(d); }
  }
  return dates;
}

async function discoverFeed(domain: string): Promise<string | null> {
  const base = `https://${domain}`;
  // 1. Parse homepage HTML for <link rel="alternate">
  if (await isSafeUrl(base)) {
    const html = await fetchXml(base, 500_000);
    if (html) {
      const found = findFeedInHtml(html, base);
      if (found && await isSafeUrl(found)) {
        const xml = await fetchXml(found, 8_000);
        if (xml && isFeedXml(xml)) return found;
      }
    }
  }
  // 2. Try common paths
  for (const path of FEED_PATHS) {
    const url = `${base}${path}`;
    if (!(await isSafeUrl(url))) continue;
    const xml = await fetchXml(url, 8_000);
    if (xml && isFeedXml(xml)) return url;
  }
  return null;
}

const router = Router();
router.use(requireAuth);

// Returns all bookmarks for the user in one query — used for the initial bulk load
router.get('/all', async (req: AuthRequest, res: Response): Promise<void> => {
  const bookmarks = await prisma.bookmark.findMany({
    where: { userId: req.userId! },
    orderBy: { position: 'asc' },
  });
  res.json(bookmarks);
});

router.post('/import', async (req: AuthRequest, res: Response): Promise<void> => {
  const { folderId, bookmarks } = req.body;
  if (!folderId || !Array.isArray(bookmarks) || bookmarks.length === 0) {
    res.status(400).json({ error: 'folderId and bookmarks array required' }); return;
  }
  const folder = await prisma.folder.findFirst({ where: { id: folderId, userId: req.userId! } });
  if (!folder) { res.status(404).json({ error: 'Folder not found' }); return; }

  const existing = await prisma.bookmark.findMany({
    where: { folderId, userId: req.userId! },
    select: { domain: true, position: true },
  });
  const existingDomains = new Set(existing.map(b => b.domain));
  const nextPosition = existing.length > 0 ? Math.max(...existing.map(b => b.position)) + 1 : 0;

  const toCreate = (bookmarks as { name: string; domain: string; color: string }[])
    .filter(b => b.domain && b.name && !existingDomains.has(b.domain))
    .slice(0, 500);

  if (toCreate.length > 0) {
    await prisma.bookmark.createMany({
      data: toCreate.map((b, i) => ({
        folderId,
        userId: req.userId!,
        domain: b.domain,
        name: b.name,
        faviconUrl: `https://www.google.com/s2/favicons?domain=${b.domain}&sz=128`,
        color: b.color || '#5E6AD2',
        position: nextPosition + i,
      })),
    });
  }

  res.json({ created: toCreate.length, skipped: bookmarks.length - toCreate.length });
});

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { folderId } = req.query;
  if (!folderId) { res.status(400).json({ error: 'folderId required' }); return; }
  const bookmarks = await prisma.bookmark.findMany({
    where: { folderId: folderId as string, userId: req.userId! },
    orderBy: { position: 'asc' },
  });
  res.json(bookmarks);
});

router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { folderId, domain, name, faviconUrl, color } = req.body;
  if (!folderId || !domain || !name) {
    res.status(400).json({ error: 'folderId, domain, and name required' });
    return;
  }
  const folder = await prisma.folder.findFirst({ where: { id: folderId, userId: req.userId! } });
  if (!folder) { res.status(404).json({ error: 'Folder not found' }); return; }
  const count = await prisma.bookmark.count({ where: { folderId, userId: req.userId! } });
  const bookmark = await prisma.bookmark.create({
    data: {
      folderId,
      userId: req.userId!,
      domain,
      name,
      faviconUrl: faviconUrl || `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
      color: color || '#5E6AD2',
      position: count,
    },
  });
  res.status(201).json(bookmark);
});

router.put('/reorder', async (req: AuthRequest, res: Response): Promise<void> => {
  const items: { id: string; position: number }[] = req.body;
  if (!Array.isArray(items)) { res.status(400).json({ error: 'Array expected' }); return; }
  await prisma.$transaction(
    items.map(({ id, position }) =>
      prisma.bookmark.updateMany({ where: { id, userId: req.userId! }, data: { position } })
    )
  );
  res.json({ ok: true });
});

router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, domain, faviconUrl, color, folderId } = req.body;
  const existing = await prisma.bookmark.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
  const updated = await prisma.bookmark.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(domain !== undefined && { domain }),
      ...(faviconUrl !== undefined && { faviconUrl }),
      ...(color !== undefined && { color }),
      ...(folderId !== undefined && { folderId }),
    },
  });
  res.json(updated);
});

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await prisma.bookmark.deleteMany({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (result.count === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ ok: true });
});

router.post('/:id/check-feed', async (req: AuthRequest, res: Response): Promise<void> => {
  const bookmark = await prisma.bookmark.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!bookmark) { res.status(404).json({ error: 'Not found' }); return; }

  let feedUrl = bookmark.feedUrl ?? null;
  if (!feedUrl) feedUrl = await discoverFeed(bookmark.domain);

  let feedLatestAt: Date | undefined;
  let unreadDelta = 0;

  if (feedUrl) {
    const xml = await fetchXml(feedUrl);
    if (xml && isFeedXml(xml)) {
      const dates = parseFeedDates(xml);
      if (dates.length > 0) {
        feedLatestAt = new Date(Math.max(...dates.map(d => d.getTime())));
        if (bookmark.feedLatestAt) {
          const since = new Date(bookmark.feedLatestAt);
          unreadDelta = dates.filter(d => d > since).length;
        }
      }
    } else {
      feedUrl = null;
    }
  }

  const updated = await prisma.bookmark.update({
    where: { id: req.params.id },
    data: {
      feedUrl,
      feedCheckedAt: new Date(),
      ...(feedLatestAt && { feedLatestAt }),
      ...(unreadDelta > 0 && { unreadCount: Math.min(bookmark.unreadCount + unreadDelta, 100) }),
    },
  });
  res.json(updated);
});

router.post('/:id/visited', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.bookmark.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
  await prisma.bookmark.update({
    where: { id: req.params.id },
    data: { lastVisitedAt: new Date(), unreadCount: 0 },
  });
  res.json({ ok: true });
});

export default router;
