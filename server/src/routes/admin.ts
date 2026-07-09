import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth';
import logger from '../lib/logger';

const router = Router();
router.use(requireAuth, requireAdmin);

const SIGNUP_WINDOW_DAYS = 30;

router.get('/stats', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (SIGNUP_WINDOW_DAYS - 1));

    const [users, admins, totpUsers, bookmarks, folders, readingItems, feedArticles, recentUsers, activeTokens] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isAdmin: true } }),
      prisma.user.count({ where: { totpEnabled: true } }),
      prisma.bookmark.count(),
      prisma.folder.count(),
      prisma.readingListItem.count(),
      prisma.feedArticle.count(),
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
        isAdmin: true,
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
      isAdmin: u.isAdmin,
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

export default router;
