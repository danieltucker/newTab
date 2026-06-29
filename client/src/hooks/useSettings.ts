import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPatch } from '../services/api';

export interface UserSettings {
  searchEngine: 'google' | 'duckduckgo' | 'bing' | 'brave';
  searchNewTab: boolean;
  theme: 'dark' | 'light' | 'auto';
  consoleEnabled: boolean;
  weatherLocation: string;
  weatherUnit: 'celsius' | 'fahrenheit';
  notes: string;
}

const DEFAULTS: UserSettings = {
  searchEngine: 'google',
  searchNewTab: false,
  theme: 'dark',
  consoleEnabled: true,
  weatherLocation: '',
  weatherUnit: 'celsius',
  notes: '',
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
