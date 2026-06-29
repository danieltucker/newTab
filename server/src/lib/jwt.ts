import jwt from 'jsonwebtoken';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'change-me-access';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'change-me-refresh';
const TOTP_PENDING_SECRET = (process.env.JWT_ACCESS_SECRET || 'change-me-access') + '-totp-pending';

export const ACCESS_TTL = '15m';
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function signAccess(userId: string): string {
  return jwt.sign({ sub: userId }, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

export function signRefresh(userId: string): string {
  return jwt.sign({ sub: userId }, REFRESH_SECRET, { expiresIn: '7d' });
}

// Short-lived token (3 min) issued after password check when TOTP is required
export function signTotpPending(userId: string): string {
  return jwt.sign({ sub: userId, type: 'totp-pending' }, TOTP_PENDING_SECRET, { expiresIn: '3m' });
}

export function verifyAccess(token: string): { sub: string } {
  return jwt.verify(token, ACCESS_SECRET) as { sub: string };
}

export function verifyRefresh(token: string): { sub: string } {
  return jwt.verify(token, REFRESH_SECRET) as { sub: string };
}

export function verifyTotpPending(token: string): { sub: string } {
  const payload = jwt.verify(token, TOTP_PENDING_SECRET) as { sub: string; type: string };
  if (payload.type !== 'totp-pending') throw new Error('Invalid token type');
  return payload;
}
