import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './NotesCard.module.css';

// Stamps a stable data-idx on each checkbox *before* React renders.
// Using a rehype plugin (pure AST transform) avoids the ref-mutation-during-render
// bug that Strict Mode's double-invoke triggers when using a shared counter.
function rehypeCheckboxIdx() {
  return (tree: any) => {
    let idx = 0;
    const walk = (node: any) => {
      if (node.type === 'element' && node.tagName === 'input' && node.properties?.type === 'checkbox') {
        node.properties.dataIdx = String(idx++);
      }
      (node.children ?? []).forEach(walk);
    };
    walk(tree);
  };
}
const REHYPE_PLUGINS = [rehypeCheckboxIdx];

const SLASH_COMMANDS = [
  { id: 'h1',    label: 'Heading 1',   badge: 'H1', prefix: '# ',       hint: 'Large section heading' },
  { id: 'h2',    label: 'Heading 2',   badge: 'H2', prefix: '## ',      hint: 'Medium section heading' },
  { id: 'h3',    label: 'Heading 3',   badge: 'H3', prefix: '### ',     hint: 'Small section heading' },
  { id: 'ul',    label: 'Bullet list', badge: '•',  prefix: '- ',       hint: 'Simple bulleted list' },
  { id: 'ol',    label: 'Numbered',    badge: '1.', prefix: '1. ',      hint: 'Numbered list' },
  { id: 'todo',  label: 'To-do',       badge: '☐',  prefix: '- [ ] ',   hint: 'Trackable task item' },
  { id: 'quote', label: 'Quote',       badge: '"',  prefix: '> ',       hint: 'Capture a quote' },
  { id: 'code',  label: 'Code block',  badge: '<>', prefix: '```\n\n```', hint: 'Monospace code block' },
  { id: 'hr',    label: 'Divider',     badge: '—',  prefix: '---',      hint: 'Horizontal rule' },
] as const;

type SlashCmd = typeof SLASH_COMMANDS[number];

function toggleCheckbox(md: string, targetIdx: number): string {
  let idx = 0;
  return md.replace(/- \[( |x)\] /gi, (match, inner: string) => {
    const toggled = idx === targetIdx
      ? (inner.trim() === 'x' ? '- [ ] ' : '- [x] ')
      : match;
    idx++;
    return toggled;
  });
}

interface Props {
  notes: string;
  onSave: (notes: string) => void;
  onRemove?: () => void;
}

export default function NotesCard({ notes, onSave, onRemove }: Props) {
  const [value, setValue] = useState(notes);
  const [editing, setEditing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashPos, setSlashPos] = useState(0);
  const [slashIdx, setSlashIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slashMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) { setValue(notes); setIsDirty(false); }
  }, [notes, editing]);

  useEffect(() => {
    if (editing) {
      const el = textareaRef.current;
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }
  }, [editing]);

  // Scroll selected slash item into view
  useEffect(() => {
    if (!slashOpen || !slashMenuRef.current) return;
    const item = slashMenuRef.current.querySelector<HTMLElement>(`[data-idx="${slashIdx}"]`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [slashIdx, slashOpen]);

  function persist(text: string) {
    onSave(text);
    setIsDirty(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  }

  function handleSave() {
    persist(value);
    setEditing(false);
    setSlashOpen(false);
  }

  function handleDiscard() {
    setValue(notes);
    setIsDirty(false);
    setEditing(false);
    setSlashOpen(false);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    setIsDirty(true);
  }

  const filteredCommands = slashQuery
    ? SLASH_COMMANDS.filter(c => c.label.toLowerCase().includes(slashQuery.toLowerCase()))
    : SLASH_COMMANDS;

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSave(); return; }

    if (slashOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIdx(i => (i + 1) % filteredCommands.length); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSlashIdx(i => (i - 1 + filteredCommands.length) % filteredCommands.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); if (filteredCommands[slashIdx]) applySlash(filteredCommands[slashIdx]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setSlashOpen(false); return; }
    }

    if (e.key === 'Escape') { if (!isDirty) handleDiscard(); return; }

    // Detect `/` at start of line to open slash menu
    if (e.key === '/') {
      const ta = textareaRef.current!;
      const pos = ta.selectionStart;
      const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
      const lineContent = value.substring(lineStart, pos).trim();
      if (lineContent === '') {
        // open after state update so the `/` is in the value
        setTimeout(() => { setSlashOpen(true); setSlashQuery(''); setSlashIdx(0); setSlashPos(pos); }, 0);
      }
    }
  }

  function handleKeyUp(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!slashOpen) return;
    if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) return;

    const ta = textareaRef.current!;
    const pos = ta.selectionStart;
    if (pos <= slashPos) { setSlashOpen(false); return; }

    const query = ta.value.substring(slashPos + 1, pos);
    if (query.includes('\n') || (query.includes(' ') && filteredCommands.length === 0)) {
      setSlashOpen(false); return;
    }
    setSlashQuery(query);
    setSlashIdx(0);
  }

  function applySlash(cmd: SlashCmd) {
    const ta = textareaRef.current!;
    const curPos = ta.selectionStart;
    const lineStart = value.lastIndexOf('\n', slashPos - 1) + 1;
    const before = value.substring(0, lineStart);
    const after = value.substring(curPos);
    const lineContentAfterSlash = value.substring(lineStart, slashPos).trimStart();

    let newVal: string;
    let cursorAt: number;

    if (cmd.id === 'code') {
      newVal = before + '```\n' + lineContentAfterSlash + '\n```' + after;
      cursorAt = before.length + 4 + lineContentAfterSlash.length;
    } else if (cmd.id === 'hr') {
      newVal = before + '---' + after;
      cursorAt = before.length + 3;
    } else {
      newVal = before + cmd.prefix + lineContentAfterSlash + after;
      cursorAt = before.length + cmd.prefix.length + lineContentAfterSlash.length;
    }

    setValue(newVal);
    setIsDirty(true);
    setSlashOpen(false);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(cursorAt, cursorAt); }, 0);
  }

  const handleCheckboxToggle = useCallback((idx: number) => {
    const newVal = toggleCheckbox(value, idx);
    setValue(newVal);
    persist(newVal);
  }, [value]);

  return (
    <div className={styles.card}>
      <div className={styles.cardLabel}>
        <span>Notes</span>
        <span className={styles.labelRight}>
          {savedFlash && <span className={styles.savedBadge}>Saved</span>}
          {editing && isDirty && (
            <button className={styles.saveBtn} onMouseDown={e => e.preventDefault()} onClick={handleSave}>Save</button>
          )}
          {editing && (
            <button className={styles.discardBtn} onMouseDown={e => e.preventDefault()} onClick={handleDiscard}>
              {isDirty ? 'Discard' : 'Done'}
            </button>
          )}
          {onRemove && (
            <button className={styles.removeBtn} onClick={onRemove} title="Remove widget">
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M1 1l10 10M11 1L1 11"/>
              </svg>
            </button>
          )}
          <button
            className={styles.editToggle}
            title={editing ? 'Preview' : 'Edit'}
            onClick={() => {
              if (editing) { if (isDirty) persist(value); setEditing(false); setSlashOpen(false); }
              else setEditing(true);
            }}
          >
            {editing ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            )}
          </button>
        </span>
      </div>

      {editing ? (
        <div className={styles.editorWrap}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            placeholder="Write markdown… type / for commands"
            spellCheck={false}
          />
          {slashOpen && filteredCommands.length > 0 && (
            <div className={styles.slashMenu} ref={slashMenuRef}>
              <div className={styles.slashHint}>Commands</div>
              {filteredCommands.map((cmd, i) => (
                <button
                  key={cmd.id}
                  data-idx={i}
                  className={`${styles.slashItem} ${i === slashIdx ? styles.slashItemSel : ''}`}
                  onMouseDown={e => { e.preventDefault(); applySlash(cmd); }}
                  onMouseEnter={() => setSlashIdx(i)}
                >
                  <span className={styles.slashBadge}>{cmd.badge}</span>
                  <span className={styles.slashLabel}>{cmd.label}</span>
                  <span className={styles.slashHintText}>{cmd.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div
          className={styles.preview}
          onDoubleClick={() => setEditing(true)}
          title="Double-click to edit"
        >
          {value ? (
            <div className={styles.markdown}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={REHYPE_PLUGINS}
                components={{
                  input(props) {
                    if (props.type === 'checkbox') {
                      // data-idx was stamped by rehypeCheckboxIdx before React rendered
                      const idx = Number((props as any)['data-idx'] ?? -1);
                      return (
                        <input
                          type="checkbox"
                          checked={props.checked}
                          className={styles.todoCheck}
                          onChange={() => { if (idx >= 0) handleCheckboxToggle(idx); }}
                        />
                      );
                    }
                    return <input {...props} />;
                  },
                  a({ href, children }) {
                    return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
                  },
                }}
              >
                {value}
              </ReactMarkdown>
            </div>
          ) : (
            <span className={styles.placeholder} onClick={() => setEditing(true)}>
              Write something…
            </span>
          )}
        </div>
      )}
    </div>
  );
}
