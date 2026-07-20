import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '../services/api';
import { FeedArticle } from '../types';
import { faviconUrl } from '../utils/color';
import LayoutSwitch, { ListIcon, CardsIcon, MagazineIcon } from './LayoutSwitch';
import FilterDropdown from './FilterDropdown';
import styles from './FolderArticles.module.css';

export type RssLayout = 'list' | 'cards' | 'magazine';

const LAYOUT_OPTIONS = [
  { value: 'list' as const,     title: 'List',     icon: <ListIcon /> },
  { value: 'cards' as const,    title: 'Cards',    icon: <CardsIcon /> },
  { value: 'magazine' as const, title: 'Magazine', icon: <MagazineIcon /> },
];

// Above this many topics, the chip row collapses into a searchable dropdown
const MAX_TOPIC_CHIPS = 12;

interface Props {
  folderId: string;
  onSaveArticle: (a: { id: string; url: string; title: string; source: string; categories: string[]; readTime: number | null; imageUrl: string | null }, markSaved: () => void) => void;
  onArticlesLoaded?: (articles: FeedArticle[]) => void;
  refreshKey?: number;
  pageSize?: number;
  layout?: RssLayout;
  onLayoutChange?: (layout: RssLayout) => void;
}

function relativeDate(s: string | null): string {
  if (!s) return '';
  const d = new Date(s);
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

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// ── Magazine layout variants ──────────────────────────────────────────
type MagVariant = 'feature' | 'standard' | 'text' | 'brief';

// Cheap stable hash so a card keeps its look across refreshes
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Editorial mix: long reads with artwork become wide features (spaced out so
// they don't stack), short pieces run as full-text briefs, and the rest
// alternate between image and text-only cards on a stable per-article hash.
function magazineVariants(articles: FeedArticle[]): MagVariant[] {
  let sinceFeature = 4; // lets the first feature lead the page
  return articles.map(a => {
    const readTime = a.readTime ?? 0;
    const snippetLen = a.snippet?.length ?? 0;
    // The snippet is essentially the whole piece — run it in full. The server
    // truncates long content to ~200 chars ending in "…", so a trailing
    // ellipsis means there's more to read and it is NOT a brief.
    const complete = snippetLen > 0 && !/(…|\.\.\.)\s*$/.test(a.snippet!);
    if (complete && snippetLen <= 220 && readTime <= 2) {
      sinceFeature++;
      return 'brief';
    }
    // Long reads and meaty summaries always qualify; the hash fallback keeps
    // features appearing (~every screenful) on feeds of uniformly short items
    const featureWorthy = !!a.imageUrl &&
      (readTime >= 4 || snippetLen >= 240 || hashId(a.id) % 3 === 0);
    if (featureWorthy && sinceFeature >= 4) {
      sinceFeature = 0;
      return 'feature';
    }
    sinceFeature++;
    if (!a.imageUrl) return 'text';
    return hashId(a.id) % 4 === 0 ? 'text' : 'standard';
  });
}

export default function FolderArticles({ folderId, onSaveArticle, onArticlesLoaded, refreshKey, pageSize = 10, layout = 'cards', onLayoutChange }: Props) {
  const seededFolders = useRef<Set<string>>(new Set());
  const [articles, setArticles]         = useState<FeedArticle[]>([]);
  const [total, setTotal]               = useState(0);
  const [loading, setLoading]           = useState(true);
  const [loadingMore, setLoadingMore]   = useState(false);
  const [error, setError]               = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<string | null>(null);

  const allCategories = useMemo(
    () => Array.from(new Set(articles.flatMap(a => a.categories))).sort(),
    [articles]
  );

  const allSources = useMemo(
    () => Array.from(new Set(articles.map(a => a.source).filter(Boolean))).sort(),
    [articles]
  );

  const displayed = articles.filter(a =>
    (!activeCategory || a.categories.includes(activeCategory)) &&
    (!activeSource || a.source === activeSource)
  );

  const load = useCallback(async (offset = 0, existing: FeedArticle[] = []) => {
    offset === 0 ? setLoading(true) : setLoadingMore(true);
    setError('');
    try {
      const r = await apiFetch(`/api/v1/folders/${folderId}/articles?offset=${offset}&limit=${pageSize}`);
      if (!r.ok) { setError('Could not load feed'); return; }
      const data: { articles: FeedArticle[]; total: number } = await r.json();
      const merged = offset === 0 ? data.articles : [...existing, ...data.articles];
      setArticles(merged);
      setTotal(data.total);
    } catch {
      setError('Could not load feed');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [folderId]);

  useEffect(() => {
    setArticles([]);
    setTotal(0);
    setActiveCategory(null);
    setActiveSource(null);
    load(0, []);
  }, [folderId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Infinite scroll — when the sentinel below the list enters the viewport,
  // fetch the next page (the button remains as a manual fallback)
  const hasMore = articles.length < total;
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loadingMore) load(articles.length, articles);
    }, { rootMargin: '300px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, loadingMore, articles, load]);

  // Background load for search seeding — fires at most once per folder per session
  useEffect(() => {
    if (!onArticlesLoaded || seededFolders.current.has(folderId)) return;
    seededFolders.current.add(folderId);
    apiFetch(`/api/v1/folders/${folderId}/articles?includeAll=true&limit=200`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { articles: FeedArticle[] } | null) => {
        if (data?.articles?.length) onArticlesLoaded(data.articles);
      })
      .catch(() => {});
  }, [folderId, onArticlesLoaded]);

  function handleSave(a: FeedArticle) {
    onSaveArticle(
      { id: a.id, url: a.link, title: a.title, source: a.source, categories: a.categories, readTime: a.readTime, imageUrl: a.imageUrl },
      // Once it's in the reading list it leaves the feed (dismissed server-side,
      // so it stays gone across refreshes)
      () => handleDismiss(a.id)
    );
  }

  async function handleDismiss(articleId: string) {
    setArticles(prev => prev.filter(a => a.id !== articleId));
    setTotal(prev => Math.max(0, prev - 1));
    apiFetch(`/api/v1/folders/${folderId}/articles/${articleId}`, { method: 'DELETE' }).catch(() => {});
  }

  if (loading) return (
    <div className={styles.wrap}>
      <div className={styles.sectionLabel}>Feed Articles</div>
      <div className={styles.status}><span className={styles.spinner} /> Fetching feeds…</div>
    </div>
  );

  if (error) return (
    <div className={styles.wrap}>
      <div className={styles.sectionLabel}>Feed Articles</div>
      <div className={styles.statusError}>{error}</div>
    </div>
  );

  if (articles.length === 0) return (
    <div className={styles.wrap}>
      <div className={styles.sectionLabel}>Feed Articles</div>
      <div className={styles.status} style={{ opacity: 0.45 }}>No articles yet — feeds refresh every 30 minutes.</div>
    </div>
  );

  const gridClass = layout === 'list' ? styles.gridList
    : layout === 'magazine' ? styles.gridMagazine
    : styles.grid;

  const variants = layout === 'magazine' ? magazineVariants(displayed) : null;

  return (
    <div className={styles.wrap}>
      <div className={styles.headerRow}>
        <div className={styles.sectionLabel}>
          Feed Articles
          <span className={styles.count}>{total}</span>
        </div>
        {onLayoutChange && (
          <LayoutSwitch value={layout} options={LAYOUT_OPTIONS} onChange={onLayoutChange} label="Feed layout" />
        )}
      </div>

      {(allCategories.length > 1 || allSources.length > 1) && (
        <div className={styles.chips}>
          {allCategories.length > 1 && (
            <button
              className={`${styles.chip} ${activeCategory === null ? styles.chipActive : ''}`}
              onClick={() => setActiveCategory(null)}
            >
              All
            </button>
          )}
          {allCategories.length > 1 && allCategories.length <= MAX_TOPIC_CHIPS && allCategories.map(c => (
            <button
              key={c}
              className={`${styles.chip} ${activeCategory === c ? styles.chipActive : ''}`}
              onClick={() => setActiveCategory(activeCategory === c ? null : c)}
            >
              {c}
            </button>
          ))}
          {allCategories.length > MAX_TOPIC_CHIPS && (
            <FilterDropdown
              label="Topics"
              options={allCategories}
              value={activeCategory}
              onChange={setActiveCategory}
              searchable
            />
          )}
          {allSources.length > 1 && (
            <div className={styles.sourceFilter}>
              <FilterDropdown
                label="All sites"
                options={allSources}
                value={activeSource}
                onChange={setActiveSource}
                searchable={allSources.length > 8}
                align="right"
              />
            </div>
          )}
        </div>
      )}

      <div className={gridClass}>
        {displayed.map((a, i) => (
          <ArticleCard
            key={a.id}
            article={a}
            variant={variants?.[i]}
            onSave={() => handleSave(a)}
            onDismiss={() => handleDismiss(a.id)}
          />
        ))}
      </div>
      {hasMore && (
        <>
          <div ref={sentinelRef} aria-hidden />
          <button
            className={styles.moreBtn}
            onClick={() => load(articles.length, articles)}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading…' : `Load more  ·  ${total - articles.length} remaining`}
          </button>
        </>
      )}
    </div>
  );
}

function ArticleCard({ article, variant, onSave, onDismiss }: {
  article: FeedArticle; variant?: MagVariant;
  onSave: () => void; onDismiss: () => void;
}) {
  const domain = domainOf(article.link);
  const feedDomain = domainOf(article.feedUrl);
  // Always derive from the domain (same as SiteTile) — stored bookmark favicon
  // URLs can go stale when the API path changes.
  const favicon = domain ? faviconUrl(domain) : feedDomain ? faviconUrl(feedDomain) : '';

  const showImage = variant === 'feature' || variant === 'standard';
  // Magazine text variants always run their snippet; elsewhere keep the
  // original heuristic of only padding out short titles
  const showSnippet = !!article.snippet && (
    variant === 'feature' || variant === 'brief' || variant === 'text' || article.title.length < 60
  );
  const wrapClass = [
    styles.cardWrap,
    variant === 'feature' ? styles.featureWrap : '',
    variant === 'brief' ? styles.briefWrap : '',
    variant === 'text' ? styles.textWrap : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={wrapClass}>
      <div className={styles.card}>
        {showImage && article.imageUrl && (
          <img
            src={article.imageUrl}
            alt=""
            className={styles.hero}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        {article.categories.length > 0 && (
          <div className={styles.cats}>
            {article.categories.slice(0, 3).map(c => (
              <span key={c} className={styles.cat}>{c}</span>
            ))}
          </div>
        )}
        <a href={article.link} target="_blank" rel="noopener noreferrer" className={styles.title}>
          {article.title}
        </a>
        {showSnippet && (
          <p className={styles.snippet}>{article.snippet}</p>
        )}
        {article.readTime != null && (
          <span className={styles.readTime}>
            {article.readTime === 1 ? '1 minute read' : `${article.readTime} minute read`}
          </span>
        )}
        <div className={styles.cardBottom}>
          <div className={styles.meta}>
            {favicon && <img src={favicon} alt="" className={styles.favicon} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
            <span className={styles.domain}>{domain}</span>
          </div>
          <div className={styles.cardRight}>
            <span className={styles.date}>{relativeDate(article.pubDate)}</span>
          </div>
        </div>
        <div className={styles.cardActions}>
          <button className={`${styles.actionBtn} ${styles.dismissBtn}`} onClick={onDismiss} aria-label="Dismiss" title="Dismiss">
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M1 1l10 10M11 1L1 11"/>
            </svg>
          </button>
          <button
            className={`${styles.actionBtn} ${styles.saveBtn}`}
            onClick={onSave}
            aria-label="Save to reading list"
            title="Save to reading list"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
