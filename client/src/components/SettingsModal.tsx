import { useState, useEffect, type ReactNode } from 'react';
import styles from './SettingsModal.module.css';
import { UserSettings } from '../hooks/useSettings';
import { apiFetch } from '../services/api';

interface Props {
  settings: UserSettings;
  onUpdate: (patch: Partial<UserSettings>) => Promise<void>;
  onClose: () => void;
  onImport?: () => void;
}

type Section = 'search' | 'appearance' | 'reading' | 'security' | 'advanced' | 'integrations';

const ENGINES = [
  { id: 'google',     label: 'Google',     url: 'google.com' },
  { id: 'duckduckgo', label: 'DuckDuckGo', url: 'duckduckgo.com' },
  { id: 'bing',       label: 'Bing',        url: 'bing.com' },
  { id: 'brave',      label: 'Brave',       url: 'search.brave.com' },
] as const;

const BookOpenIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
    <path d="M8 13.5C6.5 13 4 12.5 2 13V3.5C4 3 6.5 3.5 8 4.5" />
    <path d="M8 13.5C9.5 13 12 12.5 14 13V3.5C12 3 9.5 3.5 8 4.5" />
    <line x1="8" y1="4.5" x2="8" y2="13.5" />
  </svg>
);

const NAV: { id: Section; label: string; icon: ReactNode }[] = [
  { id: 'search',       label: 'Search',       icon: '⌕' },
  { id: 'appearance',   label: 'Appearance',   icon: '◑' },
  { id: 'reading',      label: 'Reading',      icon: <BookOpenIcon /> },
  { id: 'security',     label: 'Security',     icon: '⚿' },
  { id: 'advanced',     label: 'Advanced',     icon: '⚙' },
  { id: 'integrations', label: 'Integrations', icon: '⇌' },
];

function BookmarkletRow({ label, href }: { label: string; href: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try { await navigator.clipboard.writeText(href); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className={styles.bookmarkletRow}>
      {/* eslint-disable-next-line react/jsx-no-script-url */}
      <a href={href} className={styles.bookmarkletLink} onClick={e => e.preventDefault()} draggable>
        {label}
      </a>
      <button className={styles.copyBtn} onClick={handleCopy}>
        {copied ? 'Copied!' : 'Copy URL'}
      </button>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`}
      onClick={() => onChange(!checked)}
    />
  );
}

export default function SettingsModal({ settings, onUpdate, onClose, onImport }: Props) {
  const [section, setSection] = useState<Section>('search');

  // ── TOTP state ────────────────────────────────────────────────────────────────
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpStep, setTotpStep] = useState<'idle' | 'enrolling' | 'confirming' | 'disabling'>('idle');
  const [enrollData, setEnrollData] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpError, setTotpError] = useState('');
  const [totpLoading, setTotpLoading] = useState(false);

  useEffect(() => {
    if (section !== 'security') return;
    apiFetch('/api/totp/status').then(r => r.json()).then(d => setTotpEnabled(d.enabled));
  }, [section]);

  async function handleEnroll() {
    setTotpLoading(true); setTotpError('');
    try {
      const r = await apiFetch('/api/totp/enroll', { method: 'POST' });
      const d = await r.json();
      setEnrollData(d);
      setTotpStep('confirming');
    } catch { setTotpError('Failed to start enrolment'); }
    finally { setTotpLoading(false); }
  }

  async function handleConfirm() {
    if (!enrollData || totpCode.length !== 6) return;
    setTotpLoading(true); setTotpError('');
    try {
      const r = await apiFetch('/api/totp/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: enrollData.secret, code: totpCode }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
      setTotpEnabled(true); setTotpStep('idle'); setEnrollData(null); setTotpCode('');
    } catch (e) { setTotpError(e instanceof Error ? e.message : 'Failed'); }
    finally { setTotpLoading(false); }
  }

  async function handleDisable() {
    if (totpCode.length !== 6) return;
    setTotpLoading(true); setTotpError('');
    try {
      const r = await apiFetch('/api/totp/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpCode }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
      setTotpEnabled(false); setTotpStep('idle'); setTotpCode('');
    } catch (e) { setTotpError(e instanceof Error ? e.message : 'Failed'); }
    finally { setTotpLoading(false); }
  }

  function cancelTotp() { setTotpStep('idle'); setTotpCode(''); setTotpError(''); setEnrollData(null); }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className={styles.backdrop} onClick={handleBackdrop}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>

        {/* Left nav */}
        <nav className={styles.nav}>
          <div className={styles.navHeader}>Settings</div>
          {NAV.map(n => (
            <button
              key={n.id}
              className={`${styles.navItem} ${section === n.id ? styles.navActive : ''}`}
              onClick={() => setSection(n.id)}
            >
              <span className={styles.navIcon}>{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>

        {/* Right content */}
        <div className={styles.content}>
          <div className={styles.contentHeader}>
            <div>
              <div className={styles.contentTitle}>
                {NAV.find(n => n.id === section)?.label}
              </div>
            </div>
            <button className={styles.closeBtn} onClick={onClose}>✕ Close</button>
          </div>

          <div className={styles.contentBody}>

            {section === 'search' && (
              <>
                <div className={styles.sectionBlock}>
                  <div className={styles.blockTitle}>Search engine</div>
                  <div className={styles.engineGrid}>
                    {ENGINES.map(e => (
                      <button
                        key={e.id}
                        className={`${styles.engineCard} ${settings.searchEngine === e.id ? styles.engineSelected : ''}`}
                        onClick={() => onUpdate({ searchEngine: e.id })}
                      >
                        <img
                          className={styles.engineFavicon}
                          src={`https://www.google.com/s2/favicons?domain=${e.url}&sz=32`}
                          alt=""
                        />
                        <span className={styles.engineLabel}>{e.label}</span>
                        {settings.searchEngine === e.id && (
                          <span className={styles.engineCheck}>✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.sectionBlock}>
                  <div className={styles.row}>
                    <div>
                      <div className={styles.rowLabel}>Open results in new tab</div>
                      <div className={styles.rowHint}>Search results open in a new browser tab instead of the current one</div>
                    </div>
                    <Toggle
                      checked={settings.searchNewTab}
                      onChange={v => onUpdate({ searchNewTab: v })}
                    />
                  </div>
                </div>
              </>
            )}

            {section === 'appearance' && (
              <>
                <div className={styles.sectionBlock}>
                  <div className={styles.row}>
                    <div>
                      <div className={styles.rowLabel}>Theme</div>
                      <div className={styles.rowHint}>Dark, light, or follow your system setting</div>
                    </div>
                    <div className={styles.themePicker}>
                      {(['dark', 'auto', 'light'] as const).map(t => (
                        <button
                          key={t}
                          className={`${styles.themeOption} ${settings.theme === t ? styles.themeOptionActive : ''}`}
                          onClick={() => onUpdate({ theme: t })}
                        >
                          {t === 'dark' ? '🌙 Dark' : t === 'auto' ? '⚙ Auto' : '☀ Light'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={styles.sectionBlock}>
                  <div className={styles.row}>
                    <div>
                      <div className={styles.rowLabel}>Clock format</div>
                      <div className={styles.rowHint}>How the header clock and clock widgets display time</div>
                    </div>
                    <div className={styles.themePicker}>
                      {(['12h', '24h'] as const).map(f => (
                        <button
                          key={f}
                          className={`${styles.themeOption} ${settings.clockFormat === f ? styles.themeOptionActive : ''}`}
                          onClick={() => onUpdate({ clockFormat: f })}
                        >
                          {f === '12h' ? '12h' : '24h'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={styles.sectionBlock}>
                  <div className={styles.blockTitle}>Background</div>
                  <div className={styles.gradientGrid}>
                    {([
                      { key: 'none',     label: 'None',     preview: '' },
                      { key: 'aurora',   label: 'Aurora',   preview: 'linear-gradient(135deg,#0d3b2e,#1a1040)' },
                      { key: 'dusk',     label: 'Dusk',     preview: 'linear-gradient(135deg,#4a1505,#2e0540)' },
                      { key: 'ocean',    label: 'Ocean',    preview: 'linear-gradient(135deg,#0a2840,#043330)' },
                      { key: 'midnight', label: 'Midnight', preview: 'linear-gradient(135deg,#1a0533,#0d0d2a)' },
                      { key: 'rose',     label: 'Rose',     preview: 'linear-gradient(135deg,#3d0520,#2e1a00)' },
                    ] as const).map(g => {
                      const active = (settings.backgroundGradient ?? 'none') === g.key;
                      return (
                        <button key={g.key} className={`${styles.gradientOption} ${active ? styles.gradientActive : ''}`} onClick={() => onUpdate({ backgroundGradient: g.key })}>
                          <div className={styles.gradientSwatch} style={{ background: g.preview || 'var(--surface)' }} />
                          <span className={styles.gradientLabel}>{g.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {section === 'reading' && (
              <>
                <div className={styles.sectionBlock}>
                  <div className={styles.blockTitle}>Reading list</div>
                  <div className={styles.openModeList}>
                    {([
                      { value: 'same-tab', label: 'Same tab',       hint: 'Opens saved articles in the current tab' },
                      { value: 'new-tab',  label: 'New tab',        hint: 'Opens saved articles in a new browser tab' },
                      { value: 'reader',   label: 'Reader overlay', hint: 'Shows a 90% overlay — close to come back. Sites that block embedding open in a new tab.' },
                    ] as const).map(opt => {
                      const cur = settings.readingListOpenMode ?? settings.articleOpenMode;
                      const active = cur === opt.value || (opt.value === 'reader' && cur === 'iframe');
                      return (
                        <button
                          key={opt.value}
                          className={`${styles.openModeOption} ${active ? styles.openModeSelected : ''}`}
                          onClick={() => onUpdate({ readingListOpenMode: opt.value === 'reader' ? 'reader' : opt.value })}
                        >
                          <div className={styles.openModeRadio}>
                            <span className={active ? styles.radioFilled : styles.radioEmpty} />
                          </div>
                          <div>
                            <div className={styles.openModeLabel}>{opt.label}</div>
                            <div className={styles.rowHint}>{opt.hint}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className={styles.sectionBlock}>
                  <div className={styles.blockTitle}>Bookmarks</div>
                  <div className={styles.openModeList}>
                    {([
                      { value: 'same-tab', label: 'Same tab', hint: 'Navigate to the bookmarked site in the current tab' },
                      { value: 'new-tab',  label: 'New tab',  hint: 'Open bookmarks in a new browser tab' },
                    ] as const).map(opt => {
                      const active = (settings.bookmarkOpenMode ?? 'same-tab') === opt.value;
                      return (
                        <button
                          key={opt.value}
                          className={`${styles.openModeOption} ${active ? styles.openModeSelected : ''}`}
                          onClick={() => onUpdate({ bookmarkOpenMode: opt.value })}
                        >
                          <div className={styles.openModeRadio}>
                            <span className={active ? styles.radioFilled : styles.radioEmpty} />
                          </div>
                          <div>
                            <div className={styles.openModeLabel}>{opt.label}</div>
                            <div className={styles.rowHint}>{opt.hint}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className={styles.sectionBlock}>
                  <div className={styles.blockTitle}>Feed articles per page</div>
                  <div className={styles.pageSizeRow}>
                    {([5, 10, 20, 50] as const).map(n => (
                      <button
                        key={n}
                        className={`${styles.pageSizeBtn} ${(settings.rssFeedPageSize ?? 10) === n ? styles.pageSizeBtnActive : ''}`}
                        onClick={() => onUpdate({ rssFeedPageSize: n })}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className={styles.rowHint} style={{ marginTop: 8 }}>
                    How many articles load at once when viewing a feed folder. Use "Load more" to fetch additional articles.
                  </div>
                </div>
              </>
            )}

            {section === 'security' && (
              <div className={styles.sectionBlock}>
                <div className={styles.blockTitle}>Two-factor authentication</div>

                {totpStep === 'idle' && (
                  <div className={styles.row}>
                    <div>
                      <div className={styles.rowLabel}>Authenticator app</div>
                      <div className={styles.rowHint}>
                        {totpEnabled
                          ? 'Your account is protected with an authenticator app.'
                          : 'Add a second layer of security using Google Authenticator, Authy, or any TOTP app.'}
                      </div>
                    </div>
                    {totpEnabled
                      ? <button className={styles.dangerBtn} onClick={() => { setTotpStep('disabling'); setTotpError(''); }}>Disable</button>
                      : <button className={styles.enableBtn} onClick={handleEnroll} disabled={totpLoading}>Enable</button>
                    }
                  </div>
                )}

                {totpStep === 'confirming' && enrollData && (
                  <div className={styles.totpEnroll}>
                    <p className={styles.rowHint}>Scan this QR code with your authenticator app, then enter the 6-digit code to confirm.</p>
                    <img src={enrollData.qrDataUrl} alt="QR code" className={styles.qrCode} />
                    <div className={styles.totpSecret}>
                      <span className={styles.rowHint}>Manual entry:&nbsp;</span>
                      <code className={styles.secretCode}>{enrollData.secret}</code>
                    </div>
                    <div className={styles.totpRow}>
                      <input
                        className={`${styles.totpInput}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="000000"
                        value={totpCode}
                        onChange={e => { setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setTotpError(''); }}
                        autoFocus
                      />
                      <button className={styles.enableBtn} onClick={handleConfirm} disabled={totpLoading || totpCode.length !== 6}>
                        {totpLoading ? 'Saving…' : 'Confirm'}
                      </button>
                      <button className={styles.cancelBtn} onClick={cancelTotp}>Cancel</button>
                    </div>
                    {totpError && <div className={styles.totpError}>{totpError}</div>}
                  </div>
                )}

                {totpStep === 'disabling' && (
                  <div className={styles.totpEnroll}>
                    <p className={styles.rowHint}>Enter your current authenticator code to disable 2FA.</p>
                    <div className={styles.totpRow}>
                      <input
                        className={styles.totpInput}
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="000000"
                        value={totpCode}
                        onChange={e => { setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setTotpError(''); }}
                        autoFocus
                      />
                      <button className={styles.dangerBtn} onClick={handleDisable} disabled={totpLoading || totpCode.length !== 6}>
                        {totpLoading ? 'Disabling…' : 'Disable 2FA'}
                      </button>
                      <button className={styles.cancelBtn} onClick={cancelTotp}>Cancel</button>
                    </div>
                    {totpError && <div className={styles.totpError}>{totpError}</div>}
                  </div>
                )}
              </div>
            )}

            {section === 'advanced' && (
              <div className={styles.sectionBlock}>
                <div className={styles.row}>
                  <div>
                    <div className={styles.rowLabel}>Console</div>
                    <div className={styles.rowHint}>Enable the backtick (`) console for power-user commands</div>
                  </div>
                  <Toggle
                    checked={settings.consoleEnabled}
                    onChange={v => onUpdate({ consoleEnabled: v })}
                  />
                </div>
                {onImport && (
                  <div className={styles.row}>
                    <div>
                      <div className={styles.rowLabel}>Import bookmarks</div>
                      <div className={styles.rowHint}>Import bookmarks from a browser HTML export or JSON file</div>
                    </div>
                    <button className={styles.enableBtn} onClick={() => { onImport(); onClose(); }}>
                      Import
                    </button>
                  </div>
                )}
              </div>
            )}

            {section === 'integrations' && (() => {
              const origin = typeof window !== 'undefined' ? window.location.origin : '';
              const saveHref = `javascript:(function(){var u=encodeURIComponent(location.href),t=encodeURIComponent(document.title);window.open('${origin}/?intent=save-article&url='+u+'&title='+t,'_blank','width=500,height=480,popup=1');})();`;
              const bmHref = `javascript:(function(){var u=encodeURIComponent(location.href),t=encodeURIComponent(document.title);window.open('${origin}/?intent=add-bookmark&url='+u+'&title='+t,'_blank','width=500,height=500,popup=1');})();`;
              return (
                <div className={styles.sectionBlock}>
                  <div className={styles.blockTitle}>Browser bookmarklets</div>
                  <div className={styles.rowHint} style={{ marginBottom: 18 }}>
                    Drag these links to your bookmarks bar for one-click saving from any page.
                    Can't drag? Use "Copy URL" then create a bookmark manually and paste into the URL field.
                  </div>
                  <BookmarkletRow label="Save to Reading List" href={saveHref} />
                  <BookmarkletRow label="Add Bookmark" href={bmHref} />
                </div>
              );
            })()}

          </div>
        </div>
      </div>
    </div>
  );
}
