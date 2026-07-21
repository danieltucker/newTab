import { useState, useEffect, useRef } from 'react';
import styles from './HeaderClock.module.css';
import { ClockZone } from '../hooks/useSettings';

const PRESETS: ClockZone[] = [
  { city: 'New York', zone: 'America/New_York' },
  { city: 'Los Angeles', zone: 'America/Los_Angeles' },
  { city: 'Chicago', zone: 'America/Chicago' },
  { city: 'Denver', zone: 'America/Denver' },
  { city: 'Toronto', zone: 'America/Toronto' },
  { city: 'Vancouver', zone: 'America/Vancouver' },
  { city: 'São Paulo', zone: 'America/Sao_Paulo' },
  { city: 'Buenos Aires', zone: 'America/Argentina/Buenos_Aires' },
  { city: 'Honolulu', zone: 'Pacific/Honolulu' },
  { city: 'Auckland', zone: 'Pacific/Auckland' },
  { city: 'London', zone: 'Europe/London' },
  { city: 'Paris', zone: 'Europe/Paris' },
  { city: 'Berlin', zone: 'Europe/Berlin' },
  { city: 'Madrid', zone: 'Europe/Madrid' },
  { city: 'Rome', zone: 'Europe/Rome' },
  { city: 'Amsterdam', zone: 'Europe/Amsterdam' },
  { city: 'Vienna', zone: 'Europe/Vienna' },
  { city: 'Zurich', zone: 'Europe/Zurich' },
  { city: 'Stockholm', zone: 'Europe/Stockholm' },
  { city: 'Oslo', zone: 'Europe/Oslo' },
  { city: 'Helsinki', zone: 'Europe/Helsinki' },
  { city: 'Warsaw', zone: 'Europe/Warsaw' },
  { city: 'Prague', zone: 'Europe/Prague' },
  { city: 'Athens', zone: 'Europe/Athens' },
  { city: 'Lisbon', zone: 'Europe/Lisbon' },
  { city: 'Istanbul', zone: 'Europe/Istanbul' },
  { city: 'Kyiv', zone: 'Europe/Kyiv' },
  { city: 'Moscow', zone: 'Europe/Moscow' },
  { city: 'Cairo', zone: 'Africa/Cairo' },
  { city: 'Nairobi', zone: 'Africa/Nairobi' },
  { city: 'Lagos', zone: 'Africa/Lagos' },
  { city: 'Johannesburg', zone: 'Africa/Johannesburg' },
  { city: 'Riyadh', zone: 'Asia/Riyadh' },
  { city: 'Dubai', zone: 'Asia/Dubai' },
  { city: 'Mumbai', zone: 'Asia/Kolkata' },
  { city: 'Kolkata', zone: 'Asia/Kolkata' },
  { city: 'Dhaka', zone: 'Asia/Dhaka' },
  { city: 'Colombo', zone: 'Asia/Colombo' },
  { city: 'Bangkok', zone: 'Asia/Bangkok' },
  { city: 'Ho Chi Minh City', zone: 'Asia/Ho_Chi_Minh' },
  { city: 'Kuala Lumpur', zone: 'Asia/Kuala_Lumpur' },
  { city: 'Singapore', zone: 'Asia/Singapore' },
  { city: 'Jakarta', zone: 'Asia/Jakarta' },
  { city: 'Hong Kong', zone: 'Asia/Hong_Kong' },
  { city: 'Shanghai', zone: 'Asia/Shanghai' },
  { city: 'Beijing', zone: 'Asia/Shanghai' },
  { city: 'Taipei', zone: 'Asia/Taipei' },
  { city: 'Seoul', zone: 'Asia/Seoul' },
  { city: 'Tokyo', zone: 'Asia/Tokyo' },
  { city: 'Sydney', zone: 'Australia/Sydney' },
  { city: 'Melbourne', zone: 'Australia/Melbourne' },
  { city: 'Karachi', zone: 'Asia/Karachi' },
  { city: 'Manila', zone: 'Asia/Manila' },
  { city: 'Yangon', zone: 'Asia/Rangoon' },
];

const LOCAL_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const LOCAL_DAY_FMT = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: LOCAL_ZONE });
const TIME_FMT_12H = (tz: string) => new Intl.DateTimeFormat('en', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
const TIME_FMT_24H = (tz: string) => new Intl.DateTimeFormat('en', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
const DATE_FMT = (tz: string) => new Intl.DateTimeFormat('en', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
const DAY_FMT = (tz: string) => new Intl.DateTimeFormat('en', { timeZone: tz, day: 'numeric', month: 'numeric', year: 'numeric' });

function isDifferentDay(tz: string, now: Date): boolean {
  return LOCAL_DAY_FMT.format(now) !== DAY_FMT(tz).format(now);
}

interface Props {
  zones: ClockZone[];
  onSetZones: (zones: ClockZone[]) => void;
  format: '12h' | '24h';
}

export default function HeaderClock({ zones, onSetZones, format }: Props) {
  const [now, setNow] = useState(() => new Date());
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  const localFmt = format === '24h' ? TIME_FMT_24H(LOCAL_ZONE) : TIME_FMT_12H(LOCAL_ZONE);
  const zoneFmt = format === '24h' ? TIME_FMT_24H : TIME_FMT_12H;

  const suggestions = search
    ? PRESETS.filter(p =>
        p.city.toLowerCase().includes(search.toLowerCase()) &&
        !zones.some(z => z.zone === p.zone && z.city === p.city)
      ).slice(0, 6)
    : [];

  function addZone(z: ClockZone) {
    onSetZones([...zones, z]);
    setSearch('');
    setAdding(false);
  }

  function removeZone(idx: number) {
    onSetZones(zones.filter((_, i) => i !== idx));
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        onClick={() => setOpen(o => !o)}
        title="World clock"
      >
        <span className={styles.time}>{localFmt.format(now)}</span>
        <svg className={styles.caret} width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
      </button>

      {open && (
        <div className={styles.popover}>
          <div className={styles.popLabel}>World Clock</div>

          <div className={styles.zoneRow}>
            <span className={styles.zoneTime}>{localFmt.format(now)}</span>
            <span className={styles.zoneCity}>Local time</span>
          </div>

          {zones.map((z, i) => (
            <div key={`${z.zone}-${i}`} className={styles.zoneRow}>
              <span className={styles.zoneTime}>{zoneFmt(z.zone).format(now)}</span>
              {isDifferentDay(z.zone, now) && (
                <span className={styles.zoneDate}>{DATE_FMT(z.zone).format(now)}</span>
              )}
              <span className={styles.zoneCity}>{z.city}</span>
              <button className={styles.removeZoneBtn} onClick={() => removeZone(i)} title="Remove">×</button>
            </div>
          ))}

          {adding ? (
            <div className={styles.searchWrap}>
              <input
                autoFocus
                className={styles.searchInput}
                placeholder="Search city…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { setAdding(false); setSearch(''); } }}
              />
              {suggestions.length > 0 && (
                <div className={styles.suggestions}>
                  {suggestions.map(s => (
                    <button key={`${s.city}-${s.zone}`} className={styles.suggestion} onMouseDown={e => { e.preventDefault(); addZone(s); }}>
                      <span className={styles.sugCity}>{s.city}</span>
                      <span className={styles.sugTime}>{zoneFmt(s.zone).format(now)}</span>
                    </button>
                  ))}
                </div>
              )}
              {search && suggestions.length === 0 && (
                <div className={styles.noResults}>No city found</div>
              )}
            </div>
          ) : (
            <button className={styles.addMore} onClick={() => setAdding(true)}>+ Add timezone</button>
          )}
        </div>
      )}
    </div>
  );
}
