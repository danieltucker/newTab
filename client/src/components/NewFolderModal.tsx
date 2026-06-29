import { useState } from 'react';
import styles from './NewFolderModal.module.css';

const PALETTE = [
  '#5E6AD2', '#FF4500', '#EA4C89', '#1DB954', '#F48024', '#A259FF',
  '#E0479E', '#00A8E8', '#FF6600', '#24A0ED', '#7C5CFC', '#0FB57B',
];

interface Props {
  onCreate: (name: string, color: string) => Promise<void>;
  onClose: () => void;
}

export default function NewFolderModal({ onCreate, onClose }: Props) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onCreate(name.trim(), color);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.card} onClick={e => e.stopPropagation()}>
        <div className={styles.title}>New folder</div>
        <label className={styles.label}>Folder name</label>
        <input
          className={styles.input}
          type="text"
          placeholder="e.g. Work, Design, Daily..."
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') onClose(); }}
        />
        <label className={styles.label}>Color</label>
        <div className={styles.colorRow}>
          {PALETTE.map(c => (
            <button
              key={c}
              className={`${styles.colorSwatch} ${c === color ? styles.selected : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.createBtn} onClick={handleCreate} disabled={!name.trim() || loading}>
            {loading ? 'Creating…' : 'Create folder'}
          </button>
        </div>
      </div>
    </div>
  );
}
