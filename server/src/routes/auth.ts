import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { signAccess, signRefresh, verifyRefresh, REFRESH_TTL_MS } from '../lib/jwt';

const router = Router();

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: REFRESH_TTL_MS,
  path: '/api/auth',
};

const DEFAULT_FOLDERS = [
  { name: 'Work', color: '#5E6AD2', position: 0 },
  { name: 'Daily', color: '#1DB954', position: 1 },
  { name: 'Reading', color: '#F48024', position: 2 },
];

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }
  if (username.length < 3) {
    res.status(400).json({ error: 'Username must be at least 3 characters' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        folders: {
          create: DEFAULT_FOLDERS,
        },
      },
    });
    const accessToken = signAccess(user.id);
    const refreshToken = signRefresh(user.id);
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    res.cookie('refreshToken', refreshToken, COOKIE_OPTS);
    res.status(201).json({ accessToken, username: user.username });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') {
      res.status(409).json({ error: 'Username already taken' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }
  try {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const accessToken = signAccess(user.id);
    const refreshToken = signRefresh(user.id);
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    res.cookie('refreshToken', refreshToken, COOKIE_OPTS);
    res.json({ accessToken, username: user.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  const token = req.cookies?.refreshToken;
  if (!token) {
    res.status(401).json({ error: 'No refresh token' });
    return;
  }
  try {
    const payload = verifyRefresh(token);
    const stored = await prisma.refreshToken.findUnique({ where: { token } });
    if (!stored || stored.userId !== payload.sub || stored.expiresAt < new Date()) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }
    // rotate
    await prisma.refreshToken.delete({ where: { token } });
    const newRefresh = signRefresh(payload.sub);
    await prisma.refreshToken.create({
      data: {
        token: newRefresh,
        userId: payload.sub,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { username: true } });
    res.cookie('refreshToken', newRefresh, COOKIE_OPTS);
    res.json({ accessToken: signAccess(payload.sub), username: user?.username });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

router.post('/logout', async (req: Request, res: Response): Promise<void> => {
  const token = req.cookies?.refreshToken;
  if (token) {
    await prisma.refreshToken.deleteMany({ where: { token } }).catch(() => {});
  }
  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.json({ ok: true });
});

export default router;
