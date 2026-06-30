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
        onPointerDown={e => e.stopPropagation()}
        aria-label="Folder options"
      >
        ···
      </button>
      {open && (
        <div className={styles.dropdown}>
          <button className={styles.dropdownItem} onClick={e => { e.stopPropagation(); setOpen(false); onEdit(folder); }} onPointerDown={e => e.stopPropagation()}>
            Edit
          </button>
          <button className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`} onClick={e => { e.stopPropagation(); setOpen(false); onDelete(folder.id); }} onPointerDown={e => e.stopPropagation()}>
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
      onClick={e => onSelect(folder.id, e.currentTarget)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSelect(folder.id, e.currentTarget); }}
      {...attributes}
      {...listeners}
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
        <div className={styles.folderNameRow}>
          <span className={styles.colorDot} style={{ background: folder.color }} />
          <span className={styles.folderName}>{folder.name}</span>
          {(() => {
            const total = sites.reduce((s, b) => s + (b.unreadCount ?? 0), 0);
            return total > 0 ? (
              <span className={styles.folderUnread}>{total > 99 ? '∞' : total}</span>
            ) : null;
          })()}
        </div>
      </div>

      <FolderMenu folder={folder} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

export default function FolderSidebar({
  folders, activeFolderId, bookmarksByFolder, onSelectFolder, onNewFolder,
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
      </div>
    </div>
  );
}
