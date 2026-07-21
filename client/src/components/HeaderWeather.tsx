import { useState, useEffect, useRef } from 'react';
import styles from './HeaderWeather.module.css';

const WMO_DESC: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Icy fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  71: 'Light snow', 73: 'Snowfall', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',
  85: 'Snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm',
};

function wmoDesc(code: number): string {
  return WMO_DESC[code] ?? (
    code <= 48 ? 'Cloudy' : code <= 67 ? 'Rainy' : code <= 86 ? 'Snowy' : 'Stormy'
  );
}

type IconKind = 'sun' | 'cloud-sun' | 'cloud' | 'rain' | 'snow' | 'storm';

function kindOf(code: number): IconKind {
  if (code <= 1) return 'sun';
  if (code === 2) return 'cloud-sun';
  if (code <= 48) return 'cloud';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'snow';
  return 'storm';
}

function WeatherIcon({ code, size = 18 }: { code: number; size?: number }) {
  const kind = kindOf(code);
  const s = { fill: 'none', stroke: 'var(--accent)', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  if (kind === 'sun') return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...s}>
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
    </svg>
  );
  if (kind === 'cloud-sun') return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...s}>
      <path d="M12 2v2M4.93 4.93l1.41 1.41M2 12h2"/>
      <circle cx="9" cy="11" r="3"/>
      <path d="M17 18H7a4 4 0 0 1-.5-7.97A6 6 0 0 1 19 14.5"/>
    </svg>
  );
  if (kind === 'cloud') return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...s}>
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/>
    </svg>
  );
  if (kind === 'rain') return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...s}>
      <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 15.25"/>
      <line x1="8" y1="19" x2="8" y2="21"/><line x1="8" y1="13" x2="8" y2="15"/>
      <line x1="16" y1="19" x2="16" y2="21"/><line x1="16" y1="13" x2="16" y2="15"/>
      <line x1="12" y1="21" x2="12" y2="23"/><line x1="12" y1="15" x2="12" y2="17"/>
    </svg>
  );
  if (kind === 'snow') return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...s}>
      <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 15.25"/>
      <line x1="8" y1="16" x2="8" y2="20"/><line x1="16" y1="16" x2="16" y2="20"/>
      <line x1="12" y1="18" x2="12" y2="22"/>
      <line x1="6" y1="18" x2="10" y2="18"/><line x1="14" y1="18" x2="18" y2="18"/>
    </svg>
  );
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...s}>
      <path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/>
      <polyline points="13 11 9 17 15 17 11 23"/>
    </svg>
  );
}

interface WeatherResult {
  temp: number;
  high: number;
  low: number;
  code: number;
  locationDisplay: string;
}

interface Props {
  location: string;
  unit: 'celsius' | 'fahrenheit';
  onSetLocation: (loc: string) => void;
  onSetUnit: (unit: 'celsius' | 'fahrenheit') => void;
}

export default function HeaderWeather({ location, unit, onSetLocation, onSetUnit }: Props) {
  const [data, setData] = useState<WeatherResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!location) { setData(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`
        );
        const geoJson = await geoRes.json();
        if (!geoJson.results?.length) {
          if (!cancelled) { setError('Location not found'); setLoading(false); }
          return;
        }
        const { latitude, longitude, name, country_code } = geoJson.results[0];

        const wRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
          `&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min` +
          `&timezone=auto&forecast_days=1&temperature_unit=${unit}`
        );
        const wJson = await wRes.json();

        if (!cancelled) {
          setData({
            temp: Math.round(wJson.current.temperature_2m),
            high: Math.round(wJson.daily.temperature_2m_max[0]),
            low: Math.round(wJson.daily.temperature_2m_min[0]),
            code: wJson.current.weather_code,
            locationDisplay: `${name}${country_code ? ', ' + country_code.toUpperCase() : ''}`,
          });
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setError('Could not load weather'); setLoading(false); }
      }
    })();

    return () => { cancelled = true; };
  }, [location, unit]);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditing(false);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function startEdit() {
    setInputVal(location);
    setEditing(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const val = inputVal.trim();
    if (!val) return;
    onSetLocation(val);
    setEditing(false);
  }

  const unitLabel = unit === 'celsius' ? '°C' : '°F';
  const altUnit = unit === 'celsius' ? 'fahrenheit' : 'celsius';
  const altUnitLabel = unit === 'celsius' ? '°F' : '°C';

  // No location yet — compact prompt that opens the editor
  if (!location) {
    return (
      <div className={styles.wrap} ref={wrapRef}>
        <button
          className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
          onClick={() => { setOpen(o => !o); startEdit(); }}
          title="Set weather location"
        >
          <WeatherIcon code={0} size={16} />
          <span className={styles.setLabel}>Weather</span>
        </button>
        {open && (
          <div className={styles.popover}>
            <form className={styles.locationForm} onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                className={styles.locationInput}
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                placeholder="City name…"
              />
              <button className={styles.locationSubmit} type="submit">Set</button>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        onClick={() => setOpen(o => !o)}
        title={data ? `${data.locationDisplay} · ${wmoDesc(data.code)}` : 'Weather'}
      >
        {data ? <WeatherIcon code={data.code} size={16} /> : <WeatherIcon code={0} size={16} />}
        <span className={styles.temp}>{data ? `${data.temp}°` : loading ? '…' : '—'}</span>
      </button>

      {open && (
        <div className={styles.popover}>
          {editing ? (
            <form className={styles.locationForm} onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                className={styles.locationInput}
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                placeholder="City name…"
              />
              <button className={styles.locationSubmit} type="submit">Set</button>
              <button className={styles.locationCancel} type="button" onClick={() => setEditing(false)}>✕</button>
            </form>
          ) : (
            <>
              {loading && <div className={styles.loading}>Loading…</div>}
              {error && (
                <div className={styles.errorRow}>
                  <span className={styles.error}>{error}</span>
                  <button className={styles.retryBtn} onClick={startEdit}>try again</button>
                </div>
              )}
              {data && !loading && (
                <>
                  <div className={styles.bigRow}>
                    <WeatherIcon code={data.code} size={30} />
                    <span className={styles.bigTemp}>{data.temp}°</span>
                    <button className={styles.unitToggle} onClick={() => onSetUnit(altUnit)} title={`Switch to ${altUnitLabel}`}>
                      {unitLabel}
                    </button>
                  </div>
                  <div className={styles.desc}>{wmoDesc(data.code)}</div>
                  <div className={styles.metaRow}>
                    <span className={styles.locationName}>{data.locationDisplay} · H {data.high}° L {data.low}°</span>
                    <button className={styles.editBtn} onClick={startEdit} title="Change location">✎</button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
