import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

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
  const { name, color } = req.body;
  try {
    const folder = await prisma.folder.updateMany({
      where: { id: req.params.id, userId: req.userId! },
      data: { ...(name && { name }), ...(color && { color }) },
    });
    if (folder.count === 0) { res.status(404).json({ error: 'Not found' }); return; }
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

export default router;
