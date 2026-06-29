import { useRef, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { useState } from 'react';
import styles from './BookmarksGrid.module.css';
import SiteTile from './SiteTile';
import AddLinkTile from './AddLinkTile';
import { Folder, Bookmark } from '../types';

interface Props {
  folder: Folder | null;
  bookmarks: Bookmark[];
  tileRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  onAddLink: () => void;
  onReorder: (reordered: Bookmark[]) => void;
}

export default function BookmarksGrid({ folder, bookmarks, tileRefs, onAddLink, onReorder }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = bookmarks.findIndex(b => b.id === active.id);
    const newIndex = bookmarks.findIndex(b => b.id === over.id);
    const reordered = arrayMove(bookmarks, oldIndex, newIndex);
    onReorder(reordered);
  }

  const activeBookmark = activeId ? bookmarks.find(b => b.id === activeId) : null;

  if (!folder) return null;

  return (
    <div className={styles.section}>
      <div className={styles.titleRow}>
        <span className={styles.folderTitle}>{folder.name}</span>
        <span className={styles.siteCount}>{bookmarks.length} sites</span>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={bookmarks.map(b => b.id)} strategy={rectSortingStrategy}>
          <div className={styles.grid}>
            {bookmarks.map(bookmark => (
              <div
                key={bookmark.id}
                ref={el => { tileRefs.current[bookmark.id] = el; }}
              >
                <SiteTile bookmark={bookmark} />
              </div>
            ))}
            <AddLinkTile onClick={onAddLink} />
          </div>
        </SortableContext>

        <DragOverlay>
          {activeBookmark ? <SiteTile bookmark={activeBookmark} dragOverlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
