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

const GRADIENTS: Record<string, { dark: string; light: string }> = {
  aurora:   { dark: 'radial-gradient(ellipse 70% 55% at 15% 5%, rgba(32,200,160,0.2) 0%, transparent 55%), radial-gradient(ellipse 60% 50% at 85% 90%, rgba(100,50,210,0.16) 0%, transparent 55%)', light: 'radial-gradient(ellipse 70% 55% at 15% 5%, rgba(0,160,130,0.12) 0%, transparent 55%), radial-gradient(ellipse 60% 50% at 85% 90%, rgba(100,50,210,0.09) 0%, transparent 55%)' },
  dusk:     { dark: 'radial-gradient(ellipse 80% 55% at 50% 0%, rgba(255,80,20,0.18) 0%, transparent 60%), radial-gradient(ellipse 60% 55% at 15% 95%, rgba(180,40,200,0.14) 0%, transparent 55%)', light: 'radial-gradient(ellipse 80% 55% at 50% 0%, rgba(220,70,10,0.1) 0%, transparent 60%), radial-gradient(ellipse 60% 55% at 15% 95%, rgba(150,30,180,0.08) 0%, transparent 55%)' },
  ocean:    { dark: 'radial-gradient(ellipse 80% 65% at 30% 20%, rgba(0,150,255,0.18) 0%, transparent 60%), radial-gradient(ellipse 60% 55% at 75% 80%, rgba(0,210,180,0.12) 0%, transparent 55%)', light: 'radial-gradient(ellipse 80% 65% at 30% 20%, rgba(0,120,220,0.11) 0%, transparent 60%), radial-gradient(ellipse 60% 55% at 75% 80%, rgba(0,180,160,0.08) 0%, transparent 55%)' },
  midnight: { dark: 'radial-gradient(ellipse 100% 65% at 50% 0%, rgba(110,55,210,0.22) 0%, transparent 65%), radial-gradient(ellipse 60% 50% at 85% 85%, rgba(60,0,160,0.14) 0%, transparent 55%)', light: 'radial-gradient(ellipse 100% 65% at 50% 0%, rgba(90,40,180,0.1) 0%, transparent 65%), radial-gradient(ellipse 60% 50% at 85% 85%, rgba(60,0,140,0.07) 0%, transparent 55%)' },
  rose:     { dark: 'radial-gradient(ellipse 70% 55% at 82% 8%, rgba(255,80,130,0.18) 0%, transparent 55%), radial-gradient(ellipse 60% 55% at 18% 88%, rgba(255,140,50,0.12) 0%, transparent 55%)', light: 'radial-gradient(ellipse 70% 55% at 82% 8%, rgba(220,60,110,0.11) 0%, transparent 55%), radial-gradient(ellipse 60% 55% at 18% 88%, rgba(200,120,30,0.08) 0%, transparent 55%)' },
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
    apiGet<Bookmark[]>('/api/bookmarks/all').then(all => {
      const grouped: Record<string, Bookmark[]> = {};
      for (const bm of all) {
        if (!grouped[bm.folderId]) grouped[bm.folderId] = [];
        grouped[bm.folderId].push(bm);
      }
      setBookmarksByFolder(grouped);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(grouped)); } catch {}
    }).catch(() => {});
  }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Background feed checking — once per folder switch, for stale bookmarks (>1h or never checked)
  const feedCheckedFolders = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!bookmarks.length || !activeFolderId) return;
    if (feedCheckedFolders.current.has(activeFolderId)) return;
    feedCheckedFolders.current.add(activeFolderId);
    const STALE_MS = 60 * 60 * 1000;
    bookmarks
      .filter(b => !b.feedCheckedAt || Date.now() - new Date(b.feedCheckedAt).getTime() > STALE_MS)
      .forEach(b => checkFeed(b.id).catch(() => {}));
  }, [bookmarks, activeFolderId]); // eslint-disable-line react-hooks/exhaustive-deps

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
  type PendingSave = { id: string; url: string; title: string; source: string; markSaved: () => void };
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
      setSavingArticle({ id: '', url, title, source, markSaved: () => { if (window.opener) window.close(); } });
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
      setShowConsole(v => !v);
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

  const gradientStyle = settings.backgroundGradient && settings.backgroundGradient !== 'none'
    ? { backgroundImage: GRADIENTS[settings.backgroundGradient]?.[resolvedTheme] ?? '' }
    : undefined;

  return (
    <div className={styles.page} style={gradientStyle}>
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
            apiGet<Bookmark[]>('/api/bookmarks/all').then(all => {
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
          onClose={() => setShowConsole(false)}
        />
      )}
    </div>
  );
}
