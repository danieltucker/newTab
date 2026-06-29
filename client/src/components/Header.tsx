import { useState, useEffect, useRef } from 'react';
import styles from './Header.module.css';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatTime(): string {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function Header() {
  const [time, setTime] = useState(formatTime);
  const [greeting, setGreeting] = useState(getGreeting);
  const [date, setDate] = useState(formatDate);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTime(formatTime());
      setGreeting(getGreeting());
      setDate(formatDate());
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <div className={styles.greeting}>{greeting}</div>
        <div className={styles.date}>{date}</div>
      </div>
      <div className={styles.right}>
        <div className={styles.clock}>{time}</div>
      </div>
    </header>
  );
}
