import { Router, Response } from 'express';
import nodeFetch from 'node-fetch';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { parseFeed, parseFeedTitle, canonicalFeedKey } from '../lib/feedUtils';
import logger from '../lib/logger';

type FetchOptions = Parameters<typeof nodeFetch>[1] & { timeout?: number };

const router = Router();
router.use(requireAuth);

const FEED_STALE_MS = 30 * 60 * 1000;   // 30 minutes
const FEED_TTL_MS   = 7 * 24 * 60 * 60 * 1000; // 7 days

const UPSERT_CHUNK = 10;

// Feeds are shared: URL permutations collapse onto one Feed row via
// canonicalFeedKey, and each feed is fetched once no matter how many
// users/folders reference it. Returns the Feed rows for the given URLs.
async function ensureFeeds(feedUrls: string[]) {
  const byKey = new Map<string, string>(); // canonicalKey -> first-seen fetchUrl
  for (const url of feedUrls) {
    const key = canonicalFeedKey(url);
    if (!byKey.has(key)) byKey.set(key, url);
  }
  const keys = Array.from(byKey.keys());
  if (keys.length === 0) return [];

  const existing = await prisma.feed.findMany({ where: { canonicalKey: { in: keys } } });
  const existingKeys = new Set(existing.map(f => f.canonicalKey));
  const missing = keys.filter(k => !existingKeys.has(k));
  if (missing.length > 0) {
    await prisma.feed.createMany({
      data: missing.map(k => ({ canonicalKey: k, fetchUrl: byKey.get(k)! })),
      skipDuplicates: true,
    });
    return prisma.feed.findMany({ where: { canonicalKey: { in: keys } } });
  }
  return existing;
}

async function refreshStaleFeeds(feeds: { id: string; fetchUrl: string; lastCheckedAt: Date | null }[]) {
  const now = new Date();
  const stale = feeds.filter(f => !f.lastCheckedAt || now.getTime() - f.lastCheckedAt.getTime() > FEED_STALE_MS);
  if (stale.length === 0) return;

  await Promise.all(stale.map(async (feed) => {
    try {
      const resp = await nodeFetch(feed.fetchUrl, {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewTab/1.0; +RSS)' },
      } as FetchOptions);
      if (!resp.ok) return;

      const xml = await resp.text();
      const items = parseFeed(xml, 50);
      const title = parseFeedTitle(xml) || new URL(feed.fetchUrl).hostname.replace(/^www\./, '');

      // Process upserts in small chunks to avoid overwhelming the DB connection pool
      for (let i = 0; i < items.length; i += UPSERT_CHUNK) {
        const chunk = items.slice(i, i + UPSERT_CHUNK);
        await Promise.all(chunk.map(item =>
          prisma.feedItem.upsert({
            where: { feedId_link: { feedId: feed.id, link: item.link } },
            create: { feedId: feed.id, title: item.title, link: item.link, pubDate: item.date, fetchedAt: now, readTime: item.readTime, snippet: item.snippet, imageUrl: item.imageUrl, categories: item.categories },
            update: { fetchedAt: now, title: item.title, readTime: item.readTime, snippet: item.snippet, imageUrl: item.imageUrl, categories: item.categories },
          }).catch(() => {})
        ));
      }

      // Items that dropped out of the feed expire after the TTL
      await prisma.feedItem.deleteMany({ where: { feedId: feed.id, fetchedAt: { lt: new Date(now.getTime() - FEED_TTL_MS) } } });
      await prisma.feed.update({ where: { id: feed.id }, data: { title, lastCheckedAt: now } });
    } catch {}
  }));
}

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const folders = await prisma.folder.findMany({
    where: { userId: req.userId! },
    orderBy: { position: 'asc' },
  });
  res.json(folders);
});

router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, color } = req.body;
  if (!name || !color) { res.status(400).json({ error: 'name and color required' }); return; }
  if (typeof name !== 'string' || name.length > 100) { res.status(400).json({ error: 'name must be ≤100 characters' }); return; }
  const count = await prisma.folder.count({ where: { userId: req.userId! } });
  const folder = await prisma.folder.create({
    data: { userId: req.userId!, name, color, position: count },
  });
  res.status(201).json(folder);
});

router.put('/reorder', async (req: AuthRequest, res: Response): Promise<void> => {
  const items: { id: string; position: number }[] = req.body;
  if (!Array.isArray(items)) { res.status(400).json({ error: 'Array expected' }); return; }
  await prisma.$transaction(
    items.map(({ id, position }) =>
      prisma.folder.updateMany({ where: { id, userId: req.userId! }, data: { position } })
    )
  );
  res.json({ ok: true });
});

router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, color, feedUrls, backgroundImage } = req.body;
  try {
    const data: Record<string, unknown> = {};
    if (name) data.name = name;
    if (color) data.color = color;
    if (Array.isArray(feedUrls)) {
      if (feedUrls.length > 20) { res.status(400).json({ error: 'Maximum 20 feed URLs per folder' }); return; }
      data.feedUrls = feedUrls.filter((u: unknown) => typeof u === 'string' && (u as string).length <= 2048);
    }
    if ('backgroundImage' in req.body) data.backgroundImage = backgroundImage || null;

    const result = await prisma.folder.updateMany({
      where: { id: req.params.id, userId: req.userId! },
      data,
    });
    if (result.count === 0) { res.status(404).json({ error: 'Not found' }); return; }

    // If feeds were updated, reset the check timer so next article load refreshes
    if (Array.isArray(feedUrls)) {
      await prisma.folder.updateMany({
        where: { id: req.params.id, userId: req.userId! },
        data: { feedLastCheckedAt: null },
      });
    }

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await prisma.folder.deleteMany({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (result.count === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ ok: true });
});

// Clears the unread badges on every bookmark in the folder
router.post('/:id/mark-read', async (req: AuthRequest, res: Response): Promise<void> => {
  const folder = await prisma.folder.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!folder) { res.status(404).json({ error: 'Not found' }); return; }
  await prisma.bookmark.updateMany({
    where: { folderId: req.params.id, userId: req.userId! },
    data: { unreadCount: 0 },
  });
  res.json({ ok: true });
});

router.post('/refresh-all', async (req: AuthRequest, res: Response): Promise<void> => {
  const folders = await prisma.folder.findMany({
    where: { userId: req.userId!, NOT: { feedUrls: { isEmpty: true } } },
    select: { feedUrls: true },
  });
  if (folders.length === 0) {
    res.json({ refreshed: 0 });
    return;
  }
  const feeds = await ensureFeeds(folders.flatMap(f => f.feedUrls));
  // Force refresh regardless of staleness — this is an explicit user action
  await refreshStaleFeeds(feeds.map(f => ({ ...f, lastCheckedAt: null })));
  res.json({ refreshed: feeds.length });
});

router.get('/:id/articles', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const offset     = Math.max(0, parseInt(req.query.offset as string || '0') || 0);
  const limit      = Math.min(200, Math.max(1, parseInt(req.query.limit as string || '10') || 10));
  const includeAll = req.query.includeAll === 'true';

  try {
    const folder = await prisma.folder.findFirst({ where: { id, userId: req.userId! } });
    if (!folder) { res.status(404).json({ error: 'Not found' }); return; }

    if (folder.feedUrls.length === 0) {
      res.json({ articles: [], total: 0, hasMore: false });
      return;
    }

    const feeds = await ensureFeeds(folder.feedUrls);
    const neverFetched = feeds.some(f => !f.lastCheckedAt);
    if (neverFetched) {
      // First load of at least one feed — wait so the user doesn't see an empty list
      await refreshStaleFeeds(feeds);
    } else {
      // Data exists — serve immediately, refresh stale feeds behind the scenes
      refreshStaleFeeds(feeds).catch(() => {});
    }

    const feedIds = feeds.map(f => f.id);
    const feedById = new Map(feeds.map(f => [f.id, f]));
    const where = {
      feedId: { in: feedIds },
      ...(includeAll ? {} : { dismissals: { none: { userId: req.userId!, folderId: id } } }),
    };
    const [items, total] = await Promise.all([
      prisma.feedItem.findMany({
        where,
        orderBy: [{ pubDate: 'desc' }, { fetchedAt: 'desc' }],
        skip: offset,
        take: limit,
      }),
      prisma.feedItem.count({ where }),
    ]);

    const articles = items.map(i => {
      const feed = feedById.get(i.feedId);
      return {
        id: i.id,
        feedUrl: feed?.fetchUrl ?? '',
        title: i.title,
        link: i.link,
        source: feed?.title || '',
        pubDate: i.pubDate,
        fetchedAt: i.fetchedAt,
        readTime: i.readTime,
        snippet: i.snippet,
        imageUrl: i.imageUrl,
        categories: i.categories,
      };
    });

    res.json({ articles, total, hasMore: offset + articles.length < total });
  } catch (err) {
    logger.error(err, 'Feed articles error');
    res.status(500).json({ error: 'Server error' });
  }
});

// "Dismiss" marks the shared item hidden for this user+folder only
router.delete('/:id/articles/:articleId', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id, articleId } = req.params;
  try {
    const folder = await prisma.folder.findFirst({ where: { id, userId: req.userId! } });
    if (!folder) { res.status(404).json({ error: 'Not found' }); return; }
    await prisma.dismissedFeedItem.createMany({
      data: [{ userId: req.userId!, folderId: id, itemId: articleId }],
      skipDuplicates: true,
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
