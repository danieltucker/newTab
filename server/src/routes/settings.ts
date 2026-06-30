import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

export interface UserSettings {
  searchEngine: 'google' | 'duckduckgo' | 'bing' | 'brave';
  searchNewTab: boolean;
  theme: 'dark' | 'light' | 'auto';
  consoleEnabled: boolean;
  weatherLocation: string;
  weatherUnit: 'celsius' | 'fahrenheit';
  notes: string;
  clockFormat: '12h' | '24h';
  articleOpenMode: 'new-tab' | 'same-tab' | 'iframe';
  readingListOpenMode?: 'new-tab' | 'same-tab' | 'reader';
  bookmarkOpenMode?: 'same-tab' | 'new-tab';
  backgroundGradient?: 'none' | 'aurora' | 'dusk' | 'ocean' | 'midnight' | 'rose';
  activeWidgets: string[];
  worldClockZones: Array<{ city: string; zone: string }>;
  rssFeedUrls: string[];
}

const DEFAULTS: UserSettings = {
  searchEngine: 'google',
  searchNewTab: false,
  theme: 'dark',
  consoleEnabled: true,
  weatherLocation: '',
  weatherUnit: 'celsius',
  notes: '',
  clockFormat: '12h',
  articleOpenMode: 'new-tab',
  readingListOpenMode: 'new-tab',
  bookmarkOpenMode: 'same-tab',
  backgroundGradient: 'none',
  activeWidgets: ['weather', 'notes'],
  worldClockZones: [],
  rssFeedUrls: [],
};

function mergeWithDefaults(stored: unknown): UserSettings {
  const s = (typeof stored === 'object' && stored !== null ? stored : {}) as any;
  const result = { ...DEFAULTS, ...s } as UserSettings;
  // Migrate from old single-URL field
  if (typeof s.rssFeedUrl === 'string' && s.rssFeedUrl && !Array.isArray(s.rssFeedUrls)) {
    result.rssFeedUrls = [s.rssFeedUrl];
  }
  return result;
}

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { settings: true },
  });
  res.json(mergeWithDefaults(user?.settings));
});

router.patch('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const allowed = new Set(['searchEngine', 'searchNewTab', 'theme', 'consoleEnabled', 'weatherLocation', 'weatherUnit', 'notes', 'clockFormat', 'articleOpenMode', 'readingListOpenMode', 'bookmarkOpenMode', 'backgroundGradient', 'activeWidgets', 'worldClockZones', 'rssFeedUrls']);
  const incoming = req.body as Record<string, unknown>;

  // Validate keys
  const invalid = Object.keys(incoming).filter(k => !allowed.has(k));
  if (invalid.length > 0) {
    res.status(400).json({ error: `Unknown settings key(s): ${invalid.join(', ')}` });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { settings: true } });
  const current = mergeWithDefaults(user?.settings);
  const updated = { ...current, ...incoming } as UserSettings;

  await prisma.user.update({ where: { id: req.userId! }, data: { settings: updated as object } });
  res.json(updated);
});

export default router;
