import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth';
import folderRoutes from './routes/folders';
import bookmarkRoutes from './routes/bookmarks';
import readingListRoutes from './routes/readingList';
import utilRoutes from './routes/util';
import settingsRoutes from './routes/settings';
import totpRoutes from './routes/totp';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api/reading-list', readingListRoutes);
app.use('/api/util', utilRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/totp', totpRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
