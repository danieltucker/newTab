import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import logger from '../lib/logger';

const router = Router();
router.use(requireAuth);

// Avatars are stored as small base64 data URLs (client downscales to 128px
// before upload) — no image processing dependencies needed server-side.
const AVATAR_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const AVATAR_MAX_CHARS = 150_000; // ~110 KB decoded

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { username: true, firstName: true, lastName: true, avatar: true, totpEnabled: true },
  });
  if (!user) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(user);
});

router.patch('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { firstName, lastName, avatar } = req.body as Record<string, unknown>;
  const data: Record<string, string | null> = {};

  if ('firstName' in req.body) {
    if (firstName !== null && (typeof firstName !== 'string' || firstName.length > 100)) {
      res.status(400).json({ error: 'firstName must be a string of ≤100 characters' }); return;
    }
    data.firstName = (firstName as string | null) || null;
  }
  if ('lastName' in req.body) {
    if (lastName !== null && (typeof lastName !== 'string' || lastName.length > 100)) {
      res.status(400).json({ error: 'lastName must be a string of ≤100 characters' }); return;
    }
    data.lastName = (lastName as string | null) || null;
  }
  if ('avatar' in req.body) {
    if (avatar !== null && avatar !== '') {
      if (typeof avatar !== 'string' || avatar.length > AVATAR_MAX_CHARS || !AVATAR_RE.test(avatar)) {
        res.status(400).json({ error: 'avatar must be a PNG/JPEG/WebP data URL under 110 KB' }); return;
      }
      data.avatar = avatar;
    } else {
      data.avatar = null;
    }
  }

  if (Object.keys(data).length === 0) { res.status(400).json({ error: 'Nothing to update' }); return; }

  try {
    const user = await prisma.user.update({
      where: { id: req.userId! },
      data,
      select: { username: true, firstName: true, lastName: true, avatar: true, totpEnabled: true },
    });
    res.json(user);
  } catch (err) {
    logger.error(err, 'Account update error');
    res.status(500).json({ error: 'Server error' });
  }
});

// Stricter limit — each attempt verifies the current password, so this is
// a brute-force surface just like login.
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

router.post('/password', passwordLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body as Record<string, unknown>;
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    res.status(400).json({ error: 'currentPassword and newPassword required' }); return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: 'New password must be at least 8 characters' }); return;
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      // 403, not 401 — a 401 would make the client think its access token
      // expired and silently refresh + retry the request.
      res.status(403).json({ error: 'Current password is incorrect' }); return;
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: req.userId! }, data: { passwordHash } });
    // Invalidate every session — anyone holding a stolen refresh token is out.
    // The current session survives until its access token expires (≤15 min).
    await prisma.refreshToken.deleteMany({ where: { userId: req.userId! } });
    res.json({ ok: true });
  } catch (err) {
    logger.error(err, 'Password change error');
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
