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
  categories: string[];
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
  archived: boolean;
  savedAt: string;
}

export interface AuthState {
  accessToken: string | null;
  username: string | null;
}
