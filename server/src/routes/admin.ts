import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth';
import logger from '../lib/logger';

const router = Router();
router.use(requireAuth, requireAdmin);

const SIGNUP_WINDOW_DAYS = 30;
const HISTORY_DAYS = 90;

// Daily buckets of "date → cumulative total", zero-filled across the window.
// Deletions aren't tracked historically, so totals reflect rows that still
// exist, bucketed by when they were created.
function cumulativeSeries(baseline: number, created: { createdAt: Date }[], start: Date, days: number): { date: string; total: number }[] {
  const perDay = new Map<string, number>();
  for (const row of created) {
    const key = row.createdAt.toISOString().slice(0, 10);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  const series: { date: string; total: number }[] = [];
  let running = baseline;
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    running += perDay.get(key) ?? 0;
    series.push({ date: key, total: running });
  }
  return series;
}

router.get('/stats', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (SIGNUP_WINDOW_DAYS - 1));

    const histStart = new Date();
    histStart.setHours(0, 0, 0, 0);
    histStart.setDate(histStart.getDate() - (HISTORY_DAYS - 1));

    const [users, admins, totpUsers, bookmarks, folders, readingItems, feedArticles, recentUsers, activeTokens] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isAdmin: true } }),
      prisma.user.count({ where: { totpEnabled: true } }),
      prisma.bookmark.count(),
      prisma.folder.count(),
      prisma.readingListItem.count(),
      prisma.feedItem.count(),
      prisma.user.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      // Sessions created in the last 7 days ≈ recently active users
      prisma.refreshToken.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      }),
    ]);

    // Cumulative history: baseline before the window + per-day additions within it
    const [userBaseline, userCreated, bookmarkBaseline, bookmarkCreated] = await Promise.all([
      prisma.user.count({ where: { createdAt: { lt: histStart } } }),
      prisma.user.findMany({ where: { createdAt: { gte: histStart } }, select: { createdAt: true } }),
      prisma.bookmark.count({ where: { createdAt: { lt: histStart } } }),
      prisma.bookmark.findMany({ where: { createdAt: { gte: histStart } }, select: { createdAt: true } }),
    ]);

    // Bucket signups per day over the window (zero-filled)
    const signups: { date: string; count: number }[] = [];
    for (let i = 0; i < SIGNUP_WINDOW_DAYS; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      signups.push({ date: d.toISOString().slice(0, 10), count: 0 });
    }
    const byDate = new Map(signups.map(s => [s.date, s]));
    for (const u of recentUsers) {
      const key = u.createdAt.toISOString().slice(0, 10);
      const bucket = byDate.get(key);
      if (bucket) bucket.count++;
    }

    res.json({
      totals: { users, admins, totpUsers, bookmarks, folders, readingItems, feedArticles },
      activeUsers7d: activeTokens.length,
      signups,
      history: {
        users: cumulativeSeries(userBaseline, userCreated, histStart, HISTORY_DAYS),
        bookmarks: cumulativeSeries(bookmarkBaseline, bookmarkCreated, histStart, HISTORY_DAYS),
      },
    });
  } catch (err) {
    logger.error(err, 'Admin stats error');
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/users', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        email: true,
        isAdmin: true,
        bannedAt: true,
        totpEnabled: true,
        createdAt: true,
        _count: { select: { bookmarks: true, folders: true, readingList: true } },
        refreshTokens: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });
    res.json(users.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
      isAdmin: u.isAdmin,
      bannedAt: u.bannedAt,
      totpEnabled: u.totpEnabled,
      createdAt: u.createdAt,
      bookmarks: u._count.bookmarks,
      folders: u._count.folders,
      readingItems: u._count.readingList,
      lastActiveAt: u.refreshTokens[0]?.createdAt ?? null,
    })));
  } catch (err) {
    logger.error(err, 'Admin users error');
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/users/:id/admin', async (req: AuthRequest, res: Response): Promise<void> => {
  const { isAdmin } = req.body as { isAdmin?: unknown };
  if (typeof isAdmin !== 'boolean') {
    res.status(400).json({ error: 'isAdmin (boolean) required' });
    return;
  }
  // Self-demotion is blocked so the system can never end up with zero admins
  if (req.params.id === req.userId && !isAdmin) {
    res.status(400).json({ error: 'You cannot remove your own admin access' });
    return;
  }
  try {
    const result = await prisma.user.updateMany({
      where: { id: req.params.id },
      data: { isAdmin },
    });
    if (result.count === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ ok: true });
  } catch (err) {
    logger.error(err, 'Admin toggle error');
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/users/:id/ban', async (req: AuthRequest, res: Response): Promise<void> => {
  const { banned } = req.body as { banned?: unknown };
  if (typeof banned !== 'boolean') {
    res.status(400).json({ error: 'banned (boolean) required' });
    return;
  }
  if (req.params.id === req.userId) {
    res.status(400).json({ error: 'You cannot ban yourself' });
    return;
  }
  try {
    const result = await prisma.user.updateMany({
      where: { id: req.params.id },
      data: { bannedAt: banned ? new Date() : null },
    });
    if (result.count === 0) { res.status(404).json({ error: 'Not found' }); return; }
    if (banned) {
      // Revoke every session — combined with the ban check in requireAuth,
      // the user is locked out immediately, not at token expiry.
      await prisma.refreshToken.deleteMany({ where: { userId: req.params.id } });
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error(err, 'Admin ban error');
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/users/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.params.id === req.userId) {
    res.status(400).json({ error: 'You cannot delete your own account' });
    return;
  }
  try {
    // Folders, bookmarks, reading list, feed articles, and sessions all cascade
    const result = await prisma.user.deleteMany({ where: { id: req.params.id } });
    if (result.count === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ ok: true });
  } catch (err) {
    logger.error(err, 'Admin delete error');
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
