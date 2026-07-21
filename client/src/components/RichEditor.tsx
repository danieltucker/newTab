import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
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

type BlockId  = 'text' | 'h1' | 'h2' | 'h3' | 'ul' | 'ol' | 'todo' | 'quote' | 'code' | 'hr';
type InlineId = 'bold' | 'italic' | 'underline' | 'strike' | 'inlinecode' | 'link' | 'clear';

interface Cmd {
  id: BlockId | InlineId;
  kind: 'block' | 'inline';
  label: string;
  badge: string;
  hint: string;
  // Extra search terms, including the markdown that produces the same thing —
  // a plain label match can't find "Heading 2" from "h2" or "##".
  keys: string[];
}

const CMDS: Cmd[] = [
  { id: 'text',  kind: 'block', label: 'Text',        badge: '¶',  hint: 'Plain paragraph',      keys: ['text', 'p', 'plain', 'paragraph', 'body', 'normal'] },
  { id: 'h1',    kind: 'block', label: 'Heading 1',   badge: 'H1', hint: 'Large section heading', keys: ['h1', 'heading1', '#', 'title'] },
  { id: 'h2',    kind: 'block', label: 'Heading 2',   badge: 'H2', hint: 'Medium section heading', keys: ['h2', 'heading2', '##', 'subtitle', 'subheading'] },
  { id: 'h3',    kind: 'block', label: 'Heading 3',   badge: 'H3', hint: 'Small section heading', keys: ['h3', 'heading3', '###'] },
  { id: 'ul',    kind: 'block', label: 'Bullet list', badge: '•',  hint: 'Simple bulleted list',  keys: ['ul', 'bullet', 'list', 'unordered', '-', '*'] },
  { id: 'ol',    kind: 'block', label: 'Numbered',    badge: '1.', hint: 'Numbered list',         keys: ['ol', 'number', 'numbered', 'ordered', '1.'] },
  { id: 'todo',  kind: 'block', label: 'To-do',       badge: '☐',  hint: 'Trackable task item',   keys: ['todo', 'task', 'check', 'checkbox', 'checklist', '[]'] },
  { id: 'quote', kind: 'block', label: 'Quote',       badge: '"',  hint: 'Capture a quote',       keys: ['quote', 'blockquote', 'cite', '>'] },
  { id: 'code',  kind: 'block', label: 'Code block',  badge: '<>', hint: 'Monospace code block',  keys: ['code', 'codeblock', 'pre', 'snippet', '```'] },
  { id: 'hr',    kind: 'block', label: 'Divider',     badge: '—',  hint: 'Horizontal rule',       keys: ['hr', 'divider', 'rule', 'line', 'separator', '---'] },

  { id: 'bold',       kind: 'inline', label: 'Bold',          badge: 'B',  hint: 'Ctrl+B — **text**',  keys: ['bold', 'b', 'strong', '**'] },
  { id: 'italic',     kind: 'inline', label: 'Italic',        badge: 'I',  hint: 'Ctrl+I — *text*',    keys: ['italic', 'i', 'em', 'emphasis', '*', '_'] },
  { id: 'underline',  kind: 'inline', label: 'Underline',     badge: 'U',  hint: 'Ctrl+U',             keys: ['underline', 'u'] },
  { id: 'strike',     kind: 'inline', label: 'Strikethrough', badge: 'S',  hint: '~~text~~',           keys: ['strike', 'strikethrough', 's', 'del', 'cross', '~~'] },
  { id: 'inlinecode', kind: 'inline', label: 'Inline code',   badge: '`',  hint: 'Monospace `text`',   keys: ['inlinecode', 'mono', 'monospace', 'codespan', '`'] },
  { id: 'link',       kind: 'inline', label: 'Link',          badge: '🔗', hint: 'Add a hyperlink',    keys: ['link', 'url', 'href', 'anchor', 'a', '[]()'] },
  { id: 'clear',      kind: 'inline', label: 'Clear format',  badge: 'Tx', hint: 'Strip formatting',   keys: ['clear', 'remove', 'unformat', 'reset', 'strip', 'plain'] },
];

// Match on the label and every alias, ignoring spaces and case, so "h2",
// "heading2", "heading 2" and "##" all land on Heading 2.
function cmdMatches(cmd: Cmd, query: string): boolean {
  const q = query.toLowerCase().replace(/\s+/g, '');
  if (!q) return true;
  if (cmd.label.toLowerCase().replace(/\s+/g, '').includes(q)) return true;
  return cmd.keys.some(k => k.includes(q));
}

// Toolbar glyphs. Stroke-based 24-viewBox icons, matching the rest of the app —
// the letter/punctuation stand-ins read poorly at button size.
const icon = (paths: React.ReactNode) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>
);

// A quote bar beside indented lines — reads as "blockquote" rather than as a
// stray punctuation mark
const QuoteIcon = () => icon(<>
  <path d="M4 5v14" />
  <path d="M9 7h11" /><path d="M9 12h11" /><path d="M9 17h7" />
</>);

const CodeIcon = () => icon(<>
  <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
</>);

// Eraser — the conventional "remove formatting" mark
const ClearIcon = () => icon(<>
  <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
  <path d="M22 21H7" /><path d="m5 11 9 9" />
</>);

// A single clean rule. Faded marks above and below read as "=" at this size.
const DividerIcon = () => icon(<path d="M3 12h18" />);

const LinkIcon = () => icon(<>
  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
</>);

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
          .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface Props {
  initialHtml: string;
  onChange: (html: string) => void;
}

interface MenuPos { left: number; top: number | null; bottom: number | null; maxHeight: number; }

// Inline marks the toolbars light up for
interface Marks { bold: boolean; italic: boolean; underline: boolean; strike: boolean; }
const NO_MARKS: Marks = { bold: false, italic: false, underline: false, strike: false };

// First-paint estimate only — the bubble sizes to its content, so the real
// width is measured after render and the position corrected before paint.
const BUBBLE_EST_W = 250;
const BUBBLE_M = 8;

interface BubblePos { anchorX: number; left: number; top: number; }

// Centre the bubble over the selection. `boundsTop` is the top of the editor's
// scroll area — selecting on the first line would otherwise float the bubble up
// over the utility bar, so in that case it flips below the selection instead.
function computeBubblePos(r: DOMRect, boundsTop: number): BubblePos {
  const anchorX = r.left + r.width / 2;
  let top = r.top - 44;
  if (top < Math.max(BUBBLE_M, boundsTop)) top = r.bottom + BUBBLE_M;
  return { anchorX, left: clampBubbleLeft(anchorX, BUBBLE_EST_W), top };
}

function clampBubbleLeft(anchorX: number, width: number): number {
  return Math.max(BUBBLE_M, Math.min(anchorX - width / 2, window.innerWidth - width - BUBBLE_M));
}

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

// stripSlash leaves the block holding nothing but an empty text node, and
// Chrome treats such a block as if it weren't there: formatBlock and the list
// commands act on the *previous* block, and typed text lands outside the
// paragraph entirely. Swap in a <br> and re-anchor the caret so commands apply
// to the line the user is actually on. Returns the repaired block.
function repairBlankBlock(editor: HTMLElement): HTMLElement | null {
  const block = getBlock(editor);
  if (!block) return null;
  if ((block.textContent ?? '').trim() || block.querySelector('br, hr, img')) return block;
  while (block.firstChild) block.removeChild(block.firstChild);
  block.appendChild(document.createElement('br'));
  placeCaret(block, true);
  return getBlock(editor);
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIdx, setSlashIdx] = useState(0);
  const [menuPos, setMenuPos] = useState<MenuPos>({ left: 0, top: 0, bottom: null, maxHeight: 280 });
  const [marks, setMarks] = useState<Marks>(NO_MARKS);
  const [bubble, setBubble] = useState<BubblePos | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  // The rendered bubble is as wide as its buttons need; re-centre on the real
  // width before paint so nothing hangs off either edge.
  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el || !bubble) return;
    el.style.left = `${clampBubbleLeft(bubble.anchorX, el.offsetWidth)}px`;
  }, [bubble]);

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

  const filtered = slashQuery ? CMDS.filter(c => cmdMatches(c, slashQuery)) : CMDS;

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

  // ── Toolbars ──────────────────────────────────────────────────────────
  // Both the bar above the note and the selection bubble drive these. Buttons
  // suppress mousedown so focus (and the selection) never leaves the editor,
  // which is what lets execCommand act on what the user highlighted.
  function readMarks(): Marks {
    try {
      return {
        bold:      document.queryCommandState('bold'),
        italic:    document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strike:    document.queryCommandState('strikeThrough'),
      };
    } catch { return NO_MARKS; }
  }

  function execInline(command: string, value?: string) {
    ref.current?.focus();
    document.execCommand(command, false, value);
    setMarks(readMarks());
    emit();
  }

  function applyLink() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const collapsed = sel.isCollapsed;
    // prompt() drops the selection, so stash the range and put it back after
    const saved = sel.getRangeAt(0).cloneRange();
    const url = window.prompt('Link URL', 'https://');
    sel.removeAllRanges();
    sel.addRange(saved);
    const href = (url ?? '').trim();
    if (!href || href === 'https://') return;
    if (collapsed) {
      // Invoked from the slash menu with nothing selected — insert the URL as
      // its own link rather than doing nothing
      ref.current?.focus();
      document.execCommand('insertHTML', false,
        `<a href="${escapeHtml(href)}">${escapeHtml(href)}</a>&nbsp;`);
      setMarks(readMarks());
      emit();
      return;
    }
    execInline('createLink', href);
  }

  // Track the selection to light up the active marks and raise the bubble.
  useEffect(() => {
    function onSelectionChange() {
      const el = ref.current;
      const sel = window.getSelection();
      if (!el || !sel || sel.rangeCount === 0) { setBubble(null); return; }
      const range = sel.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) return; // selection elsewhere on the page
      setMarks(readMarks());
      if (sel.isCollapsed || !sel.toString().trim()) { setBubble(null); return; }
      const r = range.getBoundingClientRect();
      if (!r || (!r.width && !r.height)) { setBubble(null); return; }
      const boundsTop = scrollRef.current?.getBoundingClientRect().top ?? 0;
      setBubble(computeBubblePos(r, boundsTop));
    }
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  // The command menu and the bubble should never be up at the same time
  useEffect(() => { if (slashOpen) setBubble(null); }, [slashOpen]);

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

  function applyCmd(cmd: Cmd) {
    if (cmd.kind === 'inline') applyInline(cmd.id as InlineId);
    else applyBlock(cmd.id as BlockId);
  }

  // Inline marks from the slash menu act on a collapsed caret: execCommand
  // flips the typing state, so whatever the user types next comes out styled.
  function applyInline(id: InlineId) {
    const editor = ref.current!;
    editor.focus();
    if (slashInfo.current) stripSlash();
    repairBlankBlock(editor);
    switch (id) {
      case 'bold':       document.execCommand('bold'); break;
      case 'italic':     document.execCommand('italic'); break;
      case 'underline':  document.execCommand('underline'); break;
      case 'strike':     document.execCommand('strikeThrough'); break;
      case 'inlinecode': toggleInlineCode(); break;
      case 'clear':      document.execCommand('removeFormat'); break;
      case 'link':       closeSlash(); applyLink(); return;
    }
    closeSlash();
    setMarks(readMarks());
    emit();
  }

  // No execCommand for <code>, so wrap the selection by hand. With nothing
  // selected, drop in an empty code span and park the caret inside it.
  function toggleInlineCode() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const existing = (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? (range.commonAncestorContainer as HTMLElement)
      : range.commonAncestorContainer.parentElement)?.closest('code');
    if (existing) { // unwrap
      const parent = existing.parentNode!;
      while (existing.firstChild) parent.insertBefore(existing.firstChild, existing);
      parent.removeChild(existing);
      return;
    }
    const code = document.createElement('code');
    if (sel.isCollapsed) {
      code.appendChild(document.createTextNode('​')); // keeps the span selectable
      range.insertNode(code);
      placeCaret(code, false);
    } else {
      code.appendChild(range.extractContents());
      range.insertNode(code);
      placeCaret(code, false);
    }
  }

  function applyBlock(id: BlockId) {
    const editor = ref.current!;
    editor.focus();
    if (slashInfo.current) stripSlash();

    const block = repairBlankBlock(editor) ?? getBlock(editor);

    switch (id) {
      case 'text':  document.execCommand('formatBlock', false, '<P>'); break;
      case 'h1':    document.execCommand('formatBlock', false, '<H1>'); break;
      case 'h2':    document.execCommand('formatBlock', false, '<H2>'); break;
      case 'h3':    document.execCommand('formatBlock', false, '<H3>'); break;
      case 'ul':
      case 'ol': {
        document.execCommand(id === 'ul' ? 'insertUnorderedList' : 'insertOrderedList');
        // Chrome leaves the new list nested inside the old <p>. That renders,
        // but re-parsing the saved HTML hoists the list out and strands an
        // empty paragraph — so unwrap it now.
        const b = getBlock(editor);
        if (b && b.nodeName === 'P' && b.children.length === 1 &&
            /^(UL|OL)$/.test(b.firstElementChild!.nodeName)) {
          const list = b.firstElementChild as HTMLElement;
          b.replaceWith(list);
          const li = list.querySelector('li');
          if (li) placeCaret(li, false);
        }
        break;
      }
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
      // stopPropagation keeps the console's Escape-to-close from also firing —
      // the first Escape should only dismiss this menu
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSlash(); return; }
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

  const inlineBtns = (
    <>
      <TBtn title="Bold (Ctrl+B)"      active={marks.bold}      onRun={() => execInline('bold')}><b>B</b></TBtn>
      <TBtn title="Italic (Ctrl+I)"    active={marks.italic}    onRun={() => execInline('italic')}><i>I</i></TBtn>
      <TBtn title="Underline (Ctrl+U)" active={marks.underline} onRun={() => execInline('underline')}><u>U</u></TBtn>
      <TBtn title="Strikethrough"      active={marks.strike}    onRun={() => execInline('strikeThrough')}><s>S</s></TBtn>
    </>
  );

  // Link, divider and clear formatting travel together as the "insert & strip"
  // group at the end of the bar
  const linkBtns = (
    <>
      <TBtn title="Add link" onRun={applyLink}><LinkIcon /></TBtn>
      <TBtn title="Divider" onRun={() => applyBlock('hr')}><DividerIcon /></TBtn>
      <TBtn title="Clear formatting" onRun={() => execInline('removeFormat')}><ClearIcon /></TBtn>
    </>
  );

  return (
    <>
      {/* ── Utility bar ── */}
      <div className={styles.toolbar} role="toolbar" aria-label="Formatting">
        {inlineBtns}
        <span className={styles.tbSep} />
        <TBtn title="Heading 1" onRun={() => applyBlock('h1')}>H1</TBtn>
        <TBtn title="Heading 2" onRun={() => applyBlock('h2')}>H2</TBtn>
        <TBtn title="Heading 3" onRun={() => applyBlock('h3')}>H3</TBtn>
        <TBtn title="Plain text" onRun={() => applyBlock('text')}>¶</TBtn>
        <span className={styles.tbSep} />
        <TBtn title="Bullet list"   onRun={() => applyBlock('ul')}>•</TBtn>
        <TBtn title="Numbered list" onRun={() => applyBlock('ol')}>1.</TBtn>
        <TBtn title="To-do"         onRun={() => applyBlock('todo')}>☐</TBtn>
        <span className={styles.tbSep} />
        <TBtn title="Quote"      onRun={() => applyBlock('quote')}><QuoteIcon /></TBtn>
        <TBtn title="Code block" onRun={() => applyBlock('code')}><CodeIcon /></TBtn>
        <span className={styles.tbSep} />
        {linkBtns}
      </div>

      {/* ── Selection bubble ── */}
      {bubble && createPortal(
        <div ref={bubbleRef} className={styles.bubble} style={{ left: bubble.left, top: bubble.top }}>
          {inlineBtns}
          <span className={styles.tbSep} />
          <TBtn title="Heading 2" onRun={() => applyBlock('h2')}>H2</TBtn>
          <TBtn title="Quote" onRun={() => applyBlock('quote')}><QuoteIcon /></TBtn>
          <span className={styles.tbSep} />
          {linkBtns}
        </div>,
        document.body
      )}

    <div className={styles.editorScroll} ref={scrollRef}>
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
      {slashOpen && createPortal(
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
          {filtered.length === 0 && (
            <div className={styles.slashEmpty}>No match for “{slashQuery}”</div>
          )}
          {filtered.map((cmd, i) => (
            <Fragment key={cmd.id}>
              {(i === 0 || filtered[i - 1].kind !== cmd.kind) && (
                <div className={styles.slashHint}>{cmd.kind === 'block' ? 'Blocks' : 'Format'}</div>
              )}
              <button
                className={`${styles.slashItem} ${i === slashIdx ? styles.slashItemSel : ''}`}
                onMouseDown={e => { e.preventDefault(); applyCmd(cmd); }}
                onMouseEnter={() => setSlashIdx(i)}
              >
                <span className={styles.slashBadge}>{cmd.badge}</span>
                <span className={styles.slashLabel}>{cmd.label}</span>
                <span className={styles.slashHintText}>{cmd.hint}</span>
              </button>
            </Fragment>
          ))}
        </div>,
        document.body
      )}
    </div>
    </>
  );
}

// Toolbar button. Suppressing mousedown is what keeps the caret/selection alive
// in the editor while the button is pressed.
function TBtn({ title, active, onRun, children }: {
  title: string; active?: boolean; onRun: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`${styles.tbBtn} ${active ? styles.tbBtnActive : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      onMouseDown={e => e.preventDefault()}
      onClick={onRun}
    >
      {children}
    </button>
  );
}
