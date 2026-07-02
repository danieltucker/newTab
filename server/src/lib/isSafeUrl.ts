import { lookup } from 'dns/promises';
import net from 'net';
import http from 'http';
import https from 'https';

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 127 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0
    );
  }
  if (net.isIPv6(ip)) {
    const n = ip.toLowerCase();
    return n === '::1' || n.startsWith('fc') || n.startsWith('fd') || n.startsWith('fe80');
  }
  return true;
}

/**
 * Resolves the URL's hostname, validates it's not a private/internal IP, then
 * returns an HTTP/HTTPS agent whose lookup function is pinned to that resolved
 * address. Using this agent on the subsequent fetch prevents DNS rebinding:
 * the same IP that passed the check is the one used for the connection.
 *
 * Returns null if the URL is invalid, uses a non-HTTP/S scheme, or resolves
 * to a private address.
 */
export async function makeSafeAgent(urlStr: string): Promise<http.Agent | https.Agent | null> {
  let parsed: URL;
  try { parsed = new URL(urlStr); } catch { return null; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  let address: string;
  try {
    const result = await lookup(parsed.hostname);
    address = result.address;
  } catch { return null; }

  if (isPrivateIp(address)) return null;

  const family = net.isIPv6(address) ? 6 : 4;
  const AgentClass = parsed.protocol === 'https:' ? https.Agent : http.Agent;
  return new AgentClass({
    lookup: (_host: string, _opts: unknown, cb: (err: Error | null, addr: string, fam: number) => void) =>
      cb(null, address, family),
  } as ConstructorParameters<typeof AgentClass>[0]);
}

/** Convenience wrapper — use makeSafeAgent when you also need to fetch. */
export async function isSafeUrl(urlStr: string): Promise<boolean> {
  return (await makeSafeAgent(urlStr)) !== null;
}
