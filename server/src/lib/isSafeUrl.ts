import { lookup } from 'dns/promises';
import net from 'net';

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

export async function isSafeUrl(urlStr: string): Promise<boolean> {
  let parsed: URL;
  try { parsed = new URL(urlStr); } catch { return false; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  try {
    const { address } = await lookup(parsed.hostname);
    return !isPrivateIp(address);
  } catch {
    return false;
  }
}
