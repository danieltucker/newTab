import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

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
  const { name, color, folderId } = req.body;
  const result = await prisma.bookmark.updateMany({
    where: { id: req.params.id, userId: req.userId! },
    data: { ...(name && { name }), ...(color && { color }), ...(folderId && { folderId }) },
  });
  if (result.count === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ ok: true });
});

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await prisma.bookmark.deleteMany({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (result.count === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ ok: true });
});

export default router;
