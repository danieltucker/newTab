import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const items = await prisma.readingListItem.findMany({
    where: { userId: req.userId! },
    orderBy: { savedAt: 'desc' },
  });
  res.json(items);
});

router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { url, title, source, readTime, tag } = req.body;
  if (!url || !title) { res.status(400).json({ error: 'url and title required' }); return; }
  const item = await prisma.readingListItem.create({
    data: {
      userId: req.userId!,
      url,
      title,
      source: source || '',
      readTime: readTime || '',
      tag: tag || '',
    },
  });
  res.status(201).json(item);
});

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await prisma.readingListItem.deleteMany({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (result.count === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ ok: true });
});

export default router;
