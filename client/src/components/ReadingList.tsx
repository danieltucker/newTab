import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import styles from './ReadingList.module.css';
import { ReadingListItem } from '../types';
import { parseDomain } from '../utils/color';
import { apiFetch } from '../services/api';
import TagChipInput from './TagChipInput';
import EditArticleModal from './EditArticleModal';
import LayoutSwitch, { ListIcon, CardsIcon, MagazineIcon } from './LayoutSwitch';
import FilterDropdown from './FilterDropdown';

export type ReadingListLayout = 'list' | 'cards' | 'magazine';

// Above this many tags, the chip row collapses into a searchable dropdown
const MAX_TAG_CHIPS = 12;

const LAYOUT_OPTIONS = [
  { value: 'list' as const,     title: 'List',     icon: <ListIcon /> },
  { value: 'cards' as const,    title: 'Cards',    icon: <CardsIcon /> },
  { value: 'magazine' as const, title: 'Magazine', icon: <MagazineIcon /> },
];

// Animate layout reflow (deletes/archives) so cards visibly slide to their
// new spots. View transitions are GPU-composited; falls back to an instant
// update where unsupported.
function withViewTransition(fn: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (doc.startViewTransition) doc.startViewTransition(() => { flushSync(fn); });
  else fn();
}

// ── Magazine layout variants (saved articles have no artwork, so the mix
// comes from big text features and full-note briefs) ──
type MagVariant = 'feature' | 'brief' | 'standard' | 'text';

// Cheap stable hash so a card keeps its look across refreshes
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function magazineVariants(items: ReadingListItem[]): MagVariant[] {
  let sinceFeature = 4; // lets the first feature lead the page
  return items.map(item => {
    const readTime = parseInt(item.readTime, 10) || 0;
    const notesLen = item.notes?.length ?? 0;
    const hasImage = !!item.imageUrl;
    // Short notes on an art-less item run in full as a brief
    if (!hasImage && notesLen > 0 && notesLen <= 200 && readTime <= 2) {
      sinceFeature++;
      return 'brief';
    }
    // Features fill a wide banner, so they need artwork
    const featureWorthy = hasImage && (readTime >= 4 || notesLen >= 240 || hashId(item.id) % 3 === 0);
    if (featureWorthy && sinceFeature >= 4) {
      sinceFeature = 0;
      return 'feature';
    }
    sinceFeature++;
    // Anything with a cover shows it; art-less items become text cards
    return hasImage ? 'standard' : 'text';
  });
}

interface Props {
  items: ReadingListItem[];
  onSave: (item: Omit<ReadingListItem, 'id' | 'savedAt' | 'archived' | 'notes'>) => Promise<unknown>;
  onUpdate: (id: string, patch: Pick<ReadingListItem, 'title' | 'tag' | 'notes'>) => Promise<void>;
  onDelete: (id: string) => void;
  onArchive: (id: string, archived: boolean) => Promise<void>;
  articleOpenMode?: 'new-tab' | 'same-tab' | 'iframe';
  onOpenArticle?: (url: string) => void;
  layout?: ReadingListLayout;
  onLayoutChange?: (layout: ReadingListLayout) => void;
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
  // Arrow lifting out of an open tray — clearly "move back", not "archive again"
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 7.5v2.75c0 .41.34.75.75.75h6.5c.41 0 .75-.34.75-.75V7.5"/>
      <path d="M6 7.75V1.5"/>
      <path d="M3.5 3.75L6 1.25 8.5 3.75"/>
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
  variant?: MagVariant;
  isPendingDelete?: boolean;
  postReadState?: 'active' | 'leaving';
  onPostReadAction?: (action: 'archive' | 'delete') => void;
  onOpened?: (id: string) => void;
  onDelete: (id: string) => void;
  onUndo: (id: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  onEdit: (item: ReadingListItem) => void;
  articleOpenMode?: 'new-tab' | 'same-tab' | 'iframe';
  onOpenArticle?: (url: string) => void;
}

function ReadingCard({ item, variant, isPendingDelete, postReadState, onPostReadAction, onOpened, onDelete, onUndo, onArchive, onEdit, articleOpenMode = 'new-tab', onOpenArticle }: CardProps) {
  const tags = parseTags(item.tag);

  // Magazine text/brief variants stay type-only; everything else shows art when it exists
  const showImage = !!item.imageUrl &&
    (variant === undefined || variant === 'feature' || variant === 'standard');

  const wrapClass = [
    styles.cardWrap,
    variant === 'feature' ? styles.featureWrap : '',
    variant === 'brief' ? styles.briefWrap : '',
    item.archived ? styles.archivedCard : '',
    isPendingDelete ? styles.pendingDelete : '',
    postReadState ? styles.postReadCard : '',
    // No cover art → reserve top space so the floating controls push text down
    // instead of overlapping it
    !showImage ? styles.noHero : '',
  ].filter(Boolean).join(' ');

  // Unique name lets view transitions track this card across reflows
  const vtStyle = { viewTransitionName: `rl-${item.id.replace(/[^a-zA-Z0-9_-]/g, '')}` } as React.CSSProperties;

  function handleCardClick(e: React.MouseEvent) {
    onOpened?.(item.id);
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
    <div className={wrapClass} style={vtStyle}>
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
        {showImage && (
          <img
            src={item.imageUrl}
            alt=""
            className={styles.hero}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        {tags.length > 0 && (
          <div className={styles.tagRow}>
            {tags.map(t => <span key={t} className={styles.tag}>{t}</span>)}
          </div>
        )}
        <div className={styles.title}>{item.title}</div>
        {item.notes && (
          <div className={styles.notes}>{item.notes}</div>
        )}
      </a>

      <div className={styles.cardFooter}>
        <div className={styles.meta}>
          <img
            className={styles.sourceFavicon}
            src={`https://www.google.com/s2/favicons?domain=${item.source}&sz=32`}
            alt=""
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          {item.source}{item.readTime ? ` · ${item.readTime}` : ''}
        </div>
      </div>

      {/* Floating window-style controls — top-right, over the cover art */}
      {!isPendingDelete && (
        <div className={styles.cardActions}>
          <button
            className={styles.actionBtn}
            aria-label={item.archived ? 'Restore to reading list' : 'Archive'}
            title={item.archived ? 'Restore to reading list' : 'Archive'}
            onClick={() => onArchive(item.id, !item.archived)}
          >
            {item.archived ? <RestoreIcon /> : <ArchiveIcon />}
          </button>
          <button
            className={styles.actionBtn}
            aria-label="Edit article"
            title="Edit"
            onClick={() => onEdit(item)}
          >
            <PencilIcon />
          </button>
          <button
            className={`${styles.actionBtn} ${styles.deleteBtn}`}
            aria-label="Remove article"
            title="Delete"
            onClick={() => onDelete(item.id)}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M1 1l10 10M11 1L1 11"/>
            </svg>
          </button>
        </div>
      )}

      {postReadState && !isPendingDelete && (
        <div className={`${styles.postReadOverlay} ${postReadState === 'leaving' ? styles.postReadLeaving : ''}`}>
          <div className={styles.postReadTitle}>
            Are you done with <span className={styles.postReadItemTitle}>{item.title}</span>?
          </div>
          <div className={styles.postReadBtns}>
            <button className={styles.postReadArchiveBtn} onClick={() => onPostReadAction?.('archive')}>
              Archive
            </button>
            <button className={styles.postReadRemoveBtn} onClick={() => onPostReadAction?.('delete')}>
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const DELETE_DELAY = 3000;

export default function ReadingList({ items, onSave, onUpdate, onDelete, onArchive, articleOpenMode, onOpenArticle, layout = 'cards', onLayoutChange }: Props) {
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  const timerMap = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function requestDelete(id: string) {
    setPendingDeletes(prev => new Set(prev).add(id));
    timerMap.current[id] = setTimeout(() => {
      delete timerMap.current[id];
      // Animate the surviving cards sliding into the freed spot
      withViewTransition(() => {
        onDelete(id);
        setPendingDeletes(prev => { const s = new Set(prev); s.delete(id); return s; });
      });
    }, DELETE_DELAY);
  }

  function handleArchive(id: string, archived: boolean) {
    withViewTransition(() => { onArchive(id, archived); });
  }

  // ── Post-read overlay: when you come back from an article you opened,
  // that card offers big Archive/Remove actions, then drains away ──
  const [postRead, setPostRead] = useState<string | null>(null);
  const [postReadLeaving, setPostReadLeaving] = useState(false);
  const postReadTimers = useRef<{ dismiss?: ReturnType<typeof setTimeout> }>({});
  const itemsRef = useRef(items);
  itemsRef.current = items;

  function markOpened(id: string) {
    try { sessionStorage.setItem('rl-post-read', JSON.stringify({ id, ts: Date.now() })); } catch {}
  }

  useEffect(() => {
    function check() {
      if (document.visibilityState === 'hidden') return;
      let raw: string | null = null;
      try { raw = sessionStorage.getItem('rl-post-read'); } catch {}
      if (!raw) return;
      try { sessionStorage.removeItem('rl-post-read'); } catch {}
      try {
        const { id, ts } = JSON.parse(raw) as { id: string; ts: number };
        // Only for recent reads on articles that still exist and aren't archived
        if (Date.now() - ts < 60 * 60 * 1000 && itemsRef.current.some(i => i.id === id && !i.archived)) {
          setPostRead(id);
          setPostReadLeaving(false);
        }
      } catch {}
    }
    check(); // same-tab navigation returns to a fresh mount
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    window.addEventListener('article-reader-closed', check);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', check);
      window.removeEventListener('article-reader-closed', check);
    };
  }, []);

  // Once the user starts interacting with the page again, the overlay
  // lingers 10s and then drains away
  useEffect(() => {
    if (!postRead || postReadLeaving) return;
    const timers = postReadTimers.current;
    function onInteract() {
      remove();
      timers.dismiss = setTimeout(() => setPostReadLeaving(true), 10_000);
    }
    function remove() {
      window.removeEventListener('pointerdown', onInteract, true);
      window.removeEventListener('keydown', onInteract, true);
      window.removeEventListener('wheel', onInteract, true);
      window.removeEventListener('touchstart', onInteract, true);
    }
    window.addEventListener('pointerdown', onInteract, true);
    window.addEventListener('keydown', onInteract, true);
    window.addEventListener('wheel', onInteract, true);
    window.addEventListener('touchstart', onInteract, true);
    return () => {
      remove();
      clearTimeout(timers.dismiss);
    };
  }, [postRead, postReadLeaving]);

  // Unmount the overlay once its drain animation has played out
  useEffect(() => {
    if (!postReadLeaving) return;
    const t = setTimeout(() => {
      setPostRead(null);
      setPostReadLeaving(false);
    }, 480);
    return () => clearTimeout(t);
  }, [postReadLeaving]);

  function postReadAction(action: 'archive' | 'delete') {
    const id = postRead;
    if (!id) return;
    clearTimeout(postReadTimers.current.dismiss);
    setPostRead(null);
    setPostReadLeaving(false);
    if (action === 'archive') handleArchive(id, true);
    else requestDelete(id);
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
  const [fetchedImage, setFetchedImage] = useState('');
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

  const gridClass = layout === 'list' ? styles.gridList
    : layout === 'magazine' ? styles.gridMagazine
    : styles.grid;

  const variants = layout === 'magazine' ? magazineVariants(filtered) : null;
  const archivedVariants = layout === 'magazine' ? magazineVariants(archived) : null;

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
        setFetchedImage(data.image || '');
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
        imageUrl: fetchedImage,
      });
      setUrl(''); setTitle(''); setTags([]); setTagInput('');
      setTitleEdited(false);
      setFetchedImage('');
      setExpanded(false);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setExpanded(false);
    setUrl(''); setTitle(''); setTags([]); setTagInput('');
    setTitleEdited(false);
    setFetchedImage('');
  }

  return (
    <div className={styles.section}>
      <div className={styles.headerRow}>
        <div className={styles.sectionLabel}>Reading list</div>
        <div className={styles.headerActions}>
          {onLayoutChange && (
            <LayoutSwitch value={layout} options={LAYOUT_OPTIONS} onChange={onLayoutChange} label="Reading list layout" />
          )}
          {!expanded ? (
            <button className={styles.addBtn} onClick={() => setExpanded(true)}>+ Save article</button>
          ) : (
            <button className={styles.cancelBtn} onClick={handleCancel}>Cancel</button>
          )}
        </div>
      </div>

      {allTags.length > 0 && (
        <div className={styles.chips}>
          <button
            className={`${styles.chip} ${activeTag === null ? styles.chipActive : ''}`}
            onClick={() => setActiveTag(null)}
          >
            All
          </button>
          {allTags.length <= MAX_TAG_CHIPS ? (
            allTags.map(t => (
              <button
                key={t}
                className={`${styles.chip} ${activeTag === t ? styles.chipActive : ''}`}
                onClick={() => setActiveTag(activeTag === t ? null : t)}
              >
                {t}
              </button>
            ))
          ) : (
            <FilterDropdown
              label="Topics"
              options={allTags}
              value={activeTag}
              onChange={setActiveTag}
              searchable
            />
          )}
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

      <div className={gridClass}>
        {filtered.length === 0 && !expanded ? (
          <div className={styles.empty}>
            {activeTag ? `No articles tagged "${activeTag}".` : 'No saved articles yet.'}
          </div>
        ) : filtered.map((item, i) => (
          <ReadingCard
            key={item.id}
            item={item}
            variant={variants?.[i]}
            isPendingDelete={pendingDeletes.has(item.id)}
            postReadState={postRead === item.id ? (postReadLeaving ? 'leaving' : 'active') : undefined}
            onPostReadAction={postReadAction}
            onOpened={markOpened}
            onDelete={requestDelete}
            onUndo={undoDelete}
            onArchive={handleArchive}
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
            <div className={`${gridClass} ${styles.archivedGrid}`}>
              {archived.map((item, i) => (
                <ReadingCard
                  key={item.id}
                  item={item}
                  variant={archivedVariants?.[i]}
                  isPendingDelete={pendingDeletes.has(item.id)}
                  onDelete={requestDelete}
                  onUndo={undoDelete}
                  onArchive={handleArchive}
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
