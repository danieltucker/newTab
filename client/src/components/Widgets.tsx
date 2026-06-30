import { useState, useRef, useEffect } from 'react';
import styles from './Widgets.module.css';
import WeatherCard from './WeatherCard';
import NotesCard from './NotesCard';
import WorldClockCard from './WorldClockCard';
import { UserSettings } from '../hooks/useSettings';

const ALL_WIDGETS = [
  { id: 'weather',     label: 'Weather',     desc: 'Current conditions & forecast' },
  { id: 'notes',       label: 'Notes',       desc: 'Markdown notepad with task lists' },
  { id: 'world-clock', label: 'World Clock', desc: 'Time in multiple timezones' },
];

interface Props {
  settings: UserSettings;
  onUpdateSettings: (patch: Partial<UserSettings>) => void;
}

export default function Widgets({ settings, onUpdateSettings }: Props) {
  const active = settings.activeWidgets ?? ['weather', 'notes'];
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    function onOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [pickerOpen]);

  function removeWidget(id: string) {
    onUpdateSettings({ activeWidgets: active.filter(w => w !== id) });
  }

  function addWidget(id: string) {
    onUpdateSettings({ activeWidgets: [...active, id] });
    setPickerOpen(false);
  }

  const available = ALL_WIDGETS.filter(w => !active.includes(w.id));

  return (
    <div className={styles.column}>
      {active.map(id => {
        switch (id) {
          case 'weather':
            return (
              <WeatherCard
                key={id}
                location={settings.weatherLocation}
                unit={settings.weatherUnit}
                onSetLocation={loc => onUpdateSettings({ weatherLocation: loc })}
                onSetUnit={unit => onUpdateSettings({ weatherUnit: unit })}
                onRemove={() => removeWidget(id)}
              />
            );
          case 'notes':
            return (
              <NotesCard
                key={id}
                notes={settings.notes}
                onSave={notes => onUpdateSettings({ notes })}
                onRemove={() => removeWidget(id)}
              />
            );
          case 'world-clock':
            return (
              <WorldClockCard
                key={id}
                zones={settings.worldClockZones ?? []}
                onSetZones={zones => onUpdateSettings({ worldClockZones: zones })}
                onRemove={() => removeWidget(id)}
              />
            );
          default:
            return null;
        }
      })}

      {available.length > 0 && (
        <div className={styles.addWrap} ref={pickerRef}>
          <button className={styles.addWidget} onClick={() => setPickerOpen(v => !v)}>
            + Add widget
          </button>

          {pickerOpen && (
            <div className={styles.picker}>
              {available.map(w => (
                <button key={w.id} className={styles.pickerItem} onClick={() => addWidget(w.id)}>
                  <span className={styles.pickerLabel}>{w.label}</span>
                  <span className={styles.pickerDesc}>{w.desc}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
