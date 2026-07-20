import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const items = await prisma.readingListItem.findMany({
    where: { userId: req.userId! },
    orderBy: { savedAt: 'desc' },
    take: 500,
  });
  res.json(items);
});

// Empty string is allowed (no image); otherwise must be a sane http(s) URL
function validImageUrl(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string' || v.length > 2048) return null;
  try {
    const parsed = new URL(v);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return v;
}

router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { url, title, source, readTime, tag, imageUrl } = req.body;
  if (!url || !title) { res.status(400).json({ error: 'url and title required' }); return; }
  if (typeof url !== 'string' || url.length > 2048) { res.status(400).json({ error: 'url must be ≤2048 characters' }); return; }
  if (typeof title !== 'string' || title.length > 500) { res.status(400).json({ error: 'title must be ≤500 characters' }); return; }
  if (source !== undefined && typeof source === 'string' && source.length > 200) { res.status(400).json({ error: 'source must be ≤200 characters' }); return; }
  const image = validImageUrl(imageUrl);
  if (image === null) { res.status(400).json({ error: 'imageUrl must be an http(s) URL ≤2048 characters' }); return; }

  // Only allow http/https — blocks javascript:, data:, vbscript:, etc.
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      res.status(400).json({ error: 'URL must use http or https' }); return;
    }
  } catch {
    res.status(400).json({ error: 'Invalid URL' }); return;
  }

  const item = await prisma.readingListItem.create({
    data: {
      userId: req.userId!,
      url,
      title,
      source: source || '',
      readTime: readTime || '',
      tag: tag || '',
      imageUrl: image,
    },
  });
  res.status(201).json(item);
});

router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { archived, title, tag, notes } = req.body;
  const data: Record<string, unknown> = {};
  if (typeof archived === 'boolean') data.archived = archived;
  if (typeof title === 'string') {
    if (title.length > 500) { res.status(400).json({ error: 'title must be ≤500 characters' }); return; }
    data.title = title;
  }
  if (typeof tag === 'string') data.tag = tag;
  if (typeof notes === 'string') {
    if (notes.length > 50000) { res.status(400).json({ error: 'notes must be ≤50,000 characters' }); return; }
    data.notes = notes;
  }
  if (Object.keys(data).length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }
  const existing = await prisma.readingListItem.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
  const item = await prisma.readingListItem.update({
    where: { id: req.params.id },
    data,
  });
  res.json(item);
});

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await prisma.readingListItem.deleteMany({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (result.count === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ ok: true });
});

export default router;
