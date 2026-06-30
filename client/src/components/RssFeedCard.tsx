import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../services/api';
import styles from './RssFeedCard.module.css';

interface FeedItem {
  title: string;
  link: string;
  date: string | null;
  source: string;
}

export interface FeedBookmark {
  name: string;
  domain: string;
  feedUrl: string;
}

interface Props {
  feedUrls: string[];
  onSetFeedUrls: (urls: string[]) => void;
  onRemove?: () => void;
  feedBookmarks?: FeedBookmark[];
}

function relativeDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

function labelForUrl(url: string, bookmarks: FeedBookmark[]): string {
  const match = bookmarks.find(b => b.feedUrl === url);
  if (match) return match.name;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

const XIcon = () => (
  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M1 1l10 10M11 1L1 11"/>
  </svg>
);

export default function RssFeedCard({ feedUrls, onSetFeedUrls, onRemove, feedBookmarks = [] }: Props) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const customRef = useRef<HTMLInputElement>(null);

  // Fetch all feeds whenever feedUrls changes
  useEffect(() => {
    if (feedUrls.length === 0) { setItems([]); return; }
    setLoading(true);
    setErrors({});
    const newErrors: Record<string, string> = {};

    Promise.all(
      feedUrls.map(url =>
        apiFetch(`/api/widgets/rss?url=${encodeURIComponent(url)}`)
          .then(r => r.ok ? r.json() : r.json().then((e: any) => Promise.reject(new Error(e.error ?? `Error ${r.status}`))))
          .then((data: { title: string; items: Array<{ title: string; link: string; date: string | null }> }) => ({
            title: data.title || new URL(url).hostname,
            items: (data.items || []).map(i => ({ ...i, source: data.title || new URL(url).hostname })),
          }))
          .catch((e: Error) => { newErrors[url] = e.message; return { title: '', items: [] as FeedItem[] }; })
      )
    ).then(results => {
      const all = results.flatMap(r => r.items);
      all.sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
      setItems(all.slice(0, 12));
      setErrors(newErrors);
      setLoading(false);
    });
  }, [feedUrls]); // eslint-disable-line react-hooks/exhaustive-deps

  function openEdit() {
    setDraft([...feedUrls]);
    setCustomInput('');
    setEditing(true);
  }

  function handleSave() {
    onSetFeedUrls(draft);
    setEditing(false);
  }

  function handleCancel() {
    setEditing(false);
  }

  function toggleDraft(url: string) {
    setDraft(prev => prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]);
  }

  function addCustom() {
    const url = customInput.trim();
    if (url && !draft.includes(url)) setDraft(prev => [...prev, url]);
    setCustomInput('');
    customRef.current?.focus();
  }

  function removeDraft(url: string) {
    setDraft(prev => prev.filter(u => u !== url));
  }

  const errorUrls = Object.keys(errors);

  if (feedUrls.length === 0 && !editing) {
    return (
      <div className={styles.card}>
        <div className={styles.cardLabel}>
          <span>RSS Feed</span>
          <div className={styles.labelRight}>
            {onRemove && <button className={styles.removeBtn} onClick={onRemove} title="Remove widget"><XIcon /></button>}
          </div>
        </div>
        <div className={styles.empty}>
          <button className={styles.setUrlBtn} onClick={openEdit}>Add feeds to get started</button>
          {feedBookmarks.length > 0 && (
            <div className={styles.suggestions}>
              <div className={styles.sugLabel}>From your bookmarks</div>
              {feedBookmarks.map(b => (
                <button key={b.feedUrl} className={styles.sugItem} onClick={() => onSetFeedUrls([b.feedUrl])}>
                  <span className={styles.sugName}>{b.name}</span>
                  <span className={styles.sugDomain}>{b.domain}</span>
                  <span className={styles.sugAdd}>+</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className={styles.card}>
        <div className={styles.cardLabel}>
          <span>Edit feeds</span>
          <div className={styles.labelRight}>
            <button className={styles.cancelEditBtn} onClick={handleCancel}>Cancel</button>
            <button className={styles.saveBtn} onClick={handleSave}>Save</button>
          </div>
        </div>

        {/* Currently in draft */}
        {draft.length > 0 && (
          <div className={styles.draftList}>
            {draft.map(url => (
              <div key={url} className={styles.draftItem}>
                <span className={styles.draftLabel}>{labelForUrl(url, feedBookmarks)}</span>
                <button className={styles.draftRemove} onClick={() => removeDraft(url)} title="Remove"><XIcon /></button>
              </div>
            ))}
          </div>
        )}

        {/* Bookmark suggestions */}
        {feedBookmarks.length > 0 && (
          <div className={styles.suggestions}>
            <div className={styles.sugLabel}>From your bookmarks</div>
            {feedBookmarks.map(b => {
              const added = draft.includes(b.feedUrl);
              return (
                <button
                  key={b.feedUrl}
                  className={`${styles.sugItem} ${added ? styles.sugItemAdded : ''}`}
                  onClick={() => toggleDraft(b.feedUrl)}
                >
                  <span className={styles.sugName}>{b.name}</span>
                  <span className={styles.sugDomain}>{b.domain}</span>
                  <span className={styles.sugAdd}>{added ? '✓' : '+'}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Custom URL */}
        <form
          className={styles.customForm}
          onSubmit={e => { e.preventDefault(); addCustom(); }}
        >
          <input
            ref={customRef}
            className={styles.urlInput}
            value={customInput}
            onChange={e => setCustomInput(e.target.value)}
            placeholder="https://example.com/feed"
          />
          <button className={styles.urlSubmit} type="submit" disabled={!customInput.trim()}>Add</button>
        </form>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardLabel}>
        <span>RSS Feed</span>
        <div className={styles.labelRight}>
          {!loading && (
            <button className={styles.iconBtn} onClick={() => { setItems([]); setLoading(true); onSetFeedUrls([...feedUrls]); }} title="Refresh">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
            </button>
          )}
          <button className={styles.iconBtn} onClick={openEdit} title="Edit feeds">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          {onRemove && <button className={styles.removeBtn} onClick={onRemove} title="Remove widget"><XIcon /></button>}
        </div>
      </div>

      {loading && <div className={styles.loading}>Loading…</div>}

      {!loading && errorUrls.length > 0 && (
        <div className={styles.errorList}>
          {errorUrls.map(url => (
            <div key={url} className={styles.errorRow}>
              <span className={styles.error}>{labelForUrl(url, feedBookmarks)}: {errors[url]}</span>
            </div>
          ))}
        </div>
      )}

      {!loading && items.map((item, i) => (
        <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" className={styles.feedItem}>
          <div className={styles.feedMain}>
            <span className={styles.feedTitle}>{item.title}</span>
            {feedUrls.length > 1 && <span className={styles.feedSource}>{item.source}</span>}
          </div>
          {item.date && <span className={styles.feedDate}>{relativeDate(item.date)}</span>}
        </a>
      ))}

      {!loading && items.length === 0 && errorUrls.length === 0 && (
        <div className={styles.empty}>
          <span className={styles.emptyText}>No items found</span>
        </div>
      )}
    </div>
  );
}
