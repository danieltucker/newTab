// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { parseBookmarkHTML } from './parseBookmarks';

describe('parseBookmarkHTML', () => {
  it('extracts name, domain and a colour from anchors', () => {
    const result = parseBookmarkHTML('<a href="https://github.com">GitHub</a>');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('GitHub');
    expect(result[0].domain).toBe('github.com');
    expect(result[0].color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('strips www and ignores the path for the domain', () => {
    const result = parseBookmarkHTML('<a href="https://www.example.com/deep/path">Example</a>');
    expect(result[0].domain).toBe('example.com');
  });

  it('deduplicates by domain', () => {
    const result = parseBookmarkHTML(`
      <a href="https://example.com/a">A</a>
      <a href="https://example.com/b">B</a>
    `);
    expect(result).toHaveLength(1);
  });

  it('skips non-http(s) links', () => {
    const result = parseBookmarkHTML(`
      <a href="ftp://files.com">files</a>
      <a href="javascript:void(0)">evil</a>
      <a href="https://ok.com">ok</a>
    `);
    expect(result).toHaveLength(1);
    expect(result[0].domain).toBe('ok.com');
  });

  it('falls back to the domain when the anchor has no text', () => {
    const result = parseBookmarkHTML('<a href="https://foo.com"></a>');
    expect(result[0].name).toBe('foo.com');
  });
});
