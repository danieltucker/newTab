export interface Folder {
  id: string;
  name: string;
  color: string;
  position: number;
  feedUrls: string[];
  feedLastCheckedAt?: string | null;
}

export interface FeedArticle {
  id: string;
  feedUrl: string;
  title: string;
  link: string;
  source: string;
  pubDate: string | null;
  fetchedAt: string;
  readTime: number | null;
  snippet: string | null;
  imageUrl: string | null;
  categories: string[];
  read?: boolean;
}

export interface Bookmark {
  id: string;
  folderId: string;
  domain: string;
  name: string;
  faviconUrl: string;
  color: string;
  position: number;
  feedUrl?: string | null;
  feedCheckedAt?: string | null;
  feedLatestAt?: string | null;
  unreadCount?: number;
  lastVisitedAt?: string | null;
}

export interface ReadingListItem {
  id: string;
  url: string;
  title: string;
  source: string;
  readTime: string;
  tag: string;
  notes: string;
  imageUrl: string;
  archived: boolean;
  savedAt: string;
}

// A comment thread hangs off an article's canonical URL, so the same
// conversation shows on the feed card and the saved reading-list card alike.
export interface ArticleComment {
  id: string;
  parentId: string | null;
  title: string | null;      // root comments only
  body: string;              // sanitized HTML from the rich editor
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  mine: boolean;
  author: { username: string; displayName: string; avatar: string | null };
  replies: ArticleComment[];
}

export interface CommentPrefs {
  showPublic: boolean;
  defaultPublic: boolean;
  sort: 'newest' | 'oldest';
  autoExpand: boolean;
}

export interface AuthState {
  accessToken: string | null;
  username: string | null;
}
