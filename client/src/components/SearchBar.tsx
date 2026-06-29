import { useState } from 'react';
import styles from './SearchBar.module.css';

function isUrl(s: string): boolean {
  const trimmed = s.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return true;
  const noProto = trimmed.replace(/^www\./, '');
  return /^[a-z0-9-]+\.[a-z]{2,}(\/|$)/i.test(noProto);
}

export default function SearchBar() {
  const [value, setValue] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    if (isUrl(q)) {
      window.location.href = q.startsWith('http') ? q : `https://${q}`;
    } else {
      window.location.href = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    }
  }

  return (
    <form className={styles.wrap} onSubmit={handleSubmit}>
      <svg className={styles.icon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
      </svg>
      <input
        className={styles.input}
        type="text"
        placeholder="Search the web or enter an address"
        value={value}
        onChange={e => setValue(e.target.value)}
      />
    </form>
  );
}
