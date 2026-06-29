export interface Folder {
  id: string;
  name: string;
  color: string;
  position: number;
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
