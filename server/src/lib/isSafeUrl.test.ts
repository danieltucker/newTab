import { describe, it, expect } from 'vitest';
import { isSafeUrl } from './isSafeUrl';

// IP-literal hosts are resolved by dns.lookup without a network round-trip, so
// these assertions are deterministic and offline.
describe('isSafeUrl (SSRF guard)', () => {
  it('rejects loopback and private IPv4 ranges', async () => {
    expect(await isSafeUrl('http://127.0.0.1')).toBe(false);
    expect(await isSafeUrl('http://10.0.0.5')).toBe(false);
    expect(await isSafeUrl('http://172.16.4.2')).toBe(false);
    expect(await isSafeUrl('http://192.168.1.1')).toBe(false);
    expect(await isSafeUrl('http://169.254.1.1')).toBe(false);
    expect(await isSafeUrl('http://0.0.0.0')).toBe(false);
  });

  it('rejects IPv6 loopback', async () => {
    expect(await isSafeUrl('http://[::1]')).toBe(false);
  });

  it('allows a public IP', async () => {
    expect(await isSafeUrl('https://8.8.8.8')).toBe(true);
  });

  it('rejects non-http(s) schemes and invalid URLs', async () => {
    expect(await isSafeUrl('ftp://8.8.8.8')).toBe(false);
    expect(await isSafeUrl('file:///etc/passwd')).toBe(false);
    expect(await isSafeUrl('not a url')).toBe(false);
  });
});
