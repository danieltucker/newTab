import { useState, useRef } from 'react';
import styles from './NewFolderModal.module.css';
import ownStyles from './EditFolderModal.module.css';
import { Folder } from '../types';

const PALETTE = [
  '#5E6AD2', '#FF4500', '#EA4C89', '#1DB954', '#F48024', '#A259FF',
  '#E0479E', '#00A8E8', '#FF6600', '#24A0ED', '#7C5CFC', '#0FB57B',
];

interface BookmarkFeed {
  name: string;
  domain: string;
  feedUrl: string;
}

interface Props {
  folder: Folder;
  bookmarkFeeds?: BookmarkFeed[];
  onSave: (id: string, updates: { name: string; color: string; feedUrls: string[] }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

const XIcon = () => (
  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M1 1l10 10M11 1L1 11"/>
  </svg>
);

export default function EditFolderModal({ folder, bookmarkFeeds = [], onSave, onDelete, onClose }: Props) {
  const [name, setName]         = useState(folder.name);
  const [color, setColor]       = useState(folder.color);
  const [feedUrls, setFeedUrls] = useState<string[]>(folder.feedUrls ?? []);
  const [feedInput, setFeedInput] = useState('');
  const [loading, setLoading]   = useState(false);
  const [confirming, setConfirming] = useState(false);
  const feedInputRef = useRef<HTMLInputElement>(null);

  function addFeedUrl(url: string) {
    const trimmed = url.trim();
    if (!trimmed || feedUrls.includes(trimmed)) return;
    setFeedUrls(prev => [...prev, trimmed]);
    setFeedInput('');
    feedInputRef.current?.focus();
  }

  function removeFeedUrl(url: string) {
    setFeedUrls(prev => prev.filter(u => u !== url));
  }

  function labelForUrl(url: string): string {
    const match = bookmarkFeeds.find(b => b.feedUrl === url);
    if (match) return match.name;
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  }

  async function handleSave() {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onSave(folder.id, { name: name.trim(), color, feedUrls });
      onClose();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    setLoading(true);
    try {
      await onDelete(folder.id);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  const unusedBookmarkFeeds = bookmarkFeeds.filter(b => !feedUrls.includes(b.feedUrl));

  return (
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`${styles.card} ${ownStyles.wideCard}`} onClick={e => e.stopPropagation()}>
        <div className={styles.title}>Edit folder</div>

        <label className={styles.label}>Folder name</label>
        <input
          className={styles.input}
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
        />

        <label className={styles.label}>Color</label>
        <div className={styles.colorRow}>
          {PALETTE.map(c => (
            <button
              key={c}
              className={`${styles.colorSwatch} ${c === color ? styles.selected : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>

        {/* ── RSS Feeds ────────────────────────────── */}
        <label className={styles.label}>RSS Feeds</label>

        {feedUrls.length > 0 && (
          <div className={ownStyles.feedList}>
            {feedUrls.map(url => (
              <div key={url} className={ownStyles.feedItem}>
                <span className={ownStyles.feedLabel}>{labelForUrl(url)}</span>
                <button className={ownStyles.feedRemove} onClick={() => removeFeedUrl(url)} title="Remove"><XIcon /></button>
              </div>
            ))}
          </div>
        )}

        {unusedBookmarkFeeds.length > 0 && (
          <div className={ownStyles.suggestions}>
            <div className={ownStyles.sugLabel}>From bookmarks in this folder</div>
            {unusedBookmarkFeeds.map(b => (
              <button key={b.feedUrl} className={ownStyles.sugItem} onClick={() => addFeedUrl(b.feedUrl)}>
                <span className={ownStyles.sugName}>{b.name}</span>
                <span className={ownStyles.sugDomain}>{b.domain}</span>
                <span className={ownStyles.sugAdd}>+</span>
              </button>
            ))}
          </div>
        )}

        <form
          className={ownStyles.feedForm}
          onSubmit={e => { e.preventDefault(); addFeedUrl(feedInput); }}
        >
          <input
            ref={feedInputRef}
            className={ownStyles.feedInput}
            value={feedInput}
            onChange={e => setFeedInput(e.target.value)}
            placeholder="https://example.com/feed"
          />
          <button className={ownStyles.feedAdd} type="submit" disabled={!feedInput.trim()}>Add</button>
        </form>

        <div className={ownStyles.actionsRow}>
          {confirming ? (
            <div className={ownStyles.confirmRow}>
              <span className={ownStyles.confirmText}>Delete folder and all its bookmarks?</span>
              <button className={ownStyles.confirmYes} onClick={handleDelete} disabled={loading}>Delete</button>
              <button className={ownStyles.confirmNo} onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          ) : (
            <button className={ownStyles.deleteBtn} onClick={() => setConfirming(true)}>Delete folder</button>
          )}
          <div className={styles.actions}>
            <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button className={styles.createBtn} onClick={handleSave} disabled={!name.trim() || loading}>
              {loading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
