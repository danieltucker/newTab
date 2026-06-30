import { useState, useEffect, useRef } from 'react';
import styles from './Header.module.css';

function NewtMark() {
  return (
    <svg viewBox="0 0 100 100" className={styles.mark} aria-hidden>
      <defs>
        <linearGradient id="newt-hdr-g" x1="20" y1="14" x2="82" y2="86" gradientUnits="userSpaceOnUse">
          <stop offset="0"   stopColor="#9B8CFF" />
          <stop offset=".55" stopColor="#5BC8E6" />
          <stop offset="1"   stopColor="#36D6A6" />
        </linearGradient>
      </defs>
      <path d="M41 23 C60 15 81 27 80 49 C79 70 61 83 43 80 C28.5 77.5 19.5 64 25 50 C29 39.5 41 37 49 47 C53.5 52.5 51 59 48.5 58.5" fill="none" stroke="url(#newt-hdr-g)" strokeWidth="15.5" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="41" cy="23" rx="12.5" ry="11.5" fill="url(#newt-hdr-g)" />
      <path d="M64 78 L67 90 M82 56 L92 57 M30 66 L22 75" fill="none" stroke="url(#newt-hdr-g)" strokeWidth="6.5" strokeLinecap="round" />
      <path d="M44 30 C57 25 71 33 71 47" fill="none" stroke="#ffffff" strokeOpacity=".28" strokeWidth="4" strokeLinecap="round" />
      <circle cx="37.5" cy="20.5" r="3.1" fill="var(--bg)" />
      <circle cx="38.6" cy="19.4" r="1.05" fill="#fff" />
    </svg>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function Header() {
  const [greeting, setGreeting] = useState(getGreeting);
  const [date, setDate] = useState(formatDate);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setGreeting(getGreeting());
      setDate(formatDate());
    }, 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <div className={styles.logo}>
          <NewtMark />
          <span className={styles.logoText}>newt</span>
        </div>
        <div className={styles.greeting}>{greeting}</div>
        <div className={styles.date}>{date}</div>
      </div>
    </header>
  );
}
