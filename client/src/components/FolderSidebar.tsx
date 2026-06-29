import { useState, useEffect, useRef } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragEndEvent, DragOverlay, DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from './FolderSidebar.module.css';
import { Folder, Bookmark } from '../types';
import { faviconUrl } from '../utils/color';

interface Props {
  folders: Folder[];
  activeFolderId: string | null;
  bookmarksByFolder: Record<string, Bookmark[]>;
  onSelectFolder: (id: string, el: HTMLElement) => void;
  onNewFolder: () => void;
  onImport: () => void;
  onEditFolder: (f: Folder) => void;
  onDeleteFolder: (id: string) => void;
  onReorderFolders: (reordered: Folder[]) => void;
  folderRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
}

function FolderMenu({ folder, onEdit, onDelete }: { folder: Folder; onEdit: (f: Folder) => void; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  return (
    <div className={styles.menuWrap} ref={menuRef}>
      <button
        className={styles.menuTrigger}
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        aria-label="Folder options"
      >
        ···
      </button>
      {open && (
        <div className={styles.dropdown}>
          <button className={styles.dropdownItem} onClick={e => { e.stopPropagation(); setOpen(false); onEdit(folder); }}>
            Edit
          </button>
          <button className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`} onClick={e => { e.stopPropagation(); setOpen(false); onDelete(folder.id); }}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

interface SortableFolderProps {
  folder: Folder;
  isActive: boolean;
  sites: Bookmark[];
  onSelect: (id: string, el: HTMLElement) => void;
  onEdit: (f: Folder) => void;
  onDelete: (id: string) => void;
  folderRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
}

function SortableFolder({ folder, isActive, sites, onSelect, onEdit, onDelete, folderRefs }: SortableFolderProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: folder.id });
  const previewSites = sites.slice(0, 4);

  return (
    <div
      ref={el => { setNodeRef(el); folderRefs.current[folder.id] = el; }}
      className={`${styles.folderItem} ${isActive ? styles.active : ''} ${isDragging ? styles.dragging : ''}`}
      style={{
        '--folder-color': folder.color,
        transform: CSS.Transform.toString(transform),
        transition,
      } as React.CSSProperties}
      role="button"
      tabIndex={0}
      onClick={e => onSelect(folder.id, e.currentTarget)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSelect(folder.id, e.currentTarget); }}
    >
      {/* Drag handle — listeners go here only, keeping click-to-select on the item */}
      <div
        className={styles.dragHandle}
        {...attributes}
        {...listeners}
        onClick={e => e.stopPropagation()}
      >
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
          <circle cx="2.5" cy="2.5" r="1.5"/>
          <circle cx="7.5" cy="2.5" r="1.5"/>
          <circle cx="2.5" cy="7"   r="1.5"/>
          <circle cx="7.5" cy="7"   r="1.5"/>
          <circle cx="2.5" cy="11.5" r="1.5"/>
          <circle cx="7.5" cy="11.5" r="1.5"/>
        </svg>
      </div>

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
        <div className={styles.folderNameRow}>
          <span className={styles.colorDot} style={{ background: folder.color }} />
          <span className={styles.folderName}>{folder.name}</span>
        </div>
        <div className={styles.folderCount}>{sites.length} {sites.length === 1 ? 'site' : 'sites'}</div>
      </div>

      <FolderMenu folder={folder} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

export default function FolderSidebar({
  folders, activeFolderId, bookmarksByFolder, onSelectFolder, onNewFolder, onImport,
  onEditFolder, onDeleteFolder, onReorderFolders, folderRefs,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function handleDragStart(e: DragStartEvent) {
    setActiveId(e.active.id as string);
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = folders.findIndex(f => f.id === active.id);
    const newIndex = folders.findIndex(f => f.id === over.id);
    onReorderFolders(arrayMove(folders, oldIndex, newIndex));
  }

  const activeFolder = activeId ? folders.find(f => f.id === activeId) : null;

  return (
    <div className={styles.sidebar}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={folders.map(f => f.id)} strategy={verticalListSortingStrategy}>
          {folders.map(folder => (
            <SortableFolder
              key={folder.id}
              folder={folder}
              isActive={folder.id === activeFolderId}
              sites={bookmarksByFolder[folder.id] || []}
              onSelect={onSelectFolder}
              onEdit={onEditFolder}
              onDelete={onDeleteFolder}
              folderRefs={folderRefs}
            />
          ))}
        </SortableContext>

        <DragOverlay>
          {activeFolder ? (
            <div className={`${styles.folderItem} ${styles.dragOverlay}`}
              style={{ '--folder-color': activeFolder.color } as React.CSSProperties}
            >
              <div className={styles.dragHandle} />
              <div className={styles.folderText}>
                <div className={styles.folderNameRow}>
                  <span className={styles.colorDot} style={{ background: activeFolder.color }} />
                  <span className={styles.folderName}>{activeFolder.name}</span>
                </div>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div className={styles.sidebarFooter}>
        <button className={styles.newFolder} onClick={onNewFolder}>
          + New folder
        </button>
        <button className={styles.importBtn} onClick={onImport} title="Import bookmarks">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Import
        </button>
      </div>
    </div>
  );
}
