import { useState, useEffect, useRef } from 'react';
import styles from './FilterDropdown.module.css';

// Chip-triggered dropdown for filter lists too long to show as chips.
// Used by the feed topic/site filters and the reading list tag filter.
export default function FilterDropdown({ label, options, value, onChange, searchable, align = 'left' }: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
  searchable?: boolean;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  const filtered = q.trim()
    ? options.filter(o => o.toLowerCase().includes(q.trim().toLowerCase()))
    : options;

  function select(v: string | null) {
    onChange(v);
    setOpen(false);
    setQ('');
  }

  return (
    <div className={styles.filterWrap} ref={ref}>
      <button
        className={`${styles.chip} ${value ? styles.chipActive : ''}`}
        onClick={() => setOpen(v => !v)}
      >
        {value ?? label} <span className={styles.chevron}>▾</span>
      </button>
      {open && (
        <div className={`${styles.filterPanel} ${align === 'right' ? styles.filterPanelRight : ''}`}>
          {searchable && (
            <input
              className={styles.filterSearch}
              placeholder="Search…"
              value={q}
              onChange={e => setQ(e.target.value)}
              autoFocus
            />
          )}
          <div className={styles.filterList}>
            <button className={styles.filterItem} onClick={() => select(null)}>All</button>
            {filtered.map(o => (
              <button
                key={o}
                className={`${styles.filterItem} ${o === value ? styles.filterItemActive : ''}`}
                onClick={() => select(o === value ? null : o)}
              >
                {o}
              </button>
            ))}
            {filtered.length === 0 && <div className={styles.filterEmpty}>No matches</div>}
          </div>
        </div>
      )}
    </div>
  );
}
