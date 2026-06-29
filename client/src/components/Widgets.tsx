import styles from './Widgets.module.css';
import WeatherCard from './WeatherCard';
import NotesCard from './NotesCard';
import { UserSettings } from '../hooks/useSettings';

interface Props {
  settings: UserSettings;
  onUpdateSettings: (patch: Partial<UserSettings>) => void;
}

export default function Widgets({ settings, onUpdateSettings }: Props) {
  return (
    <div className={styles.column}>
      <WeatherCard
        location={settings.weatherLocation}
        unit={settings.weatherUnit}
        onSetLocation={loc => onUpdateSettings({ weatherLocation: loc })}
        onSetUnit={unit => onUpdateSettings({ weatherUnit: unit })}
      />

      <NotesCard
        notes={settings.notes}
        onSave={notes => onUpdateSettings({ notes })}
      />

      <button className={styles.addWidget}>+ Add widget</button>
    </div>
  );
}
