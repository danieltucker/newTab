import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPatch } from '../services/api';

export interface ClockZone {
  city: string;
  zone: string;
}

export interface UserSettings {
  searchEngine: 'google' | 'duckduckgo' | 'bing' | 'brave';
  searchNewTab: boolean;
  theme: 'dark' | 'light' | 'auto';
  consoleEnabled: boolean;
  weatherLocation: string;
  weatherUnit: 'celsius' | 'fahrenheit';
  notes: string;
  clockFormat: '12h' | '24h';
  articleOpenMode: 'new-tab' | 'same-tab' | 'iframe';
  readingListOpenMode?: 'new-tab' | 'same-tab' | 'reader';
  bookmarkOpenMode?: 'same-tab' | 'new-tab';
  backgroundGradient?: 'none' | 'aurora' | 'dusk' | 'ocean' | 'midnight' | 'rose';
  activeWidgets: string[];
  worldClockZones: ClockZone[];
  rssFeedUrls: string[];
}

const DEFAULTS: UserSettings = {
  searchEngine: 'google',
  searchNewTab: false,
  theme: 'dark',
  consoleEnabled: true,
  weatherLocation: '',
  weatherUnit: 'celsius',
  notes: '',
  clockFormat: '12h',
  articleOpenMode: 'new-tab',
  readingListOpenMode: 'new-tab',
  bookmarkOpenMode: 'same-tab',
  backgroundGradient: 'none',
  activeWidgets: ['weather', 'notes'],
  worldClockZones: [],
  rssFeedUrls: [],
};

export function useSettings(accessToken: string | null) {
  const [settings, setSettings] = useState<UserSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    apiGet<UserSettings>('/api/settings')
      .then(s => { setSettings(s); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [accessToken]);

  const update = useCallback(async (patch: Partial<UserSettings>) => {
    const updated = await apiPatch<UserSettings>('/api/settings', patch);
    setSettings(updated);
    return updated;
  }, []);

  return { settings, update, loaded };
}
