import { useState, useEffect, useRef } from 'react';
import styles from './AddLinkModal.module.css';
import { Folder } from '../types';
import { parseDomain, deriveName, deriveColor, faviconUrl } from '../utils/color';

interface Props {
  folders: Folder[];
  defaultFolderId: string | null;
  onAdd: (payload: { folderId: string; domain: string; name: string; faviconUrl: string; color: string }) => Promise<void>;
  onClose: () => void;
}

export default function AddLinkModal({ folders, defaultFolderId, onAdd, onClose }: Props) {
  const [url, setUrl] = useState('');
  const [nameOverride, setNameOverride] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState(defaultFolderId || folders[0]?.id || '');
  const [faviconFailed, setFaviconFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  const prevDomainRef = useRef<string | null>(null);

  const domain = parseDomain(url);
  const derivedName = domain ? deriveName(domain) : null;
  const color = domain ? deriveColor(domain) : null;
  const favicon = domain ? faviconUrl(domain) : null;

  // Auto-fill name when domain changes, unless user has manually edited it
  useEffect(() => {
    setFaviconFailed(false);
    if (!domain) return;
    if (!nameEdited && domain !== prevDomainRef.current && derivedName) {
      setNameOverride(derivedName);
      prevDomainRef.current = domain;
    }
  }, [domain]);

  const displayName = nameOverride || derivedName || '';

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  async function handleAdd() {
    if (!domain || !color) return;
    setLoading(true);
    try {
      await onAdd({
        folderId: selectedFolderId,
        domain,
        name: displayName || domain,
        faviconUrl: favicon || '',
        color,
      });
      onClose();
    } finally {
      setLoading(false);
    }
  }

  const previewBg = color
    ? `color-mix(in oklab, ${color} 15%, var(--surface2))`
    : 'var(--surface2)';
  const previewBorder = color
    ? `color-mix(in oklab, ${color} 28%, transparent)`
    : 'var(--border)';

  return (
    <div className={styles.backdrop} onClick={handleBackdrop}>
      <div className={styles.card} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Add a link</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Live preview */}
        <div className={styles.preview} style={{ background: previewBg, border: `1px solid ${previewBorder}` }}>
          <div className={styles.previewChip}>
            {domain ? (
              <>
                <span className={styles.previewMonogram} style={{ color: color! }}>
                  {displayName.charAt(0).toUpperCase() || domain.charAt(0).toUpperCase()}
                </span>
                {!faviconFailed && favicon && (
                  <img
                    className={styles.previewFavicon}
                    src={favicon}
                    alt=""
                    onError={() => setFaviconFailed(true)}
                  />
                )}
              </>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            )}
          </div>
          {domain ? (
            <div className={styles.previewText}>
              <div className={styles.previewName}>{displayName}</div>
              <div className={styles.previewDomain}>{domain}</div>
            </div>
          ) : (
            <span className={styles.previewEmpty}>Preview appears here</span>
          )}
        </div>

        {/* URL input */}
        <div className={styles.field}>
          <label className={styles.label}>Website URL</label>
          <input
            className={styles.urlInput}
            type="text"
            placeholder="figma.com"
            value={url}
            onChange={e => setUrl(e.target.value)}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') onClose(); }}
          />
        </div>

        {/* Name input — shown once a domain is recognised */}
        {domain && (
          <div className={styles.field}>
            <label className={styles.label}>Display name</label>
            <input
              className={styles.urlInput}
              type="text"
              placeholder={derivedName || domain}
              value={nameOverride}
              onChange={e => { setNameOverride(e.target.value); setNameEdited(true); }}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') onClose(); }}
            />
          </div>
        )}

        {/* Folder chips */}
        <div className={styles.field}>
          <label className={styles.label}>Add to folder</label>
          <div className={styles.folderChips}>
            {folders.map(f => {
              const isSelected = f.id === selectedFolderId;
              return (
                <button
                  key={f.id}
                  className={`${styles.chip} ${isSelected ? styles.selected : ''}`}
                  style={isSelected ? {
                    background: `color-mix(in oklab, ${f.color} 20%, var(--surface))`,
                    borderColor: f.color,
                  } : {}}
                  onClick={() => setSelectedFolderId(f.id)}
                >
                  <span className={styles.colorDot} style={{ background: f.color }} />
                  {f.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.addBtn} onClick={handleAdd} disabled={!domain || loading}>
            {loading ? 'Adding…' : 'Add link'}
          </button>
        </div>
      </div>
    </div>
  );
}
