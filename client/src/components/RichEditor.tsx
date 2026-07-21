import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './NotesConsole.module.css';

// A Confluence-style block editor. There is no separate "edit mode" — the
// surface is always a contentEditable that renders its content live. Typing "/"
// at the start of an empty block opens a command menu that transforms the
// current block (heading, list, to-do, quote, code, divider).
//
// The editor is intentionally *uncontrolled*: React sets the initial HTML on
// mount (the parent remounts it via `key` when switching notes) and never
// rewrites innerHTML afterwards, so the caret is never disturbed. Edits flow
// out through onChange(html).

// Stable, non-hashed class so to-do markup embedded in saved note HTML keeps
// working across builds (a CSS-module hash could change and orphan old notes).
const TODO_CLASS = 'note-todo';

interface BlockCmd {
  id: 'text' | 'h1' | 'h2' | 'h3' | 'ul' | 'ol' | 'todo' | 'quote' | 'code' | 'hr';
  label: string;
  badge: string;
  hint: string;
}

const BLOCK_CMDS: BlockCmd[] = [
  { id: 'text',  label: 'Text',        badge: '¶',  hint: 'Plain paragraph' },
  { id: 'h1',    label: 'Heading 1',   badge: 'H1', hint: 'Large section heading' },
  { id: 'h2',    label: 'Heading 2',   badge: 'H2', hint: 'Medium section heading' },
  { id: 'h3',    label: 'Heading 3',   badge: 'H3', hint: 'Small section heading' },
  { id: 'ul',    label: 'Bullet list', badge: '•',  hint: 'Simple bulleted list' },
  { id: 'ol',    label: 'Numbered',    badge: '1.', hint: 'Numbered list' },
  { id: 'todo',  label: 'To-do',       badge: '☐',  hint: 'Trackable task item' },
  { id: 'quote', label: 'Quote',       badge: '"',  hint: 'Capture a quote' },
  { id: 'code',  label: 'Code',        badge: '<>', hint: 'Monospace code block' },
  { id: 'hr',    label: 'Divider',     badge: '—',  hint: 'Horizontal rule' },
];

interface Props {
  initialHtml: string;
  onChange: (html: string) => void;
}

interface MenuPos { left: number; top: number | null; bottom: number | null; maxHeight: number; }

// Keep the command menu fully on-screen: clamp horizontally, and flip above the
// caret when there isn't room below. maxHeight makes it scroll rather than run
// off the page.
function computeMenuPos(base: DOMRect): MenuPos {
  const MENU_W = 288;
  const M = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = base.left;
  if (left + MENU_W > vw - M) left = vw - MENU_W - M;
  if (left < M) left = M;
  const spaceBelow = vh - base.bottom - M;
  const spaceAbove = base.top - M;
  if (spaceBelow < 200 && spaceAbove > spaceBelow) {
    return { left, top: null, bottom: vh - base.top + 4, maxHeight: Math.max(140, Math.min(300, spaceAbove - 4)) };
  }
  return { left, top: base.bottom + 4, bottom: null, maxHeight: Math.max(140, Math.min(300, spaceBelow - 4)) };
}

// The top-level block element that contains the caret (a direct child of the
// editor root).
function getBlock(editor: HTMLElement): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  let node: Node | null = sel.anchorNode;
  if (!node) return null;
  if (node === editor) {
    return (editor.children[sel.anchorOffset] as HTMLElement)
      ?? (editor.lastElementChild as HTMLElement) ?? null;
  }
  while (node && node.parentNode !== editor) node = node.parentNode;
  return (node as HTMLElement) ?? null;
}

function placeCaret(node: Node, atStart = true) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(atStart);
  sel.removeAllRanges();
  sel.addRange(range);
}

function caretAtBlockStart(block: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const r = sel.getRangeAt(0).cloneRange();
  r.selectNodeContents(block);
  r.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
  return r.toString().length === 0;
}

// No visible text between the caret and the end of the block (trailing <br>s
// count as empty).
function caretAtBlockEnd(block: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const r = sel.getRangeAt(0).cloneRange();
  r.selectNodeContents(block);
  try { r.setStart(sel.anchorNode!, sel.anchorOffset); } catch { return false; }
  return r.toString().length === 0;
}

// The line the caret sits on has no text (caret at block start or right after a
// line break).
function currentLineEmpty(): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode) return false;
  const node = sel.anchorNode;
  const off = sel.anchorOffset;
  if (node.nodeType === Node.TEXT_NODE) {
    const before = (node.textContent ?? '').slice(0, off);
    if (before.length > 0) return /\n$/.test(before);
    const prev = node.previousSibling;
    return !prev || (prev as HTMLElement).nodeName === 'BR';
  }
  const child = (node as HTMLElement).childNodes[off - 1];
  return !child || (child as HTMLElement).nodeName === 'BR';
}

// Whether the placeholder should show. Text alone isn't enough to decide:
// to-dos, dividers, and empty code/quote frames render visibly while holding
// no text, and the placeholder would sit on top of them.
function isBlank(el: HTMLElement): boolean {
  if ((el.textContent ?? '').trim()) return false;
  return !el.querySelector(`hr, img, pre, blockquote, ul, ol, h1, h2, h3, .${TODO_CLASS}`);
}

export default function RichEditor({ initialHtml, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIdx, setSlashIdx] = useState(0);
  const [menuPos, setMenuPos] = useState<MenuPos>({ left: 0, top: 0, bottom: null, maxHeight: 280 });

  // Where the "/" was typed, so we can strip "/query" before applying a command
  const slashInfo = useRef<{ node: Node; offset: number } | null>(null);
  const slashOpenRef = useRef(false);
  slashOpenRef.current = slashOpen;
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the command menu when clicking anywhere outside it
  useEffect(() => {
    if (!slashOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeSlash();
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [slashOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Set the initial content once; the parent remounts (key) on note switch.
  useEffect(() => {
    const el = ref.current!;
    el.innerHTML = initialHtml && initialHtml.trim() ? initialHtml : '<p><br></p>';
    el.classList.toggle('note-empty', isBlank(el));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = slashQuery
    ? BLOCK_CMDS.filter(c => c.label.toLowerCase().includes(slashQuery.toLowerCase()))
    : BLOCK_CMDS;

  function emit() {
    const el = ref.current;
    if (!el) return;
    el.classList.toggle('note-empty', isBlank(el));
    onChange(el.innerHTML);
  }

  function closeSlash() {
    slashInfo.current = null;
    setSlashOpen(false);
    setSlashQuery('');
    setSlashIdx(0);
  }

  function handleInput() {
    const editor = ref.current!;
    const sel = window.getSelection();

    if (slashOpenRef.current && slashInfo.current) {
      // Track the query typed after "/"
      const { node, offset } = slashInfo.current;
      if (!sel || sel.anchorNode !== node || sel.anchorOffset <= offset) { closeSlash(); }
      else {
        const text = node.textContent ?? '';
        const q = text.substring(offset + 1, sel.anchorOffset);
        if (/\s/.test(q)) closeSlash();
        else { setSlashQuery(q); setSlashIdx(0); }
      }
    } else if (sel && sel.isCollapsed && sel.anchorNode) {
      // Confluence-style: open when "/" is typed at the start of a line/text
      // node or right after whitespace (not mid-word, e.g. "and/or").
      const node = sel.anchorNode;
      const off = sel.anchorOffset;
      if (node.nodeType === Node.TEXT_NODE && off > 0 && node.textContent![off - 1] === '/') {
        const prev = off >= 2 ? node.textContent![off - 2] : '';
        if (prev === '' || /\s/.test(prev)) {
          slashInfo.current = { node, offset: off - 1 };
          const rect = sel.getRangeAt(0).getBoundingClientRect();
          const base = rect && rect.height ? rect : (getBlock(editor)?.getBoundingClientRect() ?? rect);
          setMenuPos(computeMenuPos(base));
          setSlashOpen(true);
          setSlashQuery('');
          setSlashIdx(0);
        }
      }
    }

    emit();
  }

  function stripSlash() {
    const info = slashInfo.current;
    const sel = window.getSelection();
    if (!info || !sel || sel.rangeCount === 0) return;
    const del = document.createRange();
    try {
      del.setStart(info.node, info.offset);
      del.setEnd(sel.anchorNode!, sel.anchorOffset);
      del.deleteContents();
    } catch { return; }
    // deleteContents collapses the range to its start and re-homes the boundary
    // if the text node was removed entirely (empty line) — so use the range's
    // own (now-valid) boundary rather than the possibly-detached stored node.
    sel.removeAllRanges();
    const c = document.createRange();
    c.setStart(del.startContainer, del.startOffset);
    c.collapse(true);
    sel.addRange(c);
  }

  function makeTodo(block: HTMLElement) {
    const div = document.createElement('div');
    div.className = TODO_CLASS;
    div.setAttribute('data-checked', 'false');
    while (block.firstChild) div.appendChild(block.firstChild);
    if (!div.firstChild) div.appendChild(document.createElement('br'));
    block.replaceWith(div);
    placeCaret(div, true);
  }

  function applyCmd(cmd: BlockCmd) {
    const editor = ref.current!;
    editor.focus();
    if (slashInfo.current) stripSlash();

    const block = getBlock(editor);
    switch (cmd.id) {
      case 'text':  document.execCommand('formatBlock', false, '<P>'); break;
      case 'h1':    document.execCommand('formatBlock', false, '<H1>'); break;
      case 'h2':    document.execCommand('formatBlock', false, '<H2>'); break;
      case 'h3':    document.execCommand('formatBlock', false, '<H3>'); break;
      case 'ul':    document.execCommand('insertUnorderedList'); break;
      case 'ol':    document.execCommand('insertOrderedList'); break;
      case 'quote': document.execCommand('formatBlock', false, '<BLOCKQUOTE>'); break;
      case 'code':  document.execCommand('formatBlock', false, '<PRE>'); break;
      case 'todo':  if (block) makeTodo(block); break;
      case 'hr': {
        document.execCommand('insertHorizontalRule');
        // Guarantee an editable paragraph after the rule
        if (editor.lastElementChild?.tagName === 'HR') {
          const p = document.createElement('p');
          p.appendChild(document.createElement('br'));
          editor.appendChild(p);
          placeCaret(p, true);
        }
        break;
      }
    }
    closeSlash();
    emit();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (slashOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIdx(i => (i + 1) % Math.max(filtered.length, 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSlashIdx(i => (i - 1 + filtered.length) % Math.max(filtered.length, 1)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); if (filtered[slashIdx]) applyCmd(filtered[slashIdx]); return; }
      if (e.key === 'Escape') { e.preventDefault(); closeSlash(); return; }
      if (e.key === 'Backspace') {
        // Backspacing over the "/" closes the menu (native delete still runs)
        const info = slashInfo.current;
        const sel = window.getSelection();
        if (info && sel && sel.anchorOffset <= info.offset + 1) closeSlash();
        return;
      }
      return;
    }

    const editor = ref.current!;
    const block = getBlock(editor);

    // To-do list behaviour: Enter continues the list; Enter on an empty item or
    // Backspace at its start exits back to a paragraph.
    if (block && block.classList.contains(TODO_CLASS)) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const empty = !(block.textContent ?? '').trim();
        if (empty) {
          const p = document.createElement('p');
          p.appendChild(document.createElement('br'));
          block.replaceWith(p);
          placeCaret(p, true);
        } else {
          const nd = document.createElement('div');
          nd.className = TODO_CLASS;
          nd.setAttribute('data-checked', 'false');
          nd.appendChild(document.createElement('br'));
          block.after(nd);
          placeCaret(nd, true);
        }
        emit();
        return;
      }
      if (e.key === 'Backspace' && caretAtBlockStart(block)) {
        e.preventDefault();
        const p = document.createElement('p');
        while (block.firstChild) p.appendChild(block.firstChild);
        if (!p.firstChild) p.appendChild(document.createElement('br'));
        block.replaceWith(p);
        placeCaret(p, true);
        emit();
        return;
      }
    }

    // Quote / code block: Enter adds a line; a second Enter (or Enter on an
    // already-blank last line) exits to a fresh paragraph, like a bullet list.
    if (block && (block.nodeName === 'BLOCKQUOTE' || block.nodeName === 'PRE') && e.key === 'Enter') {
      e.preventDefault();
      if (caretAtBlockEnd(block) && currentLineEmpty()) {
        while (block.lastChild && (block.lastChild as HTMLElement).nodeName === 'BR') {
          block.removeChild(block.lastChild);
        }
        const p = document.createElement('p');
        p.appendChild(document.createElement('br'));
        block.after(p);
        if (!(block.textContent ?? '').trim()) block.remove();
        placeCaret(p, true);
      } else {
        document.execCommand('insertLineBreak');
      }
      emit();
      return;
    }
  }

  // Toggle a to-do checkbox when its box (the left gutter) is clicked.
  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const todo = target.closest(`.${TODO_CLASS}`) as HTMLElement | null;
    if (!todo) return;
    const rect = todo.getBoundingClientRect();
    if (e.clientX - rect.left <= 24) {
      const checked = todo.getAttribute('data-checked') === 'true';
      todo.setAttribute('data-checked', checked ? 'false' : 'true');
      emit();
    }
  }

  return (
    <div className={styles.editorScroll}>
      <div
        ref={ref}
        className={styles.editor}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        onBlur={emit}
        data-placeholder="Type / for commands, or just start writing…"
      />

      {/* Portaled to <body> so its position:fixed resolves against the viewport
          — the console shell keeps a transform (animation fill), which would
          otherwise become the containing block and mis-place the menu. */}
      {slashOpen && filtered.length > 0 && createPortal(
        <div
          ref={menuRef}
          className={styles.slashMenu}
          style={{
            left: menuPos.left,
            top: menuPos.top ?? undefined,
            bottom: menuPos.bottom ?? undefined,
            maxHeight: menuPos.maxHeight,
          }}
        >
          <div className={styles.slashHint}>Blocks</div>
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              className={`${styles.slashItem} ${i === slashIdx ? styles.slashItemSel : ''}`}
              onMouseDown={e => { e.preventDefault(); applyCmd(cmd); }}
              onMouseEnter={() => setSlashIdx(i)}
            >
              <span className={styles.slashBadge}>{cmd.badge}</span>
              <span className={styles.slashLabel}>{cmd.label}</span>
              <span className={styles.slashHintText}>{cmd.hint}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
