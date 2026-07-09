import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import styles from './NewTabPage.module.css';
import Header from '../components/Header';
import SearchBar from '../components/SearchBar';
import FolderSidebar from '../components/FolderSidebar';
import BookmarksGrid from '../components/BookmarksGrid';
import ReadingList from '../components/ReadingList';
import Widgets from '../components/Widgets';
import AddLinkModal from '../components/AddLinkModal';
import NewFolderModal from '../components/NewFolderModal';
import EditBookmarkModal from '../components/EditBookmarkModal';
import EditFolderModal from '../components/EditFolderModal';
import SettingsModal from '../components/SettingsModal';
import ImportBookmarksModal from '../components/ImportBookmarksModal';
import ArticleModal from '../components/ArticleModal';
import Console from '../components/Console';
import FolderArticles from '../components/FolderArticles';
import SaveArticleModal from '../components/SaveArticleModal';
import { useFolders } from '../hooks/useFolders';
import { useBookmarks } from '../hooks/useBookmarks';
import { useReadingList } from '../hooks/useReadingList';
import { useSettings } from '../hooks/useSettings';
import { apiGet } from '../services/api';
import { Bookmark, Folder, FeedArticle } from '../types';
import { ThemeSetting, ResolvedTheme } from '../App';

// Background depth model, one entry per blob (far → close).
// pointer: max px the blob leans as the cursor crosses the viewport — the far
// layer moves opposite the near ones, which is what sells the depth.
// scroll: fraction of scroll distance the blob travels (content moves at 1.0).
const BLOB_MOTION = [
  { pointer: -18, scroll: 0.08 },
  { pointer:  32, scroll: 0.18 },
  { pointer:  56, scroll: 0.34 },
] as const;

interface Props {
  accessToken: string;
  username: string;
  themeSetting: ThemeSetting;
  resolvedTheme: ResolvedTheme;
  onSetTheme: (t: ThemeSetting) => void;
  onLogout: () => void;
}

export default function NewTabPage({ accessToken, username, themeSetting, resolvedTheme, onSetTheme, onLogout }: Props) {
  const { settings, update: updateSetting, loaded: settingsLoaded } = useSettings(accessToken);

  // Sync theme setting from server on first load
  useEffect(() => {
    if (!settingsLoaded) return;
    if (settings.theme !== themeSetting) onSetTheme(settings.theme);
  }, [settingsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSetTheme(t: ThemeSetting) {
    onSetTheme(t);
    updateSetting({ theme: t });
  }

  const { folders, createFolder, updateFolder, deleteFolder, reorderFolders } = useFolders(accessToken);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  useEffect(() => {
    if (folders.length > 0 && !activeFolderId) {
      setActiveFolderId(folders[0].id);
    }
  }, [folders, activeFolderId]);

  const { bookmarks, addBookmark, updateBookmark, deleteBookmark, reorderBookmarks, checkFeed, markVisited } = useBookmarks(accessToken, activeFolderId);
  const { items: readingList, saveItem, updateItem, archiveItem, removeItem } = useReadingList(accessToken);

  const CACHE_KEY = `bfc_${username}`;

  const [bookmarksByFolder, setBookmarksByFolder] = useState<Record<string, Bookmark[]>>(() => {
    // Serve from localStorage instantly — avoids the blank-grid flash on every new tab
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, Bookmark[]>) : {};
    } catch { return {}; }
  });

  // Sync active folder bookmarks into the display cache (and localStorage).
  // Guard: only update when bookmarks actually belong to activeFolderId.
  useEffect(() => {
    if (!activeFolderId) return;
    if (bookmarks.length > 0 && bookmarks[0].folderId !== activeFolderId) return;
    setBookmarksByFolder(prev => {
      const next = { ...prev, [activeFolderId]: bookmarks };
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [bookmarks, activeFolderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bulk-load all bookmarks in one round-trip on first load
  useEffect(() => {
    if (!accessToken) return;
    apiGet<Bookmark[]>('/api/v1/bookmarks/all').then(all => {
      const grouped: Record<string, Bookmark[]> = {};
      for (const bm of all) {
        if (!grouped[bm.folderId]) grouped[bm.folderId] = [];
        grouped[bm.folderId].push(bm);
      }
      setBookmarksByFolder(grouped);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(grouped)); } catch {}
    }).catch(() => {});
  }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Background feed checking — on folder switch and every 30min while the tab stays open
  const bookmarksRef = useRef(bookmarks);
  useEffect(() => { bookmarksRef.current = bookmarks; }, [bookmarks]);

  useEffect(() => {
    if (!activeFolderId) return;
    const STALE_MS = 30 * 60 * 1000;

    const runCheck = () => {
      bookmarksRef.current
        .filter(b => !b.feedCheckedAt || Date.now() - new Date(b.feedCheckedAt).getTime() > STALE_MS)
        .forEach(b => checkFeed(b.id).catch(() => {}));
    };

    // Delay initial check slightly so bookmarks have time to load
    const initial = setTimeout(runCheck, 2000);
    const interval = setInterval(runCheck, STALE_MS);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, [activeFolderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Feed articles for search (accumulated across folder switches)
  const [feedArticles, setFeedArticles] = useState<FeedArticle[]>([]);

  function handleFeedArticlesLoaded(articles: FeedArticle[]) {
    setFeedArticles(prev => {
      const existingIds = new Set(prev.map(a => a.id));
      const fresh = articles.filter(a => !existingIds.has(a.id));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }

  // Pending feed article save (shows SaveArticleModal)
  type PendingSave = { id: string; url: string; title: string; source: string; categories: string[]; readTime: number | null; markSaved: () => void };
  const [savingArticle, setSavingArticle] = useState<PendingSave | null>(null);

  // Bookmarklet mode — true when this window was opened by a bookmarklet
  const bookmarkletModeRef = useRef(false);
  const [bookmarkletAddUrl, setBookmarkletAddUrl] = useState('');

  // Modal state
  const [showAddLink, setShowAddLink] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [articleUrl, setArticleUrl] = useState<string | null>(null);
  const [showConsole, setShowConsole] = useState(false);
  const [consoleFading, setConsoleFading] = useState(false);
  const showConsoleRef = useRef(false);
  showConsoleRef.current = showConsole;
  const consoleFadingRef = useRef(false);
  consoleFadingRef.current = consoleFading;

  function closeConsole() {
    if (consoleFadingRef.current) return;
    setConsoleFading(true);
    setTimeout(() => { setShowConsole(false); setConsoleFading(false); }, 320);
  }
  const closeConsoleRef = useRef(closeConsole);
  closeConsoleRef.current = closeConsole;
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);

  // Detect bookmarklet intent from URL params (set before React renders)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const intent = params.get('intent');
    if (!intent) return;
    bookmarkletModeRef.current = true;
    const url = decodeURIComponent(params.get('url') ?? '');
    const title = decodeURIComponent(params.get('title') ?? '');
    window.history.replaceState({}, '', window.location.pathname);
    if (intent === 'save-article') {
      let source = '';
      try { source = new URL(url).hostname.replace(/^www\./, ''); } catch {}
      setSavingArticle({ id: '', url, title, source, categories: [], readTime: null, markSaved: () => { if (window.opener) window.close(); } });
    } else if (intent === 'add-bookmark') {
      setBookmarkletAddUrl(url);
      setShowAddLink(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Backtick opens the console (when consoleEnabled in settings)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code !== 'Backquote') return;
      if (!settings.consoleEnabled) return;
      e.preventDefault();
      if (showConsoleRef.current) { closeConsoleRef.current(); } else { setShowConsole(true); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [settings.consoleEnabled]);

  // Refs for folder-switch animation
  const folderRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const tileRefs = useRef<Record<string, HTMLElement | null>>({});
  const switchingRef = useRef(false);
  const pendingEnterFolderIdRef = useRef<string | null>(null);

  const handleSelectFolder = useCallback((folderId: string, _folderEl: HTMLElement) => {
    if (folderId === activeFolderId || switchingRef.current) return;
    switchingRef.current = true;
    pendingEnterFolderIdRef.current = folderId;

    const tiles = Object.values(tileRefs.current).filter(Boolean) as HTMLElement[];

    if (tiles.length > 0) {
      const exitAnimations = tiles.map(tile =>
        tile.animate(
          [{ opacity: '1' }, { opacity: '0' }],
          { duration: 90, easing: 'ease-out', fill: 'forwards' }
        )
      );
      Promise.all(exitAnimations.map(a => a.finished)).then(() => {
        setActiveFolderId(folderId);
        switchingRef.current = false;
      });
    } else {
      setActiveFolderId(folderId);
      switchingRef.current = false;
    }
  }, [activeFolderId]);

  // Fires after activeFolderId changes (post-exit-animation). Because bookmarksByFolder
  // is populated from the bulk load / localStorage, tiles are in the DOM immediately.
  // useLayoutEffect lets us zero their opacity before the first paint so there's no flash.
  useLayoutEffect(() => {
    if (!pendingEnterFolderIdRef.current) return;
    pendingEnterFolderIdRef.current = null;
    const tiles = Object.values(tileRefs.current).filter(Boolean) as HTMLElement[];
    if (tiles.length === 0) return;
    tiles.forEach(t => (t.style.opacity = '0'));
    requestAnimationFrame(() => {
      tiles.forEach(t => {
        t.style.opacity = '';
        t.animate([{ opacity: '0' }, { opacity: '1' }], { duration: 110, easing: 'ease-out' });
      });
    });
  }, [activeFolderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeFolder = folders.find(f => f.id === activeFolderId) ?? null;

  async function handleAddLink(payload: {
    folderId: string; domain: string; name: string; faviconUrl: string; color: string;
  }) {
    await addBookmark(payload);
    if (payload.folderId !== activeFolderId) setActiveFolderId(payload.folderId);
  }

  async function handleCreateFolder(name: string, color: string) {
    const folder = await createFolder(name, color);
    setActiveFolderId(folder.id);
  }

  async function handleSaveBookmark(id: string, updates: {
    domain: string; name: string; faviconUrl: string; color: string; folderId: string;
  }) {
    const updated = await updateBookmark(id, updates);
    // Refresh sidebar preview cache
    if (activeFolderId) {
      const bm = bookmarks.find(b => b.id === id);
      if (bm && bm.folderId !== updates.folderId) {
        // moved to different folder — remove from current folder cache
        setBookmarksByFolder(prev => ({
          ...prev,
          [activeFolderId]: prev[activeFolderId]?.filter(b => b.id !== id) ?? [],
        }));
      } else if (updated) {
        // update in place in cache
        setBookmarksByFolder(prev => ({
          ...prev,
          [activeFolderId]: prev[activeFolderId]?.map(b => b.id === id ? updated : b) ?? [],
        }));
      }
    }
  }

  async function handleDeleteBookmark(id: string) {
    await deleteBookmark(id);
    if (activeFolderId) {
      setBookmarksByFolder(prev => ({
        ...prev,
        [activeFolderId]: prev[activeFolderId]?.filter(b => b.id !== id) ?? [],
      }));
    }
  }

  async function handleSaveFolder(id: string, updates: { name: string; color: string; feedUrls: string[] }) {
    await updateFolder(id, updates);
  }

  async function handleDeleteFolder(id: string) {
    await deleteFolder(id);
    setBookmarksByFolder(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (id === activeFolderId) {
      const remaining = folders.filter(f => f.id !== id);
      setActiveFolderId(remaining[0]?.id ?? null);
    }
  }

  // null when background is disabled, otherwise the resolved theme key
  const bgKey = settings.backgroundGradient !== 'none' ? resolvedTheme : null;

  const blobWrapRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Background motion — the blobs lean gently toward the cursor and separate
  // at different rates on scroll. Both inputs are lerped in a single rAF loop
  // so the motion glides instead of tracking 1:1 (transforms are
  // compositor-only, so the per-frame cost is negligible).
  useEffect(() => {
    if (!bgKey) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let rafId = -1;
    let px = 0, py = 0;                        // pointer target, -0.5..0.5 of viewport
    let sy = window.scrollY;                   // scroll target
    let cpx = 0, cpy = 0, csy = window.scrollY; // current (lerped) values

    function frame() {
      cpx += (px - cpx) * 0.04;
      cpy += (py - cpy) * 0.04;
      csy += (sy - csy) * 0.09;
      BLOB_MOTION.forEach((m, i) => {
        const el = blobWrapRefs.current[i];
        if (el) {
          const x = cpx * m.pointer;
          const y = cpy * m.pointer - csy * m.scroll;
          el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
        }
      });
      rafId = requestAnimationFrame(frame);
    }

    function onMove(e: MouseEvent) {
      px = e.clientX / window.innerWidth - 0.5;
      py = e.clientY / window.innerHeight - 0.5;
    }
    function onScroll() { sy = window.scrollY; }

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    rafId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('scroll', onScroll);
    };
  }, [bgKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Background — fixed, beneath all page content (z-index 0) */}
      {bgKey && (
        <div className={styles.bgRoot}>
          <div className={styles.bgBase} />
          <div className={`${styles.blobWrap} ${styles.blobWrap1}`} ref={el => { blobWrapRefs.current[0] = el; }}>
            <div className={`${styles.blob} ${styles.blob1}`} />
          </div>
          <div className={`${styles.blobWrap} ${styles.blobWrap2}`} ref={el => { blobWrapRefs.current[1] = el; }}>
            <div className={`${styles.blob} ${styles.blob2}`} />
          </div>
          <div className={`${styles.blobWrap} ${styles.blobWrap3}`} ref={el => { blobWrapRefs.current[2] = el; }}>
            <div className={`${styles.blob} ${styles.blob3}`} />
          </div>
          <div className={styles.bgGrain} />
        </div>
      )}
    <div className={styles.page}>
      <div className={styles.content}>
      {/* Top-right bar: username + icon buttons */}
      <div className={styles.topBar}>
        <span className={styles.username}>{username}</span>
        <button className={styles.iconBtn} onClick={() => setShowSettings(true)} title="Settings">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
        <button className={styles.iconBtn} onClick={onLogout} title="Sign out">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>

        <div className={styles.header}>
          <Header />
        </div>
        <div className={styles.searchbar}>
          <SearchBar
            searchEngine={settings.searchEngine}
            searchNewTab={settings.searchNewTab}
            bookmarks={Object.values(bookmarksByFolder).flat()}
            readingItems={readingList}
            feedArticles={feedArticles.map(a => ({ id: a.id, url: a.link, title: a.title, source: a.source }))}
          />
        </div>

        <div className={styles.bodyGrid}>
          <div className={styles.leftCol}>
            <FolderSidebar
              folders={folders}
              activeFolderId={activeFolderId}
              bookmarksByFolder={bookmarksByFolder}
              onSelectFolder={handleSelectFolder}
              onNewFolder={() => setShowNewFolder(true)}
              onEditFolder={setEditingFolder}
              onDeleteFolder={handleDeleteFolder}
              onReorderFolders={reorderFolders}
              folderRefs={folderRefs}
            />
            <Widgets
              settings={settings}
              onUpdateSettings={updateSetting}
            />
          </div>

          <div>
            <BookmarksGrid
              folder={activeFolder}
              bookmarks={activeFolderId ? (bookmarksByFolder[activeFolderId] ?? []) : []}
              tileRefs={tileRefs}
              onAddLink={() => setShowAddLink(true)}
              onReorder={reorderBookmarks}
              onEditBookmark={setEditingBookmark}
              onDeleteBookmark={handleDeleteBookmark}
              onVisit={markVisited}
              bookmarkOpenMode={settings.bookmarkOpenMode}
            />
            <div className={styles.bottomRow}>
              <ReadingList
                items={readingList}
                onSave={saveItem}
                onUpdate={updateItem}
                onArchive={archiveItem}
                onDelete={removeItem}
                articleOpenMode={(() => {
                const m = settings.readingListOpenMode ?? settings.articleOpenMode;
                return m === 'reader' ? 'iframe' : m;
              })()}
                onOpenArticle={setArticleUrl}
                layout={settings.readingListLayout ?? 'cards'}
                onLayoutChange={l => updateSetting({ readingListLayout: l })}
              />
            </div>
            {activeFolderId && (activeFolder?.feedUrls?.length ?? 0) > 0 && (
              <FolderArticles
                key={activeFolderId}
                folderId={activeFolderId}
                onSaveArticle={(a, markSaved) => setSavingArticle({ ...a, markSaved })}
                onArticlesLoaded={handleFeedArticlesLoaded}
                refreshKey={feedRefreshKey}
                pageSize={settings.rssFeedPageSize ?? 10}
                layout={settings.rssLayout ?? 'cards'}
                onLayoutChange={l => updateSetting({ rssLayout: l })}
              />
            )}
          </div>
        </div>

        <footer className={styles.footer}>
          <a href="https://github.com/danieltucker/newTab" target="_blank" rel="noopener noreferrer" className={styles.footerLink}>
            v1.1.0
          </a>
        </footer>
      </div>

      {showAddLink && (
        <AddLinkModal
          folders={folders}
          defaultFolderId={activeFolderId}
          defaultUrl={bookmarkletAddUrl || undefined}
          onAdd={handleAddLink}
          onClose={() => {
            setShowAddLink(false);
            setBookmarkletAddUrl('');
            if (bookmarkletModeRef.current && window.opener) window.close();
          }}
        />
      )}

      {showNewFolder && (
        <NewFolderModal
          onCreate={handleCreateFolder}
          onClose={() => setShowNewFolder(false)}
        />
      )}

      {editingBookmark && (
        <EditBookmarkModal
          bookmark={editingBookmark}
          folders={folders}
          onSave={handleSaveBookmark}
          onDelete={handleDeleteBookmark}
          onClose={() => setEditingBookmark(null)}
        />
      )}

      {editingFolder && (
        <EditFolderModal
          folder={editingFolder}
          bookmarkFeeds={(bookmarksByFolder[editingFolder.id] ?? [])
            .filter(b => !!b.feedUrl)
            .map(b => ({ name: b.name, domain: b.domain, feedUrl: b.feedUrl! }))}
          onSave={handleSaveFolder}
          onDelete={handleDeleteFolder}
          onClose={() => setEditingFolder(null)}
        />
      )}

      {showImport && (
        <ImportBookmarksModal
          folders={folders}
          activeFolderId={activeFolderId}
          onClose={() => setShowImport(false)}
          onImported={() => {
            // Refetch the bulk bookmark cache so new imports appear immediately
            apiGet<Bookmark[]>('/api/v1/bookmarks/all').then(all => {
              const grouped: Record<string, Bookmark[]> = {};
              for (const bm of all) {
                if (!grouped[bm.folderId]) grouped[bm.folderId] = [];
                grouped[bm.folderId].push(bm);
              }
              setBookmarksByFolder(grouped);
              try { localStorage.setItem(CACHE_KEY, JSON.stringify(grouped)); } catch {}
            }).catch(() => {});
          }}
        />
      )}

      {savingArticle && (
        <SaveArticleModal
          url={savingArticle.url}
          title={savingArticle.title}
          source={savingArticle.source}
          initialTag={savingArticle.categories.join(',')}
          initialReadTime={savingArticle.readTime != null ? `${savingArticle.readTime} min` : ''}
          onSave={async data => {
            await saveItem(data);
            savingArticle.markSaved();
            setSavingArticle(null);
            if (bookmarkletModeRef.current && window.opener) window.close();
          }}
          onClose={() => {
            setSavingArticle(null);
            if (bookmarkletModeRef.current && window.opener) window.close();
          }}
        />
      )}

      {articleUrl && (
        <ArticleModal url={articleUrl} onClose={() => setArticleUrl(null)} />
      )}

      {showSettings && (
        <SettingsModal
          settings={{ ...settings, theme: themeSetting }}
          onUpdate={async (patch) => { if (patch.theme) handleSetTheme(patch.theme); await updateSetting(patch); }}
          onClose={() => setShowSettings(false)}
          onImport={() => { setShowSettings(false); setShowImport(true); }}
        />
      )}

      {showConsole && (
        <Console
          folders={folders}
          theme={resolvedTheme}
          onSelectFolder={setActiveFolderId}
          onSetTheme={handleSetTheme}
          onRefreshFeeds={() => setFeedRefreshKey(k => k + 1)}
          closing={consoleFading}
          onClose={closeConsole}
        />
      )}
    </div>
    </>
  );
}
