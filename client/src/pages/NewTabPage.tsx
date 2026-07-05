import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
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

// Parallax background: one base + three floating blobs per theme.
// Each layer moves at a different scroll speed to create depth.
type BgLayer = { image: string; speed: number };

const BG_LAYERS: Record<'dark' | 'light', BgLayer[]> = {
  dark: [
    // Base — opaque, anchors the color foundation, never moves
    { image: 'linear-gradient(158deg, #07080d 0%, #0c0e1a 60%, #0a0c15 100%)', speed: 0 },
    // Blob A — large indigo mass, lower-left, drifts slowest
    { image: 'radial-gradient(ellipse 80% 65% at 5% 72%, rgba(48,20,155,0.30) 0%, rgba(32,12,105,0.10) 48%, transparent 70%)', speed: 0.06 },
    // Blob B — dark cerulean, upper-right, medium drift
    { image: 'radial-gradient(ellipse 62% 78% at 92% 18%, rgba(12,42,180,0.24) 0%, rgba(8,28,130,0.08) 50%, transparent 72%)', speed: 0.14 },
    // Blob C — deep violet, bottom-centre, drifts fastest (feels closest)
    { image: 'radial-gradient(ellipse 55% 48% at 50% 102%, rgba(70,10,150,0.22) 0%, transparent 65%)', speed: 0.26 },
  ],
  light: [
    // Base
    { image: 'linear-gradient(158deg, #e9eaf3 0%, #eff0f8 60%, #eaecf4 100%)', speed: 0 },
    // Blob A — soft periwinkle, lower-left
    { image: 'radial-gradient(ellipse 80% 65% at 5% 72%, rgba(155,162,225,0.42) 0%, rgba(142,150,215,0.14) 48%, transparent 70%)', speed: 0.06 },
    // Blob B — powdery blue, upper-right
    { image: 'radial-gradient(ellipse 62% 78% at 92% 18%, rgba(172,196,238,0.46) 0%, rgba(158,184,228,0.14) 50%, transparent 72%)', speed: 0.14 },
    // Blob C — violet mist, bottom-centre
    { image: 'radial-gradient(ellipse 55% 48% at 50% 102%, rgba(185,178,228,0.32) 0%, transparent 65%)', speed: 0.26 },
  ],
};

// Cursor glow: blends directly with the background layers beneath it.
const GLOW: Record<'dark' | 'light', { color: string; blend: React.CSSProperties['mixBlendMode'] }> = {
  dark:  { color: 'rgba(190,205,255,0.09)', blend: 'screen'   },
  light: { color: 'rgba(100,115,200,0.12)', blend: 'multiply' },
};

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

  // stable key: null when bg is off, otherwise the current theme ('dark'|'light')
  const bgKey    = settings.backgroundGradient !== 'none' ? resolvedTheme : null;
  const bgLayers = bgKey ? BG_LAYERS[bgKey] : [];
  const glowCfg  = bgKey ? GLOW[bgKey]     : null;

  const bgLayerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const glowRef     = useRef<HTMLDivElement>(null);

  // Per-layer parallax — base layer stays still, blobs drift at different speeds
  useEffect(() => {
    if (!bgLayers.length) return;
    function onScroll() {
      bgLayers.forEach((layer, i) => {
        if (layer.speed === 0) return;
        const el = bgLayerRefs.current[i];
        if (el) el.style.transform = `translateY(${-window.scrollY * layer.speed}px)`;
      });
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [bgKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lerp cursor glow + scroll nudge
  useEffect(() => {
    const el = glowRef.current;
    if (!el) return;
    el.style.opacity = '0';
    if (!glowCfg) return;

    let rafId = -1;
    let tx = -9999, ty = -9999, cx = -9999, cy = -9999;
    let scrollNudge = 0, lastScrollY = window.scrollY;
    const LERP = 0.07;

    function step() {
      scrollNudge *= 0.88;
      cx += (tx - cx) * LERP;
      cy += (ty + scrollNudge - cy) * LERP;
      el!.style.transform = `translate(${cx}px, ${cy}px)`;
      rafId = requestAnimationFrame(step);
    }

    function onMove(e: MouseEvent) {
      if (tx === -9999) { cx = e.clientX; cy = e.clientY; el!.style.opacity = '1'; rafId = requestAnimationFrame(step); }
      tx = e.clientX; ty = e.clientY;
    }

    function onScroll() {
      const d = window.scrollY - lastScrollY; lastScrollY = window.scrollY; scrollNudge += d * 0.3;
    }

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('scroll', onScroll,  { passive: true });
    return () => { cancelAnimationFrame(rafId); window.removeEventListener('mousemove', onMove); window.removeEventListener('scroll', onScroll); };
  }, [bgKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Background layers — z-index 0, page content sits at z-index 1 above them */}
      {bgLayers.map((layer, i) => (
        <div
          key={i}
          ref={el => { bgLayerRefs.current[i] = el; }}
          style={{
            position: 'fixed', inset: 0,
            backgroundImage: layer.image,
            pointerEvents: 'none',
            zIndex: 0,
            willChange: layer.speed > 0 ? 'transform' : undefined,
          }}
        />
      ))}
      {/* Cursor glow — same z-index layer as background, blends against it */}
      <div
        ref={glowRef}
        style={{
          position: 'fixed',
          top: 0, left: 0,
          width: 220, height: 220,
          marginLeft: -110, marginTop: -110,
          borderRadius: '50%',
          background: glowCfg ? `radial-gradient(circle, ${glowCfg.color} 0%, transparent 68%)` : 'none',
          pointerEvents: 'none',
          zIndex: 0,
          opacity: 0,
          transform: 'translate(-9999px, -9999px)',
          transition: 'opacity 0.4s ease',
          willChange: 'transform',
          mixBlendMode: glowCfg?.blend ?? 'normal',
        }}
      />
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
              />
            </div>
            {activeFolderId && (activeFolder?.feedUrls?.length ?? 0) > 0 && (
              <FolderArticles
                key={activeFolderId}
                folderId={activeFolderId}
                bookmarks={activeFolderId ? (bookmarksByFolder[activeFolderId] ?? []) : []}
                onSaveArticle={(a, markSaved) => setSavingArticle({ ...a, markSaved })}
                onArticlesLoaded={handleFeedArticlesLoaded}
                refreshKey={feedRefreshKey}
                pageSize={settings.rssFeedPageSize ?? 10}
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
