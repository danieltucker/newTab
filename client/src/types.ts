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
}

export interface ReadingListItem {
  id: string;
  url: string;
  title: string;
  source: string;
  readTime: string;
  tag: string;
  savedAt: string;
}

export interface AuthState {
  accessToken: string | null;
  username: string | null;
}
