import { useEffect, useState } from 'react';
import { useAuth } from './hooks/useAuth';
import AuthPage from './pages/AuthPage';
import NewTabPage from './pages/NewTabPage';

export type ThemeSetting = 'dark' | 'light' | 'auto';
export type ResolvedTheme = 'dark' | 'light';

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveTheme(setting: ThemeSetting): ResolvedTheme {
  return setting === 'auto' ? (prefersDark() ? 'dark' : 'light') : setting;
}

function getInitialSetting(): ThemeSetting {
  return (localStorage.getItem('theme') as ThemeSetting) || 'dark';
}

export default function App() {
  const { accessToken, username, isAdmin, loading, login, register, logout, verifyTotp } = useAuth();
  const [themeSetting, setThemeSetting] = useState<ThemeSetting>(getInitialSetting);

  useEffect(() => {
    const resolved = resolveTheme(themeSetting);
    document.documentElement.setAttribute('data-theme', resolved);
    localStorage.setItem('theme', themeSetting);

    // When in auto mode, track OS preference changes live
    if (themeSetting !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [themeSetting]);

  if (loading) return null;

  if (!accessToken || !username) {
    return <AuthPage onLogin={login} onRegister={register} onTotpVerify={verifyTotp} />;
  }

  return (
    <NewTabPage
      accessToken={accessToken}
      username={username}
      isAdmin={isAdmin}
      themeSetting={themeSetting}
      resolvedTheme={resolveTheme(themeSetting)}
      onSetTheme={setThemeSetting}
      onLogout={logout}
    />
  );
}
