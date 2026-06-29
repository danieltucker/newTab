import { useRef } from 'react';
import styles from './FolderSidebar.module.css';
import { Folder, Bookmark } from '../types';
import { faviconUrl } from '../utils/color';

interface Props {
  folders: Folder[];
  activeFolderId: string | null;
  bookmarksByFolder: Record<string, Bookmark[]>;
  onSelectFolder: (id: string, el: HTMLElement) => void;
  onNewFolder: () => void;
  folderRefs: React.MutableRefObject<Record<string, HTMLButtonElement | null>>;
}

export default function FolderSidebar({
  folders,
  activeFolderId,
  bookmarksByFolder,
  onSelectFolder,
  onNewFolder,
  folderRefs,
}: Props) {
  return (
    <div className={styles.sidebar}>
      {folders.map(folder => {
        const sites = bookmarksByFolder[folder.id] || [];
        const previewSites = sites.slice(0, 4);
        const isActive = folder.id === activeFolderId;

        return (
          <button
            key={folder.id}
            ref={el => { folderRefs.current[folder.id] = el; }}
            className={`${styles.folderItem} ${isActive ? styles.active : ''}`}
            onClick={e => onSelectFolder(folder.id, e.currentTarget)}
          >
            <div className={styles.preview}>
              {Array.from({ length: 4 }).map((_, i) => {
                const site = previewSites[i];
                return (
                  <div key={i} className={styles.previewCell}>
                    {site ? (
                      <>
                        <img
                          className={styles.previewFavicon}
                          src={faviconUrl(site.domain)}
                          alt=""
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <span className={styles.previewMonogram} style={{ color: site.color }}>
                          {site.name.charAt(0).toUpperCase()}
                        </span>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className={styles.folderText}>
              <div className={styles.folderName}>{folder.name}</div>
              <div className={styles.folderCount}>{sites.length} {sites.length === 1 ? 'site' : 'sites'}</div>
            </div>
          </button>
        );
      })}
      <button className={styles.newFolder} onClick={onNewFolder}>
        + New folder
      </button>
    </div>
  );
}
