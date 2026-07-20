import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '../services/api';
import { ReadingListItem } from '../types';

export function useReadingList(accessToken: string | null) {
  const [items, setItems] = useState<ReadingListItem[]>([]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const data = await apiGet<ReadingListItem[]>('/api/v1/reading-list');
    setItems(data);
  }, [accessToken]);

  useEffect(() => { load(); }, [load]);

  const saveItem = useCallback(async (item: Omit<ReadingListItem, 'id' | 'savedAt' | 'archived' | 'notes'>) => {
    const created = await apiPost<ReadingListItem>('/api/v1/reading-list', item);
    setItems(prev => [created, ...prev]);
    return created;
  }, []);

  const updateItem = useCallback(async (id: string, patch: Partial<Pick<ReadingListItem, 'archived' | 'title' | 'tag' | 'notes'>>) => {
    const updated = await apiPatch<ReadingListItem>(`/api/v1/reading-list/${id}`, patch);
    setItems(prev => prev.map(i => i.id === id ? updated : i));
  }, []);

  // Archive/remove update state first (so the UI can animate the change
  // synchronously) and reconcile with the server behind the scenes
  const archiveItem = useCallback(async (id: string, archived: boolean) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, archived } : i));
    try {
      const updated = await apiPatch<ReadingListItem>(`/api/v1/reading-list/${id}`, { archived });
      setItems(prev => prev.map(i => i.id === id ? updated : i));
    } catch {
      load();
    }
  }, [load]);

  const removeItem = useCallback(async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    try {
      await apiDelete(`/api/v1/reading-list/${id}`);
    } catch {
      load();
    }
  }, [load]);

  return { items, saveItem, updateItem, archiveItem, removeItem };
}
