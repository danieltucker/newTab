import { useState, useMemo, useRef } from 'react';
import styles from './SearchBar.module.css';

const SEARCH_URLS: Record<string, (q: string) => string> = {
  google:     q => `https://www.google.com/search?q=${q}`,
  duckduckgo: q => `https://duckduckgo.com/?q=${q}`,
  bing:       q => `https://www.bing.com/search?q=${q}`,
  brave:      q => `https://search.brave.com/search?q=${q}`,
};

function isUrl(s: string): boolean {
  const trimmed = s.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return true;
  const noProto = trimmed.replace(/^www\./, '');
  return /^[a-z0-9-]+\.[a-z]{2,}(\/|$)/i.test(noProto);
}

interface BookmarkHint {
  id: string;
  domain: string;
  name: string;
  faviconUrl: string;
}

interface ArticleHint {
  id: string;
  url: string;
  title: string;
  source: string;
}

type Suggestion =
  | { kind: 'bookmark'; id: string; name: string; domain: string; faviconUrl: string }
  | { kind: 'article';  id: string; title: string; source: string; url: string }
  | { kind: 'search';   text: string; url: string }
  | { kind: 'url';      text: string; url: string };

interface Props {
  searchEngine?: string;
  searchNewTab?: boolean;
  bookmarks?: BookmarkHint[];
  readingItems?: ArticleHint[];
}

export default function SearchBar({
  searchEngine = 'google',
  searchNewTab = false,
  bookmarks = [],
  readingItems = [],
}: Props) {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const suggestions = useMemo<Suggestion[]>(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];

    const results: Suggestion[] = [];

    bookmarks
      .filter(b => b.name.toLowerCase().includes(q) || b.domain.toLowerCase().includes(q))
      .slice(0, 5)
      .forEach(b => results.push({ kind: 'bookmark', id: b.id, name: b.name, domain: b.domain, faviconUrl: b.faviconUrl }));

    readingItems
      .filter(a => a.title.toLowerCase().includes(q) || a.source.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach(a => results.push({ kind: 'article', id: a.id, title: a.title, source: a.source, url: a.url }));

    const raw = value.trim();
    if (isUrl(raw)) {
      results.push({ kind: 'url', text: raw, url: raw.startsWith('http') ? raw : `https://${raw}` });
    } else {
      const url = (SEARCH_URLS[searchEngine] ?? SEARCH_URLS.google)(encodeURIComponent(raw));
      results.push({ kind: 'search', text: raw, url });
    }

    return results;
  }, [value, bookmarks, readingItems, searchEngine]);

  function navigate(url: string) {
    if (searchNewTab) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = url;
    }
    setValue('');
    setOpen(false);
    setSelectedIndex(-1);
  }

  function pick(item: Suggestion) {
    if (item.kind === 'bookmark') {
      navigate(`https://${item.domain}`);
    } else {
      navigate(item.url);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedIndex >= 0 && suggestions[selectedIndex]) {
      pick(suggestions[selectedIndex]);
      return;
    }
    const q = value.trim();
    if (!q) return;
    const url = isUrl(q)
      ? (q.startsWith('http') ? q : `https://${q}`)
      : (SEARCH_URLS[searchEngine] ?? SEARCH_URLS.google)(encodeURIComponent(q));
    navigate(url);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
      setSelectedIndex(-1);
    }
  }

  function handleBlur() {
    blurTimer.current = setTimeout(() => { setOpen(false); setSelectedIndex(-1); }, 150);
  }

  function handleMouseDown(item: Suggestion) {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    pick(item);
  }

  const IconDoc = () => (
    <svg className={styles.resultSvg} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  );

  const IconSearch = () => (
    <svg className={styles.resultSvg} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
  );

  const IconLink = () => (
    <svg className={styles.resultSvg} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  );

  return (
    <div className={styles.container}>
      <form className={styles.wrap} onSubmit={handleSubmit}>
        <svg className={styles.icon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          className={styles.input}
          type="text"
          placeholder="Search the web or enter an address"
          value={value}
          onChange={e => { setValue(e.target.value); setOpen(true); setSelectedIndex(-1); }}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (value.trim()) setOpen(true); }}
          onBlur={handleBlur}
        />
      </form>

      {open && suggestions.length > 0 && (
        <div className={styles.dropdown}>
          {suggestions.map((item, i) => {
            const sel = i === selectedIndex;
            if (item.kind === 'bookmark') return (
              <div key={item.id} className={`${styles.result} ${sel ? styles.resultSel : ''}`}
                onMouseDown={() => handleMouseDown(item)} onMouseEnter={() => setSelectedIndex(i)}>
                <img src={item.faviconUrl} alt="" className={styles.favicon} />
                <div className={styles.resultText}>
                  <span className={styles.resultLabel}>{item.name}</span>
                  <span className={styles.resultSub}>{item.domain}</span>
                </div>
                <span className={styles.badge}>Bookmark</span>
              </div>
            );
            if (item.kind === 'article') return (
              <div key={item.id} className={`${styles.result} ${sel ? styles.resultSel : ''}`}
                onMouseDown={() => handleMouseDown(item)} onMouseEnter={() => setSelectedIndex(i)}>
                <div className={styles.resultIconWrap}><IconDoc /></div>
                <div className={styles.resultText}>
                  <span className={styles.resultLabel}>{item.title}</span>
                  <span className={styles.resultSub}>{item.source}</span>
                </div>
                <span className={styles.badge}>Article</span>
              </div>
            );
            if (item.kind === 'url') return (
              <div key="url" className={`${styles.result} ${sel ? styles.resultSel : ''}`}
                onMouseDown={() => handleMouseDown(item)} onMouseEnter={() => setSelectedIndex(i)}>
                <div className={styles.resultIconWrap}><IconLink /></div>
                <div className={styles.resultText}>
                  <span className={styles.resultLabel}>Go to <strong>{item.text}</strong></span>
                </div>
              </div>
            );
            return (
              <div key="search" className={`${styles.result} ${sel ? styles.resultSel : ''}`}
                onMouseDown={() => handleMouseDown(item)} onMouseEnter={() => setSelectedIndex(i)}>
                <div className={styles.resultIconWrap}><IconSearch /></div>
                <div className={styles.resultText}>
                  <span className={styles.resultLabel}>Search for <strong>{item.text}</strong></span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
