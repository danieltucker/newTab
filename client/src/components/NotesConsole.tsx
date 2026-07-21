import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
import { noteText, noteSnippet } from '../utils/noteText';

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

interface NoteRowProps {
  doc: NoteDoc;
  active: boolean;
  snippet?: string;          // body context, shown when a search matched the text
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

const DocIcon = () => (
  <svg className={styles.treeIcon} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </svg>
);

function DeleteBtn({ id, onDelete }: { id: string; onDelete: (id: string) => void }) {
  return (
    <button
      className={styles.treeDelete}
      onClick={e => { e.stopPropagation(); onDelete(id); }}
      onPointerDown={e => e.stopPropagation()}
      title="Delete note"
      aria-label="Delete note"
    >
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M1 1l10 10M11 1L1 11" />
      </svg>
    </button>
  );
}

// Plain (non-draggable) row — used while a search filters the tree, since
// dropping onto a filtered list can't express a position in the full order.
function NoteRow({ doc, active, snippet, onSelect, onDelete }: NoteRowProps) {
  return (
    <div
      className={`${styles.treeItem} ${active ? styles.treeItemActive : ''} ${snippet ? styles.treeItemHit : ''}`}
      onClick={() => onSelect(doc.id)}
    >
      <DocIcon />
      <span className={styles.treeText}>
        <span className={styles.treeName}>{doc.title.trim() || 'Untitled'}</span>
        {snippet && <span className={styles.treeSnippet}>{snippet}</span>}
      </span>
      <DeleteBtn id={doc.id} onDelete={onDelete} />
    </div>
  );
}

function SortableNote({ doc, active, onSelect, onDelete }: NoteRowProps) {
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
      <DocIcon />
      <span className={styles.treeText}>
        <span className={styles.treeName}>{doc.title.trim() || 'Untitled'}</span>
      </span>
      <DeleteBtn id={doc.id} onDelete={onDelete} />
    </div>
  );
}

interface Props {
  docs: NoteDoc[];
  legacyNotes: string;      // old settings.notes, migrated on first use
  onSave: (docs: NoteDoc[]) => Promise<unknown> | void;
  initialNoteId?: string;   // opened from a search hit in the main search bar
  initialQuery?: string;    // …and the term that found it, seeded into the filter
  closing?: boolean;
  onClose: () => void;
}

export default function NotesConsole({
  docs, legacyNotes, onSave, initialNoteId, initialQuery = '', closing = false, onClose,
}: Props) {
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
  const [activeId, setActiveId] = useState<string>(
    () => (initialNoteId && initial.some(d => d.id === initialNoteId) ? initialNoteId : initial[0].id)
  );
  const [saved, setSaved] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const queryRef = useRef(query);
  queryRef.current = query;

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

  // Escape closes (the header has advertised this all along). The editor's
  // command menu stops propagation when it's open, so the first Escape there
  // dismisses the menu and a second one closes the console. An active search
  // filter is likewise cleared first, before the console will close.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (queryRef.current) { setQuery(''); return; }
      requestClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [requestClose]);

  const active = docsRef.current.find(d => d.id === activeId) ?? docsRef.current[0];

  // Search the tree by title and body text. Body edits are written straight to
  // the doc objects (no re-render), so this recomputes off the live text every
  // time the query changes.
  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return list.map(doc => ({ doc, snippet: undefined as string | undefined }));
    return list.flatMap(doc => {
      const text = noteText(doc.body);
      const at = text.toLowerCase().indexOf(q);
      const inTitle = doc.title.toLowerCase().includes(q);
      if (at < 0 && !inTitle) return [];
      return [{ doc, snippet: at >= 0 ? noteSnippet(text, q) : undefined }];
    });
  }, [list, q]);

  // Opening a hit from the main search bar: jump to that note once it's known.
  useEffect(() => {
    if (initialNoteId && docsRef.current.some(d => d.id === initialNoteId)) setActiveId(initialNoteId);
  }, [initialNoteId]);

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
    setQuery('');   // an empty new note would be hidden by an active filter
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
                <kbd>tab</kbd>indent
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
                <span className={styles.treeLabel}>
                  {q ? `${results.length} match${results.length === 1 ? '' : 'es'}` : 'All notes'}
                </span>
                <button className={styles.addBtn} onClick={addNote} title="New note" aria-label="New note">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                    <path d="M7 2v10M2 7h10" />
                  </svg>
                </button>
              </div>

              <div className={styles.searchWrap}>
                <svg className={styles.searchIcon} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  className={styles.searchInput}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search notes"
                  aria-label="Search notes"
                  spellCheck={false}
                />
                {query && (
                  <button
                    className={styles.searchClear}
                    onClick={() => setQuery('')}
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                      <path d="M1 1l10 10M11 1L1 11" />
                    </svg>
                  </button>
                )}
              </div>

              <div className={styles.treeList}>
                {q ? (
                  results.length === 0
                    ? <div className={styles.treeEmpty}>No notes match “{query.trim()}”</div>
                    : results.map(({ doc, snippet }) => (
                        <NoteRow
                          key={doc.id}
                          doc={doc}
                          active={doc.id === activeId}
                          snippet={snippet}
                          onSelect={selectNote}
                          onDelete={deleteNote}
                        />
                      ))
                ) : (
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
                )}
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
