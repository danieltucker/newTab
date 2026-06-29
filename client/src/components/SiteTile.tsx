import { useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from './SiteTile.module.css';
import { Bookmark } from '../types';
import { faviconUrl } from '../utils/color';

interface Props {
  bookmark: Bookmark;
  dragOverlay?: boolean;
}

export default function SiteTile({ bookmark, dragOverlay }: Props) {
  const [faviconFailed, setFaviconFailed] = useState(false);
  const tileRef = useRef<HTMLAnchorElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: bookmark.id });

  const style = {
    background: `color-mix(in oklab, ${bookmark.color} ${isDragging ? '24%' : '15%'}, var(--surface))`,
    border: `1px solid color-mix(in oklab, ${bookmark.color} ${isDragging ? '48%' : '26%'}, transparent)`,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !dragOverlay ? 0.4 : 1,
    boxShadow: isDragging ? `0 20px 44px rgba(0,0,0,0.45)` : undefined,
    zIndex: isDragging ? 60 : undefined,
  };

  function handleClick(e: React.MouseEvent) {
    if (!tileRef.current) return;
    const tile = tileRef.current;
    tile.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(0.9)', offset: 0.35 },
        { transform: 'scale(1.05)', offset: 0.7 },
        { transform: 'scale(1)' },
      ],
      { duration: 320, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' }
    );
  }

  return (
    <a
      ref={node => { setNodeRef(node); (tileRef as React.MutableRefObject<HTMLAnchorElement | null>).current = node; }}
      href={`https://${bookmark.domain}`}
      className={styles.tile}
      style={style}
      onClick={handleClick}
      {...attributes}
      {...listeners}
    >
      <div className={styles.faviconChip}>
        <span className={styles.monogram} style={{ color: bookmark.color }}>
          {bookmark.name.charAt(0).toUpperCase()}
        </span>
        {!faviconFailed && (
          <img
            className={styles.favicon}
            src={faviconUrl(bookmark.domain)}
            alt=""
            onError={() => setFaviconFailed(true)}
          />
        )}
      </div>
      <span className={styles.name}>{bookmark.name}</span>
    </a>
  );
}
