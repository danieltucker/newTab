import { useState, useEffect } from 'react';
import styles from './WorldClockCard.module.css';
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
  onRemove?: () => void;
}

export default function WorldClockCard({ zones, onSetZones, onRemove }: Props) {
  const [now, setNow] = useState(() => new Date());
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

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
    <div className={styles.card}>
      <div className={styles.cardLabel}>
        <span>World Clock</span>
        <div className={styles.labelRight}>
          {onRemove && (
            <button className={styles.removeBtn} onClick={onRemove} title="Remove widget">
              <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {zones.length === 0 && !adding && (
        <div className={styles.empty}>
          <button className={styles.addZoneBtn} onClick={() => setAdding(true)}>Add a timezone</button>
        </div>
      )}

      {zones.map((z, i) => (
        <div key={`${z.zone}-${i}`} className={styles.zoneRow}>
          <div className={styles.zoneMain}>
            <span className={styles.zoneTime}>
              {(zones.length > 3 ? TIME_FMT_24H(z.zone) : TIME_FMT_12H(z.zone)).format(now)}
            </span>
            {isDifferentDay(z.zone, now) && (
              <span className={styles.zoneDate}>{DATE_FMT(z.zone).format(now)}</span>
            )}
          </div>
          <span className={styles.zoneCity}>{z.city}</span>
          <button className={styles.removeZoneBtn} onClick={() => removeZone(i)} title="Remove">×</button>
        </div>
      ))}

      {!adding && zones.length > 0 && (
        <button className={styles.addMore} onClick={() => setAdding(true)}>+ Add timezone</button>
      )}

      {adding && (
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
                  <span className={styles.sugTime}>{TIME_FMT_12H(s.zone).format(now)}</span>
                </button>
              ))}
            </div>
          )}
          {search && suggestions.length === 0 && (
            <div className={styles.noResults}>No city found</div>
          )}
          <button className={styles.cancelBtn} onClick={() => { setAdding(false); setSearch(''); }}>Cancel</button>
        </div>
      )}
    </div>
  );
}
