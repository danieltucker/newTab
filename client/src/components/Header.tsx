import { useState, useEffect, useRef } from 'react';
import styles from './Header.module.css';
import HeaderWeather from './HeaderWeather';
import HeaderClock from './HeaderClock';
import NewtMark from './NewtMark';
import { ClockZone } from '../hooks/useSettings';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

interface Props {
  weatherLocation: string;
  weatherUnit: 'celsius' | 'fahrenheit';
  onSetWeatherLocation: (loc: string) => void;
  onSetWeatherUnit: (unit: 'celsius' | 'fahrenheit') => void;
  clockZones: ClockZone[];
  onSetClockZones: (zones: ClockZone[]) => void;
  clockFormat: '12h' | '24h';
}

export default function Header({
  weatherLocation, weatherUnit, onSetWeatherLocation, onSetWeatherUnit,
  clockZones, onSetClockZones, clockFormat,
}: Props) {
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
      <div className={styles.logo}>
        <NewtMark className={styles.mark} />
        <span className={styles.logoText}>newt</span>
      </div>

      <div className={styles.greetingRow}>
        <span className={styles.greeting}>{greeting}</span>
        <span className={styles.inlineWidget}>
          <HeaderWeather
            location={weatherLocation}
            unit={weatherUnit}
            onSetLocation={onSetWeatherLocation}
            onSetUnit={onSetWeatherUnit}
          />
        </span>
      </div>

      <div className={styles.dateRow}>
        <span className={styles.date}>{date}</span>
        <span className={styles.inlineWidget}>
          <HeaderClock
            zones={clockZones}
            onSetZones={onSetClockZones}
            format={clockFormat}
          />
        </span>
      </div>
    </header>
  );
}
