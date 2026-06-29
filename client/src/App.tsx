import { useEffect, useState } from 'react';
import { useAuth } from './hooks/useAuth';
import AuthPage from './pages/AuthPage';
import NewTabPage from './pages/NewTabPage';

type Theme = 'dark' | 'light';

function getInitialTheme(): Theme {
  return (localStorage.getItem('theme') as Theme) || 'dark';
}

export default function App() {
  const { accessToken, username, loading, login, register, logout } = useAuth();
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  function toggleTheme() {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }

  if (loading) {
    return null; // silent splash while session restores
  }

  if (!accessToken || !username) {
    return <AuthPage onLogin={login} onRegister={register} />;
  }

  return (
    <NewTabPage
      accessToken={accessToken}
      username={username}
      theme={theme}
      onToggleTheme={toggleTheme}
      onLogout={logout}
    />
  );
}
