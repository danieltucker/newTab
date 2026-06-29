import styles from './ReadingList.module.css';
import { ReadingListItem } from '../types';

interface Props {
  items: ReadingListItem[];
}

export default function ReadingList({ items }: Props) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionLabel}>Reading list</div>
      <div className={styles.grid}>
        {items.length === 0 ? (
          <div className={styles.empty}>No saved articles yet.</div>
        ) : items.map(item => (
          <a
            key={item.id}
            href={item.url}
            className={styles.card}
            target="_blank"
            rel="noopener noreferrer"
          >
            {item.tag && <span className={styles.tag}>{item.tag}</span>}
            <div className={styles.title}>{item.title}</div>
            <div className={styles.meta}>{item.source}{item.readTime ? ` · ${item.readTime}` : ''}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
