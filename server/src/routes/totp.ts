import { Router, Response } from 'express';
import QRCode from 'qrcode';
import speakeasy from 'speakeasy';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// GET /api/totp/status
router.get('/status', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { totpEnabled: true } });
  res.json({ enabled: user?.totpEnabled ?? false });
});

// POST /api/totp/enroll — generate a fresh secret + QR code for the user to scan
router.post('/enroll', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { username: true } });
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  const secret = speakeasy.generateSecret({ length: 20 });

  // Manually build the URL so issuer appears as both the label prefix and a query param.
  // Some apps (Authy, Microsoft Authenticator) silently ignore the account if issuer is absent.
  const otpauthUrl =
    `otpauth://totp/${encodeURIComponent(`NewTab:${user.username}`)}` +
    `?secret=${secret.base32}&issuer=NewTab&algorithm=SHA1&digits=6&period=30`;

  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { width: 256, errorCorrectionLevel: 'M' });
  res.json({ secret: secret.base32, qrDataUrl });
});

// POST /api/totp/confirm — verify the first code then permanently enable TOTP
router.post('/confirm', async (req: AuthRequest, res: Response): Promise<void> => {
  const { secret, code } = req.body;
  if (!secret || !code) { res.status(400).json({ error: 'secret and code required' }); return; }

  const valid = speakeasy.totp.verify({ secret, encoding: 'base32', token: String(code), window: 2 });
  if (!valid) {
    const expected = speakeasy.totp({ secret, encoding: 'base32' });
    console.error(`[TOTP confirm] received="${code}" expected="${expected}" serverTime=${new Date().toISOString()}`);
    res.status(422).json({ error: 'Invalid code — try again' }); return;
  }

  await prisma.user.update({
    where: { id: req.userId! },
    data: { totpSecret: secret, totpEnabled: true },
  });
  res.json({ ok: true });
});

// POST /api/totp/disable — verify current code then remove TOTP
router.post('/disable', async (req: AuthRequest, res: Response): Promise<void> => {
  const { code } = req.body;
  if (!code) { res.status(400).json({ error: 'code required' }); return; }

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user?.totpEnabled || !user.totpSecret) {
    res.status(400).json({ error: 'TOTP not enabled' }); return;
  }

  const valid = speakeasy.totp.verify({ secret: user.totpSecret, encoding: 'base32', token: String(code), window: 2 });
  if (!valid) { res.status(401).json({ error: 'Invalid code' }); return; }

  await prisma.user.update({
    where: { id: req.userId! },
    data: { totpSecret: null, totpEnabled: false },
  });
  res.json({ ok: true });
});

export default router;
