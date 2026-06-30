import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './Console.module.css';
import { Folder } from '../types';
import { apiFetch } from '../services/api';

interface Line {
  id: number;
  kind: 'input' | 'output' | 'error' | 'info';
  text: string;
}

interface Ctx {
  folders: Folder[];
  theme: 'dark' | 'light';
  onSelectFolder: (id: string) => void;
  onSetTheme: (t: 'dark' | 'light' | 'auto') => void;
}

type CmdFn = (args: string[], ctx: Ctx) => Promise<string | string[]> | string | string[];

function col(name: string, desc: string): string {
  return `  ${name.padEnd(12)}${desc}`;
}

const COMMANDS: Record<string, { desc: string; run: CmdFn }> = {
  help: {
    desc: 'List available commands',
    run: () => [
      'Network',
      col('ip',        'Your public IP address and location'),
      col('ping',      'ping <host>  — ICMP ping (4 packets)'),
      col('tracert',   'tracert <host>  — Trace route to host'),
      col('dns',       'dns <host> [A|AAAA|MX|TXT]  — DNS lookup'),
      col('speedtest', 'Download speed estimate'),
      '',
      'Navigation',
      col('folder',    'folder <name>  — Switch to a folder'),
      '',
      'System',
      col('theme',     'theme <dark|light|auto>  — Switch UI theme'),
      col('version',   'App version info'),
      col('clear',     'Clear the console'),
      col('help',      'Show this list'),
    ],
  },

  version: {
    desc: 'Show app version',
    run: () => 'Newt.ab v1.1.0',
  },

  clear: {
    desc: 'Clear the console',
    run: () => '__CLEAR__',
  },

  ip: {
    desc: 'Show your public IP',
    run: async () => {
      const res = await apiFetch('/api/util/ip');
      if (!res.ok) return 'Could not fetch IP info.';
      const d = await res.json() as { ip: string; city?: string; region?: string; country?: string; org?: string };
      const loc = [d.city, d.region, d.country].filter(Boolean).join(', ');
      const parts = [`IP   ${d.ip}`];
      if (loc) parts.push(`Loc  ${loc}`);
      if (d.org) parts.push(`ISP  ${d.org}`);
      return parts;
    },
  },

  ping: {
    desc: 'Ping a host',
    run: async ([host]) => {
      if (!host) return 'Usage: ping <host>';
      const res = await apiFetch(`/api/util/ping?host=${encodeURIComponent(host)}`);
      if (!res.ok) return 'Could not reach server.';
      const d = await res.json() as { output: string; error?: boolean };
      return d.output.trim().split('\n').filter(l => l.trim());
    },
  },

  tracert: {
    desc: 'Trace route to a host',
    run: async ([host]) => {
      if (!host) return 'Usage: tracert <host>';
      const res = await apiFetch(`/api/util/tracert?host=${encodeURIComponent(host)}`);
      if (!res.ok) return 'Could not reach server.';
      const d = await res.json() as { output: string; error?: boolean };
      return d.output.trim().split('\n').filter(l => l.trim());
    },
  },

  dns: {
    desc: 'DNS lookup',
    run: async (args) => {
      const host = args[0];
      const type = (args[1] ?? 'A').toUpperCase();
      if (!host) return 'Usage: dns <host> [A|AAAA|MX|TXT|CNAME]';
      const validTypes = ['A', 'AAAA', 'MX', 'TXT', 'CNAME', 'NS', 'PTR'];
      if (!validTypes.includes(type)) return `Unknown type "${type}". Valid: ${validTypes.join(', ')}`;
      const res = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${encodeURIComponent(type)}`,
        { headers: { Accept: 'application/dns-json' } }
      );
      if (!res.ok) return 'DNS lookup failed.';
      const d = await res.json() as { Answer?: Array<{ data: string; TTL: number }>; Status: number };
      if (!d.Answer?.length) return `No ${type} records found for ${host}`;
      return d.Answer.map(r => `${r.data.padEnd(48)}TTL ${r.TTL}s`);
    },
  },

  speedtest: {
    desc: 'Estimate download speed',
    run: async () => {
      const bytes = 5_000_000;
      const start = performance.now();
      try {
        const r = await fetch(`https://speed.cloudflare.com/__down?bytes=${bytes}`);
        await r.arrayBuffer();
        const secs = (performance.now() - start) / 1000;
        const mbps = ((bytes * 8) / secs / 1_000_000).toFixed(1);
        return `Download  ${mbps} Mbps  (${(bytes / 1e6).toFixed(0)} MB in ${secs.toFixed(2)}s)`;
      } catch {
        return 'Speed test failed — check your connection.';
      }
    },
  },

  theme: {
    desc: 'Switch theme',
    run: (args, { theme, onSetTheme }) => {
      const target = args[0]?.toLowerCase() as 'dark' | 'light' | 'auto' | undefined;
      if (target !== 'dark' && target !== 'light' && target !== 'auto') {
        return 'Usage: theme <dark|light|auto>';
      }
      if (target !== 'auto' && theme === target) return `Already using ${target} theme.`;
      onSetTheme(target);
      return target === 'auto' ? 'Switched to auto (system) theme.' : `Switched to ${target} theme.`;
    },
  },

  folder: {
    desc: 'Switch folder',
    run: (args, { folders, onSelectFolder }) => {
      const name = args.join(' ').toLowerCase();
      if (!name) {
        return ['Usage: folder <name>', 'Available: ' + folders.map(f => f.name).join(', ')];
      }
      const match = folders.find(f => f.name.toLowerCase() === name)
        ?? folders.find(f => f.name.toLowerCase().startsWith(name));
      if (!match) {
        return [`"${args.join(' ')}" not found.`, 'Available: ' + folders.map(f => f.name).join(', ')];
      }
      onSelectFolder(match.id);
      return `Switched to "${match.name}"`;
    },
  },
};

const CMD_NAMES = Object.keys(COMMANDS);

interface Props {
  folders: Folder[];
  theme: 'dark' | 'light';
  onSelectFolder: (id: string) => void;
  onSetTheme: (t: 'dark' | 'light' | 'auto') => void;
  onClose: () => void;
}

let lineId = 0;

export default function Console({ folders, theme, onSelectFolder, onSetTheme, onClose }: Props) {
  const [lines, setLines] = useState<Line[]>([
    { id: lineId++, kind: 'info', text: 'Type "help" for available commands.' },
  ]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [running, setRunning] = useState(false);

  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [lines]);

  const push = useCallback((text: string | string[], kind: Line['kind'] = 'output') => {
    const texts = Array.isArray(text) ? text : [text];
    setLines(prev => [
      ...prev,
      ...texts.map(t => ({ id: lineId++, kind, text: t })),
    ]);
  }, []);

  async function run(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;

    push(`$ ${trimmed}`, 'input');
    setHistory(h => [trimmed, ...h.filter(x => x !== trimmed)].slice(0, 50));
    setHistIdx(-1);
    setInput('');

    const [cmd, ...args] = trimmed.split(/\s+/);
    const def = COMMANDS[cmd.toLowerCase()];
    if (!def) {
      const hint = CMD_NAMES.find(c => c.startsWith(cmd.toLowerCase()[0]));
      push(`Command not found: "${cmd}".${hint ? ` Did you mean "${hint}"?` : ' Type "help".'}`, 'error');
      return;
    }

    setRunning(true);
    try {
      const result = await def.run(args, { folders, theme, onSelectFolder, onSetTheme });
      if (result === '__CLEAR__') {
        setLines([]);
      } else {
        push(result);
      }
    } catch {
      push('An error occurred. Try again.', 'error');
    } finally {
      setRunning(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!running) run(input);
      return;
    }
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      const partial = input.toLowerCase();
      const matches = CMD_NAMES.filter(c => c.startsWith(partial));
      if (matches.length === 1) setInput(matches[0]);
      else if (matches.length > 1) push(matches.join('   '), 'info');
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(next);
      if (history[next] !== undefined) setInput(history[next]);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.max(histIdx - 1, -1);
      setHistIdx(next);
      setInput(next === -1 ? '' : history[next]);
      return;
    }
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.console} onClick={e => e.stopPropagation()}>

        <div className={styles.header}>
          <span className={styles.headerTitle}>NEWT.AB CONSOLE</span>
          <span className={styles.headerHints}>
            <kbd>`</kbd>to close
            <span className={styles.dot}>·</span>
            <kbd>tab</kbd>to complete
            <span className={styles.dot}>·</span>
            <kbd>↑↓</kbd>history
          </span>
        </div>

        <div className={styles.outputArea} ref={outputRef} onClick={() => inputRef.current?.focus()}>
          {lines.map(line => (
            <div key={line.id} className={styles.line} data-kind={line.kind}>
              {line.text}
            </div>
          ))}
          {running && <div className={styles.line} data-kind="info">Running…</div>}
        </div>

        <div className={styles.inputRow}>
          <span className={styles.promptSymbol}>$</span>
          <input
            ref={inputRef}
            className={styles.textInput}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={running}
            placeholder={running ? '' : 'type a command…'}
          />
        </div>

      </div>
    </div>
  );
}
