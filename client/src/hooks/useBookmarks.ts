import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../services/api';
import { Bookmark } from '../types';

export function useBookmarks(accessToken: string | null, folderId: string | null) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !folderId) return;
    setLoading(true);
    try {
      const data = await apiGet<Bookmark[]>(`/api/bookmarks?folderId=${folderId}`);
      setBookmarks(data);
    } finally {
      setLoading(false);
    }
  }, [accessToken, folderId]);

  useEffect(() => { load(); }, [load]);

  const addBookmark = useCallback(async (payload: {
    folderId: string; domain: string; name: string; faviconUrl: string; color: string;
  }) => {
    const bookmark = await apiPost<Bookmark>('/api/bookmarks', payload);
    if (payload.folderId === folderId) {
      setBookmarks(prev => [...prev, bookmark]);
    }
    return bookmark;
  }, [folderId]);

  const deleteBookmark = useCallback(async (id: string) => {
    await apiDelete(`/api/bookmarks/${id}`);
    setBookmarks(prev => prev.filter(b => b.id !== id));
  }, []);

  const reorderBookmarks = useCallback(async (reordered: Bookmark[]) => {
    setBookmarks(reordered);
    await apiPut('/api/bookmarks/reorder', reordered.map((b, i) => ({ id: b.id, position: i })));
  }, []);

  return { bookmarks, setBookmarks, loading, addBookmark, deleteBookmark, reorderBookmarks, reload: load };
}
