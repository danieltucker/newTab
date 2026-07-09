import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import logger from './lib/logger';
import authRoutes from './routes/auth';
import folderRoutes from './routes/folders';
import bookmarkRoutes from './routes/bookmarks';
import readingListRoutes from './routes/readingList';
import utilRoutes from './routes/util';
import settingsRoutes from './routes/settings';
import totpRoutes from './routes/totp';
import widgetRoutes from './routes/widgets';
import adminRoutes from './routes/admin';
import accountRoutes from './routes/account';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

// Strict limit on auth endpoints — prevents brute-force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// General API limit — generous for normal use, blocks bulk abuse
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/folders', apiLimiter, folderRoutes);
app.use('/api/v1/bookmarks', apiLimiter, bookmarkRoutes);
app.use('/api/v1/reading-list', apiLimiter, readingListRoutes);
app.use('/api/v1/util', apiLimiter, utilRoutes);
app.use('/api/v1/settings', apiLimiter, settingsRoutes);
app.use('/api/v1/totp', apiLimiter, totpRoutes);
app.use('/api/v1/widgets', apiLimiter, widgetRoutes);
app.use('/api/v1/admin', apiLimiter, adminRoutes);
app.use('/api/v1/account', apiLimiter, accountRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const server = app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down gracefully');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  // Force-exit if connections don't drain within 10s
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
