import { useState, useEffect, useRef, useCallback } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '../services/api';
import { ArticleComment, CommentPrefs } from '../types';
import RichEditor from './RichEditor';
import styles from './CommentsPanel.module.css';

// The comment thread, always open. It lives at the foot of the article reader
// modal, where there is room to actually read and write; cards carry only the
// compact CommentBar below, which opens that modal.
//
// Threads are keyed server-side by the article's canonical URL, so the same
// conversation appears whether the article came from the feed or the reading
// list.

interface Props {
  articleUrl: string;
  articleTitle: string;
  prefs: CommentPrefs;
  onCountChange?: (url: string, next: number) => void;
  // Reading-list items saved before comments existed carry a single plain-text
  // note, folded into the thread as a private comment the first time it loads.
  legacyNote?: string;
  onLegacyNoteMigrated?: () => void;
}

const MAX_DEPTH = 4; // deeper replies keep the last indent rather than marching off the page

function countTree(nodes: ArticleComment[]): number {
  return nodes.reduce((n, c) => n + 1 + countTree(c.replies), 0);
}

function commentDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Mirrors the server's blank check so Post can't offer to submit an empty
// editor (which still emits markup like "<p><br></p>").
function htmlIsBlank(html: string): boolean {
  if (/<(hr|table|img)\b/i.test(html)) return false;
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length === 0;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function initialOf(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}

// ── The compact strip that sits on a card ────────────────────────────────
export function CommentBar({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      className={styles.bar}
      onClick={onClick}
      title={count > 0 ? 'Read the article and its comments' : 'Read the article and add a comment'}
    >
      <CommentIcon />
      <span className={styles.barLabel}>
        {count > 0 ? `${count} comment${count === 1 ? '' : 's'}` : 'Comment'}
      </span>
      {count > 0 && <span className={styles.barCount}>{count}</span>}
    </button>
  );
}

// ── Composer ──────────────────────────────────────────────────────────────
// The body lives in a ref rather than state: RichEditor is uncontrolled, and
// re-rendering it on every keystroke buys nothing. Only the empty/non-empty
// flip needs a render, to enable the Post button.
function Composer({
  allowTitle, initialTitle = '', initialBody = '', defaultPublic, submitLabel,
  autoFocusTitle, busy, onSubmit, onCancel,
}: {
  allowTitle: boolean;
  initialTitle?: string;
  initialBody?: string;
  defaultPublic: boolean;
  submitLabel: string;
  autoFocusTitle?: boolean;
  busy: boolean;
  onSubmit: (v: { title: string; body: string; isPublic: boolean }) => void;
  onCancel?: () => void;
}) {
  const bodyRef = useRef(initialBody);
  const [empty, setEmpty] = useState(htmlIsBlank(initialBody));
  const [title, setTitle] = useState(initialTitle);
  const [isPublic, setIsPublic] = useState(defaultPublic);

  const handleChange = useCallback((html: string) => {
    bodyRef.current = html;
    const blank = htmlIsBlank(html);
    setEmpty(prev => (prev === blank ? prev : blank));
  }, []);

  return (
    <div className={styles.composer}>
      {allowTitle && (
        <input
          className={styles.titleInput}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Add a title (optional)"
          maxLength={200}
          autoFocus={autoFocusTitle}
        />
      )}
      <div className={styles.editorShell}>
        <RichEditor initialHtml={initialBody} onChange={handleChange} />
      </div>
      <div className={styles.composerFoot}>
        <button
          type="button"
          className={`${styles.visToggle} ${isPublic ? styles.visPublic : ''}`}
          onClick={() => setIsPublic(v => !v)}
          title={isPublic
            ? 'Public — anyone using this app can read this comment'
            : 'Private — only you can read this comment'}
        >
          {isPublic ? <GlobeIcon /> : <LockIcon />}
          {isPublic ? 'Public' : 'Private'}
        </button>
        <div className={styles.composerBtns}>
          {onCancel && (
            <button type="button" className={styles.cancelBtn} onClick={onCancel} disabled={busy}>
              Cancel
            </button>
          )}
          <button
            type="button"
            className={styles.postBtn}
            disabled={empty || busy}
            onClick={() => onSubmit({ title: title.trim(), body: bodyRef.current, isPublic })}
          >
            {busy ? 'Saving…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── One comment (and its replies) ────────────────────────────────────────
function CommentItem({
  node, depth, prefs, busyId, replyTo, editing,
  onReply, onEdit, onDelete, onSubmitReply, onSubmitEdit, onCancel,
}: {
  node: ArticleComment;
  depth: number;
  prefs: CommentPrefs;
  busyId: string | null;
  replyTo: string | null;
  editing: string | null;
  onReply: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSubmitReply: (parentId: string, v: { body: string; isPublic: boolean }) => void;
  onSubmitEdit: (id: string, v: { title: string; body: string; isPublic: boolean }) => void;
  onCancel: () => void;
}) {
  const isEditing = editing === node.id;
  const isReplying = replyTo === node.id;

  return (
    <div className={styles.comment}>
      <div className={styles.commentHead}>
        {node.author.avatar
          ? <img className={styles.avatar} src={node.author.avatar} alt="" />
          : <span className={styles.avatarFallback}>{initialOf(node.author.displayName)}</span>}
        <span className={styles.authorName}>{node.author.displayName}</span>
        {node.mine && <span className={styles.youTag}>you</span>}
        <span className={styles.dot}>·</span>
        <time className={styles.date} dateTime={node.createdAt} title={new Date(node.createdAt).toLocaleString()}>
          {commentDate(node.createdAt)}
        </time>
        {node.updatedAt !== node.createdAt && <span className={styles.edited}>edited</span>}
        {/* Only your own comments need the badge — anything from someone else is public by definition */}
        {node.mine && (
          <span className={`${styles.visTag} ${node.isPublic ? styles.visTagPublic : ''}`}>
            {node.isPublic ? 'Public' : 'Private'}
          </span>
        )}
      </div>

      {isEditing ? (
        <Composer
          allowTitle={node.parentId === null}
          initialTitle={node.title ?? ''}
          initialBody={node.body}
          defaultPublic={node.isPublic}
          submitLabel="Save"
          busy={busyId === node.id}
          onSubmit={v => onSubmitEdit(node.id, v)}
          onCancel={onCancel}
        />
      ) : (
        <>
          {node.title && <div className={styles.commentTitle}>{node.title}</div>}
          {/* Sanitized server-side on write — see server/src/lib/comments.ts */}
          <div className={styles.body} dangerouslySetInnerHTML={{ __html: node.body }} />
          <div className={styles.actions}>
            <button className={styles.actionBtn} onClick={() => onReply(node.id)}>Reply</button>
            {node.mine && <button className={styles.actionBtn} onClick={() => onEdit(node.id)}>Edit</button>}
            {node.mine && (
              <button
                className={`${styles.actionBtn} ${styles.deleteAction}`}
                onClick={() => onDelete(node.id)}
                disabled={busyId === node.id}
              >
                Delete
              </button>
            )}
          </div>
        </>
      )}

      {isReplying && (
        <Composer
          allowTitle={false}
          defaultPublic={prefs.defaultPublic}
          submitLabel="Reply"
          busy={busyId === node.id}
          onSubmit={v => onSubmitReply(node.id, { body: v.body, isPublic: v.isPublic })}
          onCancel={onCancel}
        />
      )}

      {node.replies.length > 0 && (
        <div className={depth < MAX_DEPTH ? styles.replies : undefined}>
          {node.replies.map(r => (
            <CommentItem
              key={r.id}
              node={r}
              depth={depth + 1}
              prefs={prefs}
              busyId={busyId}
              replyTo={replyTo}
              editing={editing}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onSubmitReply={onSubmitReply}
              onSubmitEdit={onSubmitEdit}
              onCancel={onCancel}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommentsPanel({
  articleUrl, articleTitle, prefs, onCountChange, legacyNote, onLegacyNoteMigrated,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [comments, setComments] = useState<ArticleComment[]>([]);
  const [composing, setComposing] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const migratedRef = useRef(false);
  const legacyRef = useRef({ legacyNote, onLegacyNoteMigrated });
  legacyRef.current = { legacyNote, onLegacyNoteMigrated };
  const countRef = useRef(onCountChange);
  countRef.current = onCountChange;

  const publish = useCallback((tree: ArticleComment[]) => {
    setComments(tree);
    countRef.current?.(articleUrl, countTree(tree));
  }, [articleUrl]);

  const fetchThread = useCallback(async (): Promise<ArticleComment[] | null> => {
    try {
      const data = await apiGet<{ comments: ArticleComment[] }>(
        `/api/v1/comments?url=${encodeURIComponent(articleUrl)}`
      );
      return data.comments ?? [];
    } catch {
      return null;
    }
  }, [articleUrl]);

  // Load on mount, folding in any pre-comments note
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      let tree = await fetchThread();
      if (tree === null) {
        if (!cancelled) { setError('Could not load comments'); setLoading(false); }
        return;
      }
      const { legacyNote: note, onLegacyNoteMigrated: done } = legacyRef.current;
      if (note && note.trim() && !migratedRef.current) {
        migratedRef.current = true;
        try {
          await apiPost('/api/v1/comments', {
            url: articleUrl,
            articleTitle,
            body: textToHtml(note.trim()),
            isPublic: false,
          });
          const refreshed = await fetchThread();
          if (refreshed) tree = refreshed;
          done?.();
        } catch {
          // Keeping the note on the item is the safe failure — it is not lost
          migratedRef.current = false;
        }
      }
      if (cancelled) return;
      publish(tree);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [articleUrl, articleTitle, fetchThread, publish]);

  const reload = useCallback(async () => {
    const tree = await fetchThread();
    if (tree) publish(tree);
  }, [fetchThread, publish]);

  async function submitRoot(v: { title: string; body: string; isPublic: boolean }) {
    setBusyId('new');
    try {
      await apiPost('/api/v1/comments', {
        url: articleUrl, articleTitle,
        title: v.title || undefined, body: v.body, isPublic: v.isPublic,
      });
      setComposing(false);
      await reload();
    } catch {
      setError('Could not post comment');
    } finally {
      setBusyId(null);
    }
  }

  async function submitReply(parentId: string, v: { body: string; isPublic: boolean }) {
    setBusyId(parentId);
    try {
      await apiPost('/api/v1/comments', {
        url: articleUrl, articleTitle, parentId, body: v.body, isPublic: v.isPublic,
      });
      setReplyTo(null);
      await reload();
    } catch {
      setError('Could not post reply');
    } finally {
      setBusyId(null);
    }
  }

  async function submitEdit(id: string, v: { title: string; body: string; isPublic: boolean }) {
    setBusyId(id);
    try {
      await apiPatch(`/api/v1/comments/${id}`, {
        title: v.title || null, body: v.body, isPublic: v.isPublic,
      });
      setEditing(null);
      await reload();
    } catch {
      setError('Could not save comment');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    try {
      await apiDelete(`/api/v1/comments/${id}`);
      await reload();
    } catch {
      setError('Could not delete comment');
    } finally {
      setBusyId(null);
    }
  }

  function cancelAll() {
    setReplyTo(null);
    setEditing(null);
  }

  const total = countTree(comments);

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>
          Comments
          {total > 0 && <span className={styles.panelCount}>{total}</span>}
        </h2>
        {!composing && !loading && (
          <button className={styles.addBtn} onClick={() => setComposing(true)}>
            Add comment
          </button>
        )}
      </div>

      {loading && (
        <div className={styles.skeleton}>
          <span className={styles.skelLine} />
          <span className={`${styles.skelLine} ${styles.skelShort}`} />
        </div>
      )}
      {error && <div className={styles.statusError}>{error}</div>}

      {!loading && comments.length === 0 && !composing && (
        <div className={styles.empty}>
          <CommentIcon />
          <span>No comments yet — start the thread.</span>
        </div>
      )}

      {composing && (
        <Composer
          allowTitle
          autoFocusTitle
          defaultPublic={prefs.defaultPublic}
          submitLabel="Post comment"
          busy={busyId === 'new'}
          onSubmit={submitRoot}
          onCancel={() => setComposing(false)}
        />
      )}

      {comments.length > 0 && (
        <div className={styles.thread}>
          {comments.map(c => (
            <CommentItem
              key={c.id}
              node={c}
              depth={0}
              prefs={prefs}
              busyId={busyId}
              replyTo={replyTo}
              editing={editing}
              onReply={id => { setEditing(null); setReplyTo(id); }}
              onEdit={id => { setReplyTo(null); setEditing(id); }}
              onDelete={remove}
              onSubmitReply={submitReply}
              onSubmitEdit={submitEdit}
              onCancel={cancelAll}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CommentIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
