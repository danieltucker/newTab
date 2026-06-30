import { Router, Response } from 'express';
import nodeFetch from 'node-fetch';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { parseFeed, parseFeedTitle } from '../lib/feedUtils';

type FetchOptions = Parameters<typeof nodeFetch>[1] & { timeout?: number };

const router = Router();
router.use(requireAuth);

const FEED_STALE_MS = 30 * 60 * 1000;   // 30 minutes
const FEED_TTL_MS   = 7 * 24 * 60 * 60 * 1000; // 7 days

async function refreshFolderFeeds(folderId: string, userId: string, feedUrls: string[]) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() - FEED_TTL_MS);

  await Promise.all(feedUrls.map(async (feedUrl) => {
    try {
      const resp = await nodeFetch(feedUrl, {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewTab/1.0; +RSS)' },
      } as FetchOptions);
      if (!resp.ok) return;

      const xml = await resp.text();
      const items = parseFeed(xml, 50);
      const source = parseFeedTitle(xml) || new URL(feedUrl).hostname.replace(/^www\./, '');

      await Promise.all(items.map(item =>
        prisma.feedArticle.upsert({
          where: { folderId_link: { folderId, link: item.link } },
          create: { userId, folderId, feedUrl, title: item.title, link: item.link, source, pubDate: item.date, fetchedAt: now, readTime: item.readTime, categories: item.categories },
          update: { fetchedAt: now, title: item.title, source, readTime: item.readTime, categories: item.categories },
        }).catch(() => {})
      ));
    } catch {}
  }));

  await prisma.feedArticle.deleteMany({ where: { folderId, fetchedAt: { lt: expiresAt } } });
  await prisma.folder.updateMany({ where: { id: folderId, userId }, data: { feedLastCheckedAt: now } });
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
    if (Array.isArray(feedUrls)) data.feedUrls = feedUrls.filter((u: unknown) => typeof u === 'string');
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

    const needsRefresh = !folder.feedLastCheckedAt ||
      Date.now() - folder.feedLastCheckedAt.getTime() > FEED_STALE_MS;

    if (needsRefresh) {
      await refreshFolderFeeds(id, req.userId!, folder.feedUrls);
    }

    const where = includeAll
      ? { folderId: id, userId: req.userId! }
      : { folderId: id, userId: req.userId!, dismissed: false };
    const [articles, total] = await Promise.all([
      prisma.feedArticle.findMany({
        where,
        orderBy: [{ pubDate: 'desc' }, { fetchedAt: 'desc' }],
        skip: offset,
        take: limit,
        select: { id: true, feedUrl: true, title: true, link: true, source: true, pubDate: true, fetchedAt: true, readTime: true, categories: true },
      }),
      prisma.feedArticle.count({ where }),
    ]);

    res.json({ articles, total, hasMore: offset + articles.length < total });
  } catch (err) {
    console.error('Feed articles error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id/articles/:articleId', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id, articleId } = req.params;
  try {
    const folder = await prisma.folder.findFirst({ where: { id, userId: req.userId! } });
    if (!folder) { res.status(404).json({ error: 'Not found' }); return; }
    await prisma.feedArticle.updateMany({
      where: { id: articleId, folderId: id, userId: req.userId! },
      data: { dismissed: true },
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
