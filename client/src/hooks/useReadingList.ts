import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '../services/api';
import { ReadingListItem } from '../types';

export function useReadingList(accessToken: string | null) {
  const [items, setItems] = useState<ReadingListItem[]>([]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const data = await apiGet<ReadingListItem[]>('/api/reading-list');
    setItems(data);
  }, [accessToken]);

  useEffect(() => { load(); }, [load]);

  const saveItem = useCallback(async (item: Omit<ReadingListItem, 'id' | 'savedAt' | 'archived' | 'notes'>) => {
    const created = await apiPost<ReadingListItem>('/api/reading-list', item);
    setItems(prev => [created, ...prev]);
    return created;
  }, []);

  const updateItem = useCallback(async (id: string, patch: Partial<Pick<ReadingListItem, 'archived' | 'title' | 'tag' | 'notes'>>) => {
    const updated = await apiPatch<ReadingListItem>(`/api/reading-list/${id}`, patch);
    setItems(prev => prev.map(i => i.id === id ? updated : i));
  }, []);

  const archiveItem = useCallback(async (id: string, archived: boolean) => {
    const updated = await apiPatch<ReadingListItem>(`/api/reading-list/${id}`, { archived });
    setItems(prev => prev.map(i => i.id === id ? updated : i));
  }, []);

  const removeItem = useCallback(async (id: string) => {
    await apiDelete(`/api/reading-list/${id}`);
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  return { items, saveItem, updateItem, archiveItem, removeItem };
}
