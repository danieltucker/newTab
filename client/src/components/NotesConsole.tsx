import { useState, useRef, useCallback } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from './NotesConsole.module.css';
import RichEditor from './RichEditor';
import { NoteDoc } from '../hooks/useSettings';

function uid(): string {
  return (crypto as any)?.randomUUID?.() ?? `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// One-time migration of the old single markdown note into editor HTML. Covers
// the block types the old slash menu produced; inline markdown is left as text.
function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  let listBuf: string[] = [];
  let listTag: 'ul' | 'ol' | null = null;

  const flushList = () => {
    if (listTag) { out.push(`<${listTag}>${listBuf.join('')}</${listTag}>`); listBuf = []; listTag = null; }
  };

  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```/);
    if (fence) {
      flushList();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(esc(lines[i])); i++; }
      i++; // closing fence
      out.push(`<pre>${code.join('\n') || '<br>'}</pre>`);
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      flushList();
      out.push(`<h${m[1].length}>${esc(m[2])}</h${m[1].length}>`);
    } else if ((m = line.match(/^\s*- \[( |x)\]\s+(.*)$/i))) {
      flushList();
      const checked = m[1].toLowerCase() === 'x';
      out.push(`<div class="note-todo" data-checked="${checked}">${esc(m[2]) || '<br>'}</div>`);
    } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      if (listTag && listTag !== 'ul') flushList();
      listTag = 'ul';
      listBuf.push(`<li>${esc(m[1])}</li>`);
    } else if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
      if (listTag && listTag !== 'ol') flushList();
      listTag = 'ol';
      listBuf.push(`<li>${esc(m[1])}</li>`);
    } else if ((m = line.match(/^>\s+(.*)$/))) {
      flushList();
      out.push(`<blockquote>${esc(m[1])}</blockquote>`);
    } else if (/^\s*---\s*$/.test(line)) {
      flushList();
      out.push('<hr>');
    } else if (line.trim() === '') {
      flushList();
    } else {
      flushList();
      out.push(`<p>${esc(line)}</p>`);
    }
    i++;
  }
  flushList();
  return out.join('') || '<p><br></p>';
}

interface SortableNoteProps {
  doc: NoteDoc;
  active: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function SortableNote({ doc, active, onSelect, onDelete }: SortableNoteProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: doc.id });
  return (
    <div
      ref={setNodeRef}
      className={`${styles.treeItem} ${active ? styles.treeItemActive : ''} ${isDragging ? styles.treeItemDragging : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={() => onSelect(doc.id)}
      {...attributes}
      {...listeners}
    >
      <svg className={styles.treeIcon} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </svg>
      <span className={styles.treeName}>{doc.title.trim() || 'Untitled'}</span>
      <button
        className={styles.treeDelete}
        onClick={e => { e.stopPropagation(); onDelete(doc.id); }}
        onPointerDown={e => e.stopPropagation()}
        title="Delete note"
        aria-label="Delete note"
      >
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M1 1l10 10M11 1L1 11" />
        </svg>
      </button>
    </div>
  );
}

interface Props {
  docs: NoteDoc[];
  legacyNotes: string;      // old settings.notes, migrated on first use
  onSave: (docs: NoteDoc[]) => Promise<unknown> | void;
  closing?: boolean;
  onClose: () => void;
}

export default function NotesConsole({ docs, legacyNotes, onSave, closing = false, onClose }: Props) {
  // Seed the working set once: existing docs → migrate legacy note → a blank note.
  const [initial] = useState<NoteDoc[]>(() => {
    if (docs && docs.length) return docs;
    if (legacyNotes && legacyNotes.trim()) {
      return [{ id: uid(), title: 'Notes', body: markdownToHtml(legacyNotes), updatedAt: Date.now() }];
    }
    return [{ id: uid(), title: '', body: '', updatedAt: Date.now() }];
  });

  // docsRef holds the live source of truth (body edits are written here without
  // re-rendering, so typing never churns React); `list` mirrors it for the tree.
  const docsRef = useRef<NoteDoc[]>(initial);
  const [list, setList] = useState<NoteDoc[]>(initial);
  const [activeId, setActiveId] = useState<string>(initial[0].id);
  const [saved, setSaved] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const flush = useCallback(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    Promise.resolve(onSave(docsRef.current)).then(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1400);
    }).catch(() => {});
  }, [onSave]);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, 700);
  }, [flush]);

  const requestClose = useCallback(() => {
    flush();
    onClose();
  }, [flush, onClose]);

  const active = docsRef.current.find(d => d.id === activeId) ?? docsRef.current[0];

  // Body edits: write straight to the ref (no re-render) + debounce a save.
  const handleBody = useCallback((html: string) => {
    const doc = docsRef.current.find(d => d.id === activeId);
    if (!doc) return;
    doc.body = html;
    doc.updatedAt = Date.now();
    scheduleSave();
  }, [activeId, scheduleSave]);

  function handleTitle(v: string) {
    docsRef.current = docsRef.current.map(d => d.id === activeId ? { ...d, title: v, updatedAt: Date.now() } : d);
    setList(docsRef.current);
    scheduleSave();
  }

  function addNote() {
    const doc: NoteDoc = { id: uid(), title: '', body: '', updatedAt: Date.now() };
    docsRef.current = [doc, ...docsRef.current];
    setList(docsRef.current);
    setActiveId(doc.id);
    scheduleSave();
  }

  function deleteNote(id: string) {
    let next = docsRef.current.filter(d => d.id !== id);
    if (next.length === 0) next = [{ id: uid(), title: '', body: '', updatedAt: Date.now() }];
    docsRef.current = next;
    setList(next);
    if (id === activeId) setActiveId(next[0].id);
    scheduleSave();
  }

  function selectNote(id: string) {
    if (id === activeId) return;
    // Body for the current note is already in docsRef; just switch.
    setActiveId(id);
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const oldIndex = docsRef.current.findIndex(d => d.id === a.id);
    const newIndex = docsRef.current.findIndex(d => d.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    docsRef.current = arrayMove(docsRef.current, oldIndex, newIndex);
    setList(docsRef.current);
    scheduleSave();
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) requestClose(); }}>
      <div
        className={`${styles.shell} ${closing ? styles.shellClosing : ''}`}
        onClick={e => e.stopPropagation()}
      >
        <div className={styles.console}>
          <div className={styles.header}>
            <span className={styles.headerTitle}>NOTES</span>
            <span className={styles.headerRight}>
              {saved && <span className={styles.savedBadge}>Saved</span>}
              <span className={styles.headerHints}>
                <kbd>/</kbd>commands
                <span className={styles.dot}>·</span>
                <kbd>esc</kbd>close
              </span>
              <button className={styles.closeBtn} onClick={requestClose} title="Close">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M1 1l10 10M11 1L1 11" />
                </svg>
              </button>
            </span>
          </div>

          <div className={styles.body}>
            {/* ── Note tree ── */}
            <aside className={styles.tree}>
              <div className={styles.treeHead}>
                <span className={styles.treeLabel}>All notes</span>
                <button className={styles.addBtn} onClick={addNote} title="New note" aria-label="New note">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                    <path d="M7 2v10M2 7h10" />
                  </svg>
                </button>
              </div>
              <div className={styles.treeList}>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={list.map(d => d.id)} strategy={verticalListSortingStrategy}>
                    {list.map(d => (
                      <SortableNote
                        key={d.id}
                        doc={d}
                        active={d.id === activeId}
                        onSelect={selectNote}
                        onDelete={deleteNote}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            </aside>

            {/* ── Editor ── */}
            <div className={styles.docPane}>
              <input
                className={styles.docTitle}
                value={active.title}
                onChange={e => handleTitle(e.target.value)}
                placeholder="Untitled"
                spellCheck={false}
              />
              <RichEditor
                key={active.id}
                initialHtml={active.body}
                onChange={handleBody}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
