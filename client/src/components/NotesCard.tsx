import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './NotesCard.module.css';

const CHEATSHEET = [
  { syntax: '# Heading',       result: 'H1 heading' },
  { syntax: '## Heading',      result: 'H2 heading' },
  { syntax: '**bold**',        result: 'Bold' },
  { syntax: '*italic*',        result: 'Italic' },
  { syntax: '- item',          result: 'Bullet list' },
  { syntax: '1. item',         result: 'Numbered list' },
  { syntax: '- [ ] todo',      result: 'Checkbox' },
  { syntax: '`code`',          result: 'Inline code' },
  { syntax: '> quote',         result: 'Blockquote' },
  { syntax: '[text](url)',      result: 'Link' },
  { syntax: '---',             result: 'Divider' },
];

interface Props {
  notes: string;
  onSave: (notes: string) => void;
}

export default function NotesCard({ notes, onSave }: Props) {
  const [value, setValue] = useState(notes);
  const [editing, setEditing] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [showCheatSheet, setShowCheatSheet] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedRef = useRef(notes);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync incoming value when settings first load
  useEffect(() => {
    setValue(notes);
    savedRef.current = notes;
  }, [notes]);

  // Focus textarea when switching to edit mode
  useEffect(() => {
    if (editing) {
      const el = textareaRef.current;
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }
  }, [editing]);

  function persist(text: string) {
    if (text === savedRef.current) return;
    savedRef.current = text;
    onSave(text);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    setValue(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persist(text), 1500);
  }

  function handleBlur() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    persist(value);
    setEditing(false);
    setShowCheatSheet(false);
  }

  // Cmd/Ctrl+Enter also exits edit mode
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      textareaRef.current?.blur();
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardLabel}>
        <span>Notes</span>
        <span className={styles.labelRight}>
          {savedFlash && <span className={styles.savedBadge}>Saved</span>}
          {editing && (
            <span className={styles.cheatWrap}>
              <button
                className={styles.cheatBtn}
                onMouseDown={e => e.preventDefault()}
                onClick={() => setShowCheatSheet(v => !v)}
                title="Markdown cheat sheet"
              >?</button>
              {showCheatSheet && (
                <div className={styles.cheatSheet}>
                  <div className={styles.cheatTitle}>Markdown</div>
                  {CHEATSHEET.map(row => (
                    <div key={row.syntax} className={styles.cheatRow}>
                      <code className={styles.cheatSyntax}>{row.syntax}</code>
                      <span className={styles.cheatResult}>{row.result}</span>
                    </div>
                  ))}
                </div>
              )}
            </span>
          )}
          <button
            className={styles.editToggle}
            onClick={() => { setEditing(e => !e); setShowCheatSheet(false); }}
            title={editing ? 'Preview' : 'Edit'}
          >
            {editing ? (
              // Eye icon — preview
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            ) : (
              // Pencil icon — edit
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            )}
          </button>
        </span>
      </div>

      {editing ? (
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="Write markdown…"
          spellCheck={false}
        />
      ) : (
        <div
          className={styles.preview}
          onClick={() => setEditing(true)}
          title="Click to edit"
        >
          {value ? (
            <div className={styles.markdown}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
            </div>
          ) : (
            <span className={styles.placeholder}>Write something…</span>
          )}
        </div>
      )}
    </div>
  );
}
