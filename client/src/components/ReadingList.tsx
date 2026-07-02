import { useState, useEffect, useRef } from 'react';
import styles from './ReadingList.module.css';
import { ReadingListItem } from '../types';
import { parseDomain } from '../utils/color';
import { apiFetch } from '../services/api';
import TagChipInput from './TagChipInput';
import EditArticleModal from './EditArticleModal';

interface Props {
  items: ReadingListItem[];
  onSave: (item: Omit<ReadingListItem, 'id' | 'savedAt' | 'archived' | 'notes'>) => Promise<unknown>;
  onUpdate: (id: string, patch: Pick<ReadingListItem, 'title' | 'tag' | 'notes'>) => Promise<void>;
  onDelete: (id: string) => void;
  onArchive: (id: string, archived: boolean) => Promise<void>;
  articleOpenMode?: 'new-tab' | 'same-tab' | 'iframe';
  onOpenArticle?: (url: string) => void;
}

function parseTags(tag: string): string[] {
  return tag.split(',').map(t => t.trim()).filter(Boolean);
}

function ArchiveIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="10" height="3" rx="0.75"/>
      <path d="M2 4v6.25C2 10.66 2.34 11 2.75 11h6.5c.41 0 .75-.34.75-.75V4"/>
      <path d="M4.5 7l1.5 1.5L7.5 7"/><path d="M6 5.5v3"/>
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="10" height="3" rx="0.75"/>
      <path d="M2 4v6.25C2 10.66 2.34 11 2.75 11h6.5c.41 0 .75-.34.75-.75V4"/>
      <path d="M4.5 8.5L6 7l1.5 1.5"/><path d="M6 9V6.5"/>
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.5 1.5l2 2L3 10H1v-2L7.5 1.5z"/>
    </svg>
  );
}

interface CardProps {
  item: ReadingListItem;
  isPendingDelete?: boolean;
  onDelete: (id: string) => void;
  onUndo: (id: string) => void;
  onArchive: (id: string, archived: boolean) => Promise<void>;
  onEdit: (item: ReadingListItem) => void;
  articleOpenMode?: 'new-tab' | 'same-tab' | 'iframe';
  onOpenArticle?: (url: string) => void;
}

function ReadingCard({ item, isPendingDelete, onDelete, onUndo, onArchive, onEdit, articleOpenMode = 'new-tab', onOpenArticle }: CardProps) {
  const tags = parseTags(item.tag);

  function handleCardClick(e: React.MouseEvent) {
    if (articleOpenMode === 'iframe') {
      e.preventDefault();
      onOpenArticle?.(item.url);
    }
  }

  const linkProps = articleOpenMode === 'new-tab'
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : articleOpenMode === 'iframe'
      ? {}
      : {};

  return (
    <div className={`${styles.cardWrap} ${item.archived ? styles.archivedCard : ''} ${isPendingDelete ? styles.pendingDelete : ''}`}>
      {isPendingDelete && (
        <div className={styles.ghostOverlay}>
          <div className={styles.ghostCenter}>
            <span className={styles.ghostLabel}>Deleted</span>
            <button className={styles.undoBtn} onClick={() => onUndo(item.id)}>Undo</button>
          </div>
          <div className={styles.countdownBar} />
        </div>
      )}
      <a href={item.url} className={styles.card} onClick={handleCardClick} {...linkProps}>
        {tags.length > 0 && (
          <div className={styles.tagRow}>
            {tags.map(t => <span key={t} className={styles.tag}>{t}</span>)}
          </div>
        )}
        <div className={styles.title}>{item.title}</div>
        {item.notes && (
          <div className={styles.notes}>{item.notes}</div>
        )}
        <div className={styles.meta}>
          <img
            className={styles.sourceFavicon}
            src={`https://www.google.com/s2/favicons?domain=${item.source}&sz=32`}
            alt=""
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          {item.source}{item.readTime ? ` · ${item.readTime}` : ''}
        </div>
      </a>

      {!isPendingDelete && (
        <div className={styles.cardActions}>
          <button
            className={`${styles.actionBtn} ${styles.editBtn}`}
            aria-label="Edit article"
            title="Edit"
            onClick={() => onEdit(item)}
          >
            <PencilIcon />
          </button>
          <button
            className={`${styles.actionBtn} ${styles.archiveBtn}`}
            aria-label={item.archived ? 'Restore' : 'Archive'}
            title={item.archived ? 'Restore' : 'Archive'}
            onClick={() => onArchive(item.id, !item.archived)}
          >
            {item.archived ? <RestoreIcon /> : <ArchiveIcon />}
          </button>
          <button
            className={`${styles.actionBtn} ${styles.deleteBtn}`}
            aria-label="Remove article"
            title="Delete"
            onClick={() => onDelete(item.id)}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

const DELETE_DELAY = 3000;

export default function ReadingList({ items, onSave, onUpdate, onDelete, onArchive, articleOpenMode, onOpenArticle }: Props) {
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  const timerMap = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function requestDelete(id: string) {
    setPendingDeletes(prev => new Set(prev).add(id));
    timerMap.current[id] = setTimeout(() => {
      onDelete(id);
      setPendingDeletes(prev => { const s = new Set(prev); s.delete(id); return s; });
      delete timerMap.current[id];
    }, DELETE_DELAY);
  }

  function undoDelete(id: string) {
    clearTimeout(timerMap.current[id]);
    delete timerMap.current[id];
    setPendingDeletes(prev => { const s = new Set(prev); s.delete(id); return s; });
  }

  useEffect(() => () => { Object.values(timerMap.current).forEach(clearTimeout); }, []);

  const [expanded, setExpanded] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editingItem, setEditingItem] = useState<ReadingListItem | null>(null);

  const active = items.filter(i => !i.archived);
  const archived = items.filter(i => i.archived);

  // All unique tags from active items
  const allTags = Array.from(new Set(active.flatMap(i => parseTags(i.tag))));
  const filtered = activeTag ? active.filter(i => parseTags(i.tag).includes(activeTag)) : active;

  useEffect(() => {
    if (activeTag && !allTags.includes(activeTag)) setActiveTag(null);
  }, [allTags, activeTag]);

  // Auto-fetch page title when URL settles
  useEffect(() => {
    const trimmed = url.trim();
    if (!trimmed || titleEdited) return;
    const timer = setTimeout(async () => {
      setFetching(true);
      try {
        const res = await apiFetch(`/api/v1/util/page-meta?url=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        if (data.title && !titleEdited) setTitle(data.title);
      } catch {}
      finally { setFetching(false); }
    }, 800);
    return () => clearTimeout(timer);
  }, [url, titleEdited]);

  async function handleSave() {
    const trimUrl = url.trim();
    if (!trimUrl) return;
    const domain = parseDomain(trimUrl) || trimUrl;
    // Commit any pending tag input
    const finalTags = tagInput.trim()
      ? [...tags, tagInput.trim().toLowerCase()]
      : tags;
    setSaving(true);
    try {
      await onSave({
        url: trimUrl.startsWith('http') ? trimUrl : `https://${trimUrl}`,
        title: title.trim() || domain,
        source: domain,
        readTime: '',
        tag: finalTags.join(','),
      });
      setUrl(''); setTitle(''); setTags([]); setTagInput('');
      setTitleEdited(false);
      setExpanded(false);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setExpanded(false);
    setUrl(''); setTitle(''); setTags([]); setTagInput('');
    setTitleEdited(false);
  }

  return (
    <div className={styles.section}>
      <div className={styles.headerRow}>
        <div className={styles.sectionLabel}>Reading list</div>
        {!expanded ? (
          <button className={styles.addBtn} onClick={() => setExpanded(true)}>+ Save article</button>
        ) : (
          <button className={styles.cancelBtn} onClick={handleCancel}>Cancel</button>
        )}
      </div>

      {allTags.length > 0 && (
        <div className={styles.chips}>
          <button
            className={`${styles.chip} ${activeTag === null ? styles.chipActive : ''}`}
            onClick={() => setActiveTag(null)}
          >
            All
          </button>
          {allTags.map(t => (
            <button
              key={t}
              className={`${styles.chip} ${activeTag === t ? styles.chipActive : ''}`}
              onClick={() => setActiveTag(activeTag === t ? null : t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {expanded && (
        <div className={styles.addForm}>
          <input
            className={styles.formInput}
            type="text"
            placeholder="URL (e.g. verge.com/article)"
            value={url}
            onChange={e => setUrl(e.target.value)}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }}
          />
          <div className={styles.titleRow}>
            <input
              className={styles.formInput}
              type="text"
              placeholder={fetching ? 'Fetching title…' : 'Title (auto-fetched or enter manually)'}
              value={title}
              onChange={e => { setTitle(e.target.value); setTitleEdited(true); }}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }}
            />
            {fetching && <span className={styles.fetchingDot} />}
          </div>
          <TagChipInput
            tags={tags}
            onChange={setTags}
            inputValue={tagInput}
            onInputChange={setTagInput}
          />
          <button className={styles.saveBtn} onClick={handleSave} disabled={!url.trim() || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      <div className={styles.grid}>
        {filtered.length === 0 && !expanded ? (
          <div className={styles.empty}>
            {activeTag ? `No articles tagged "${activeTag}".` : 'No saved articles yet.'}
          </div>
        ) : filtered.map(item => (
          <ReadingCard
            key={item.id}
            item={item}
            isPendingDelete={pendingDeletes.has(item.id)}
            onDelete={requestDelete}
            onUndo={undoDelete}
            onArchive={onArchive}
            onEdit={setEditingItem}
            articleOpenMode={articleOpenMode}
            onOpenArticle={onOpenArticle}
          />
        ))}
      </div>

      {archived.length > 0 && (
        <div className={styles.archivedSection}>
          <button
            className={styles.archivedToggle}
            onClick={() => setShowArchived(v => !v)}
          >
            <span className={`${styles.chevron} ${showArchived ? styles.chevronOpen : ''}`}>▶</span>
            Archived ({archived.length})
          </button>
          {showArchived && (
            <div className={`${styles.grid} ${styles.archivedGrid}`}>
              {archived.map(item => (
                <ReadingCard
                  key={item.id}
                  item={item}
                  isPendingDelete={pendingDeletes.has(item.id)}
                  onDelete={requestDelete}
                  onUndo={undoDelete}
                  onArchive={onArchive}
                  onEdit={setEditingItem}
                  articleOpenMode={articleOpenMode}
                  onOpenArticle={onOpenArticle}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {editingItem && (
        <EditArticleModal
          item={editingItem}
          onSave={onUpdate}
          onClose={() => setEditingItem(null)}
        />
      )}
    </div>
  );
}
