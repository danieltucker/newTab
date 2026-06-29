import { Router, Request, Response } from 'express';
import nodeFetch from 'node-fetch';

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

const router = Router();

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

// Returns the deterministic palette color for a domain — consistent with client-side derivation
router.get('/color', (req: Request, res: Response): void => {
  const { domain } = req.query;
  if (!domain) { res.status(400).json({ error: 'domain required' }); return; }
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.json({ color: deriveColor(domain as string) });
});

export default router;
