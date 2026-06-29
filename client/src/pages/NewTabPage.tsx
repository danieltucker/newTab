import { useState, useRef, useCallback, useEffect } from 'react';
import styles from './NewTabPage.module.css';
import Header from '../components/Header';
import SearchBar from '../components/SearchBar';
import FolderSidebar from '../components/FolderSidebar';
import BookmarksGrid from '../components/BookmarksGrid';
import ReadingList from '../components/ReadingList';
import Widgets from '../components/Widgets';
import AddLinkModal from '../components/AddLinkModal';
import NewFolderModal from '../components/NewFolderModal';
import { useFolders } from '../hooks/useFolders';
import { useBookmarks } from '../hooks/useBookmarks';
import { useReadingList } from '../hooks/useReadingList';
import { Bookmark, Folder } from '../types';

interface Props {
  accessToken: string;
  username: string;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onLogout: () => void;
}

export default function NewTabPage({ accessToken, username, theme, onToggleTheme, onLogout }: Props) {
  const { folders, createFolder, reload: reloadFolders } = useFolders(accessToken);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  // Set first folder active when folders load
  useEffect(() => {
    if (folders.length > 0 && !activeFolderId) {
      setActiveFolderId(folders[0].id);
    }
  }, [folders, activeFolderId]);

  const { bookmarks, addBookmark, deleteBookmark, reorderBookmarks } = useBookmarks(accessToken, activeFolderId);
  const { items: readingList } = useReadingList(accessToken);

  // Cache bookmarks per folder for sidebar preview
  const [bookmarksByFolder, setBookmarksByFolder] = useState<Record<string, Bookmark[]>>({});
  useEffect(() => {
    if (activeFolderId) {
      setBookmarksByFolder(prev => ({ ...prev, [activeFolderId]: bookmarks }));
    }
  }, [bookmarks, activeFolderId]);

  const [showAddLink, setShowAddLink] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);

  // Refs for folder-switch animation
  const folderRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const tileRefs = useRef<Record<string, HTMLElement | null>>({});
  const switchingRef = useRef(false);

  const pendingEnterFolderIdRef = useRef<string | null>(null);

  const handleSelectFolder = useCallback((folderId: string, _folderEl: HTMLElement) => {
    if (folderId === activeFolderId || switchingRef.current) return;
    switchingRef.current = true;
    pendingEnterFolderIdRef.current = folderId;

    // Exit: current tiles fly toward the old folder icon
    const currentFolderEl = folderRefs.current[activeFolderId!];
    const tiles = Object.values(tileRefs.current).filter(Boolean) as HTMLElement[];

    if (currentFolderEl && tiles.length > 0) {
      const folderRect = currentFolderEl.getBoundingClientRect();
      const folderCx = folderRect.left + folderRect.width / 2;
      const folderCy = folderRect.top + folderRect.height / 2;

      const exitAnimations = tiles.map((tile, i) => {
        const tileRect = tile.getBoundingClientRect();
        const tileCx = tileRect.left + tileRect.width / 2;
        const tileCy = tileRect.top + tileRect.height / 2;
        const dx = (folderCx - tileCx) * 0.92;
        const dy = (folderCy - tileCy) * 0.92;
        return tile.animate(
          [
            { transform: 'translate(0,0) scale(1)', opacity: '1' },
            { transform: `translate(${dx}px,${dy}px) scale(0.18)`, opacity: '0' },
          ],
          { duration: 300, delay: i * 14, easing: 'cubic-bezier(0.55,0,0.85,0.4)', fill: 'forwards' }
        );
      });

      Promise.all(exitAnimations.map(a => a.finished)).then(() => {
        setActiveFolderId(folderId);
        switchingRef.current = false;
      });
    } else {
      setActiveFolderId(folderId);
      switchingRef.current = false;
    }
  }, [activeFolderId]);

  // Enter animation: when new folder's tiles mount, fly them in from the folder icon
  useEffect(() => {
    const enterFolderId = pendingEnterFolderIdRef.current;
    if (!enterFolderId || bookmarks.length === 0) return;
    pendingEnterFolderIdRef.current = null;

    const folderEl = folderRefs.current[enterFolderId];
    if (!folderEl) return;
    const folderRect = folderEl.getBoundingClientRect();
    const folderCx = folderRect.left + folderRect.width / 2;
    const folderCy = folderRect.top + folderRect.height / 2;

    const tiles = Object.values(tileRefs.current).filter(Boolean) as HTMLElement[];
    tiles.forEach((tile, i) => {
      const tileRect = tile.getBoundingClientRect();
      const tileCx = tileRect.left + tileRect.width / 2;
      const tileCy = tileRect.top + tileRect.height / 2;
      const dx = folderCx - tileCx;
      const dy = folderCy - tileCy;
      tile.animate(
        [
          { transform: `translate(${dx}px,${dy}px) scale(0.18)`, opacity: '0' },
          { transform: 'translate(0,0) scale(1)', opacity: '1' },
        ],
        {
          duration: 460,
          delay: 70 + i * 32,
          easing: 'cubic-bezier(0.2,0.85,0.3,1.1)',
          fill: 'backwards',
        }
      );
    });
  }, [bookmarks]);

  // Enter animation when new folder tiles mount
  const activeFolder = folders.find(f => f.id === activeFolderId) ?? null;

  async function handleAddLink(payload: {
    folderId: string; domain: string; name: string; faviconUrl: string; color: string;
  }) {
    await addBookmark(payload);
    if (payload.folderId !== activeFolderId) {
      setActiveFolderId(payload.folderId);
    }
  }

  async function handleCreateFolder(name: string, color: string) {
    const folder = await createFolder(name, color);
    setActiveFolderId(folder.id);
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <div className={styles.userBar}>
          <span className={styles.username}>{username}</span>
          <button className={styles.logoutBtn} onClick={onLogout}>Sign out</button>
        </div>

        <div className={styles.header}>
          <Header theme={theme} onToggleTheme={onToggleTheme} />
        </div>
        <div className={styles.searchbar}>
          <SearchBar />
        </div>

        <div className={styles.bodyGrid}>
          {/* Column 1: Folder sidebar */}
          <FolderSidebar
            folders={folders}
            activeFolderId={activeFolderId}
            bookmarksByFolder={bookmarksByFolder}
            onSelectFolder={handleSelectFolder}
            onNewFolder={() => setShowNewFolder(true)}
            folderRefs={folderRefs}
          />

          {/* Column 2: Main content */}
          <div>
            <BookmarksGrid
              folder={activeFolder}
              bookmarks={bookmarks}
              tileRefs={tileRefs}
              onAddLink={() => setShowAddLink(true)}
              onReorder={reorderBookmarks}
            />
            <ReadingList items={readingList} />
          </div>

          {/* Column 3: Widgets */}
          <Widgets />
        </div>
      </div>

      {showAddLink && (
        <AddLinkModal
          folders={folders}
          defaultFolderId={activeFolderId}
          onAdd={handleAddLink}
          onClose={() => setShowAddLink(false)}
        />
      )}

      {showNewFolder && (
        <NewFolderModal
          onCreate={handleCreateFolder}
          onClose={() => setShowNewFolder(false)}
        />
      )}
    </div>
  );
}
