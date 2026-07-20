import { useState, useEffect, useMemo } from 'react';
import { apiGet, apiPatch, apiDelete } from '../services/api';
import styles from './AdminModal.module.css';

interface HistoryPoint { date: string; total: number }

interface AdminStats {
  totals: {
    users: number;
    admins: number;
    totpUsers: number;
    bookmarks: number;
    folders: number;
    readingItems: number;
    feedArticles: number;
  };
  activeUsers7d: number;
  signups: { date: string; count: number }[];
  history: {
    users: HistoryPoint[];
    bookmarks: HistoryPoint[];
  };
}

interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  isAdmin: boolean;
  bannedAt: string | null;
  totpEnabled: boolean;
  createdAt: string;
  bookmarks: number;
  folders: number;
  readingItems: number;
  lastActiveAt: string | null;
}

interface Props {
  currentUsername: string;
  onClose: () => void;
}

function formatDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
}

function relativeDate(s: string | null): string {
  if (!s) return 'never';
  const diff = Date.now() - new Date(s).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return formatDate(s);
}

/* Trend over the window: % change when there's a baseline, absolute otherwise */
function TrendBadge({ points }: { points: HistoryPoint[] }) {
  const first = points[0]?.total ?? 0;
  const last = points[points.length - 1]?.total ?? 0;
  const delta = last - first;

  let text: string;
  if (first === 0) text = delta > 0 ? `+${delta} new` : 'no change';
  else {
    const pct = (delta / first) * 100;
    text = `${pct >= 0 ? '+' : ''}${Math.abs(pct) < 10 ? pct.toFixed(1) : Math.round(pct)}% (90d)`;
  }
  const cls = delta > 0 ? styles.trendUp : delta < 0 ? styles.trendDown : styles.trendFlat;
  return <span className={`${styles.trendBadge} ${cls}`}>{text}</span>;
}

/* Hand-rolled line chart with area fill — one point per day */
function LineChart({ points, gradientId }: { points: HistoryPoint[]; gradientId: string }) {
  const W = 600, H = 140, PAD_B = 18, PAD_T = 10;
  const totals = points.map(p => p.total);
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  const span = Math.max(1, max - min);
  const plotH = H - PAD_B - PAD_T;

  const x = (i: number) => (i / Math.max(1, points.length - 1)) * W;
  const y = (t: number) => PAD_T + plotH - ((t - min) / span) * plotH;

  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join(' ');
  const area = `0,${H - PAD_B} ${line} ${W},${H - PAD_B}`;
  const lastPt = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} preserveAspectRatio="none" aria-label="Cumulative total over the last 90 days">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className={styles.areaTop} />
          <stop offset="100%" className={styles.areaBottom} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline points={line} className={styles.line} fill="none" vectorEffect="non-scaling-stroke" />
      {lastPt && (
        <circle cx={W} cy={y(lastPt.total)} r={3.5} className={styles.lineDot}>
          <title>{`${lastPt.date}: ${lastPt.total}`}</title>
        </circle>
      )}
      {points.map((p, i) => (
        i % 30 === 0 && (
          <text key={p.date} x={Math.max(x(i), 24)} y={H - 4} className={styles.axisLabel} textAnchor="middle">
            {new Date(p.date + 'T00:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' })}
          </text>
        )
      ))}
    </svg>
  );
}

/* Hand-rolled bar chart — one bar per day, no chart library needed */
function SignupChart({ signups }: { signups: AdminStats['signups'] }) {
  const W = 600, H = 140, PAD_B = 18;
  const max = Math.max(1, ...signups.map(s => s.count));
  const barW = W / signups.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} preserveAspectRatio="none" aria-label="Signups per day, last 30 days">
      {signups.map((s, i) => {
        const h = (s.count / max) * (H - PAD_B - 8);
        const x = i * barW;
        return (
          <g key={s.date}>
            <rect
              x={x + barW * 0.18}
              y={H - PAD_B - h}
              width={barW * 0.64}
              height={Math.max(h, s.count > 0 ? 3 : 1.5)}
              rx={2}
              className={s.count > 0 ? styles.bar : styles.barEmpty}
            >
              <title>{`${s.date}: ${s.count} signup${s.count === 1 ? '' : 's'}`}</title>
            </rect>
            {i % 7 === 0 && (
              <text x={x + barW / 2} y={H - 4} className={styles.axisLabel} textAnchor="middle">
                {new Date(s.date + 'T00:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' })}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function AdminModal({ currentUsername, onClose }: Props) {
  const [tab, setTab] = useState<'overview' | 'users'>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function copyToClipboard(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 1500);
    } catch { /* clipboard unavailable (e.g. insecure context) — ignore */ }
  }

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      u.username.toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q)
    );
  }, [users, query]);

  useEffect(() => {
    Promise.all([
      apiGet<AdminStats>('/api/v1/admin/stats'),
      apiGet<AdminUser[]>('/api/v1/admin/users'),
    ])
      .then(([s, u]) => { setStats(s); setUsers(u); })
      .catch(() => setError('Could not load admin data'));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function toggleBan(u: AdminUser) {
    setBusyId(u.id);
    try {
      await apiPatch(`/api/v1/admin/users/${u.id}/ban`, { banned: !u.bannedAt });
      setUsers(prev => prev.map(x => x.id === u.id
        ? { ...x, bannedAt: u.bannedAt ? null : new Date().toISOString() }
        : x));
    } catch {
      setError('Could not update ban status');
    } finally {
      setBusyId(null);
    }
  }

  async function deleteUser(u: AdminUser) {
    setBusyId(u.id);
    try {
      await apiDelete(`/api/v1/admin/users/${u.id}`);
      setUsers(prev => prev.filter(x => x.id !== u.id));
      setStats(prev => prev ? {
        ...prev,
        totals: { ...prev.totals, users: prev.totals.users - 1 },
      } : prev);
    } catch {
      setError('Could not delete account');
    } finally {
      setBusyId(null);
      setConfirmDeleteId(null);
    }
  }

  async function toggleAdmin(u: AdminUser) {
    setBusyId(u.id);
    try {
      await apiPatch(`/api/v1/admin/users/${u.id}/admin`, { isAdmin: !u.isAdmin });
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, isAdmin: !u.isAdmin } : x));
      setStats(prev => prev ? {
        ...prev,
        totals: { ...prev.totals, admins: prev.totals.admins + (u.isAdmin ? -1 : 1) },
      } : prev);
    } catch {
      setError('Could not update admin status');
    } finally {
      setBusyId(null);
    }
  }

  const totalSignups30d = stats?.signups.reduce((n, s) => n + s.count, 0) ?? 0;

  return (
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.panel}>
        <div className={styles.nav}>
          <div className={styles.navHeader}>Admin</div>
          <button className={`${styles.navItem} ${tab === 'overview' ? styles.navActive : ''}`} onClick={() => setTab('overview')}>
            Overview
          </button>
          <button className={`${styles.navItem} ${tab === 'users' ? styles.navActive : ''}`} onClick={() => setTab('users')}>
            Users
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.contentHeader}>
            <span className={styles.title}>{tab === 'overview' ? 'Overview' : 'Users'}</span>
            <button className={styles.closeBtn} onClick={onClose}>✕ Close</button>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          {tab === 'overview' && stats && (
            <div className={styles.body}>
              <div className={styles.statGrid}>
                <div className={styles.statCard}>
                  <span className={styles.statValue}>{stats.totals.users}</span>
                  <span className={styles.statLabel}>Users</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statValue}>{stats.activeUsers7d}</span>
                  <span className={styles.statLabel}>Active (7d)</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statValue}>{stats.totals.admins}</span>
                  <span className={styles.statLabel}>Admins</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statValue}>{stats.totals.totpUsers}</span>
                  <span className={styles.statLabel}>With 2FA</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statValue}>{stats.totals.bookmarks}</span>
                  <span className={styles.statLabel}>Bookmarks</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statValue}>{stats.totals.readingItems}</span>
                  <span className={styles.statLabel}>Saved articles</span>
                </div>
              </div>

              <div className={styles.chartBlock}>
                <div className={styles.chartTitle}>
                  New users — last 30 days
                  <span className={styles.chartTotal}>{totalSignups30d} total</span>
                </div>
                <SignupChart signups={stats.signups} />
              </div>

              <div className={styles.chartBlock}>
                <div className={styles.chartTitle}>
                  Total users — last 90 days
                  <TrendBadge points={stats.history.users} />
                </div>
                <LineChart points={stats.history.users} gradientId="admin-users-grad" />
              </div>

              <div className={styles.chartBlock}>
                <div className={styles.chartTitle}>
                  Total bookmarks — last 90 days
                  <TrendBadge points={stats.history.bookmarks} />
                </div>
                <LineChart points={stats.history.bookmarks} gradientId="admin-bookmarks-grad" />
              </div>
            </div>
          )}

          {tab === 'users' && (
            <div className={styles.body}>
              <input
                className={styles.searchInput}
                type="text"
                placeholder="Search by username or email…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Joined</th>
                    <th>Last active</th>
                    <th className={styles.num}>Bookmarks</th>
                    <th>2FA</th>
                    <th>Admin</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(u => {
                    const isSelf = u.username === currentUsername;
                    const banned = !!u.bannedAt;
                    return (
                      <tr key={u.id} className={banned ? styles.bannedRow : ''}>
                        <td className={styles.userCell}>
                          <span
                            className={styles.copyable}
                            title="Click to copy"
                            onClick={() => copyToClipboard(u.username, `${u.id}-username`)}
                          >
                            {u.username}
                          </span>
                          {copiedKey === `${u.id}-username` && <span className={styles.copiedChip}>copied</span>}
                          {isSelf && <span className={styles.youBadge}>you</span>}
                          {banned && <span className={styles.bannedBadge}>banned</span>}
                        </td>
                        <td className={styles.emailCell}>
                          {u.email ? (
                            <>
                              <span
                                className={styles.copyable}
                                title="Click to copy"
                                onClick={() => copyToClipboard(u.email!, `${u.id}-email`)}
                              >
                                {u.email}
                              </span>
                              {copiedKey === `${u.id}-email` && <span className={styles.copiedChip}>copied</span>}
                            </>
                          ) : '—'}
                        </td>
                        <td>{formatDate(u.createdAt)}</td>
                        <td>{relativeDate(u.lastActiveAt)}</td>
                        <td className={styles.num}>{u.bookmarks}</td>
                        <td>{u.totpEnabled ? <span className={styles.badgeOn}>on</span> : <span className={styles.badgeOff}>off</span>}</td>
                        <td>
                          <button
                            className={`${styles.adminToggle} ${u.isAdmin ? styles.adminOn : ''}`}
                            onClick={() => toggleAdmin(u)}
                            disabled={isSelf || busyId === u.id}
                            title={isSelf ? 'You cannot remove your own admin access' : u.isAdmin ? 'Revoke admin' : 'Make admin'}
                          >
                            {u.isAdmin ? 'Admin' : 'Grant'}
                          </button>
                        </td>
                        <td>
                          <div className={styles.actionCell}>
                            <button
                              className={`${styles.adminToggle} ${banned ? styles.unbanBtn : styles.banBtn}`}
                              onClick={() => toggleBan(u)}
                              disabled={isSelf || busyId === u.id}
                              title={isSelf ? 'You cannot ban yourself' : banned ? `Banned ${formatDate(u.bannedAt)} — click to unban` : 'Ban: signs the user out and blocks sign-in'}
                            >
                              {banned ? 'Unban' : 'Ban'}
                            </button>
                            {confirmDeleteId === u.id ? (
                              <>
                                <button
                                  className={`${styles.adminToggle} ${styles.deleteConfirmBtn}`}
                                  onClick={() => deleteUser(u)}
                                  disabled={busyId === u.id}
                                >
                                  Confirm
                                </button>
                                <button className={styles.adminToggle} onClick={() => setConfirmDeleteId(null)}>
                                  ✕
                                </button>
                              </>
                            ) : (
                              <button
                                className={`${styles.adminToggle} ${styles.banBtn}`}
                                onClick={() => setConfirmDeleteId(u.id)}
                                disabled={isSelf || busyId === u.id}
                                title={isSelf ? 'You cannot delete your own account' : 'Permanently delete this account and all its data'}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredUsers.length === 0 && (
                <div className={styles.emptyResult}>No users match "{query}"</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
