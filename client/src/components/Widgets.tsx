import styles from './Widgets.module.css';

export default function Widgets() {
  return (
    <div className={styles.column}>
      {/* Weather */}
      <div className={styles.card}>
        <div className={styles.cardLabel}>
          Weather
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
          </svg>
        </div>
        <div className={styles.temp}>18°</div>
        <div className={styles.weatherDesc}>Partly cloudy</div>
        <div className={styles.weatherSub}>San Francisco · H 21° L 12°</div>
      </div>

      {/* Notes */}
      <div className={styles.card}>
        <div className={styles.cardLabel}>Notes</div>
        <div className={styles.noteLine}>· Ship new-tab v1</div>
        <div className={styles.noteLine}>· Email the design review</div>
        <div className={`${styles.noteLine} ${styles.muted}`}>· Add weather location picker</div>
      </div>

      <button className={styles.addWidget}>+ Add widget</button>
    </div>
  );
}
