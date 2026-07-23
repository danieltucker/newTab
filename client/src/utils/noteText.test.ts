// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { noteText, noteSnippet, searchNotes } from './noteText';
import { NoteDoc } from '../hooks/useSettings';

describe('noteText', () => {
  it('returns empty string for empty input', () => {
    expect(noteText('')).toBe('');
  });

  it('strips markup down to plain text', () => {
    expect(noteText('<p>hello <b>world</b></p>')).toBe('hello world');
  });

  it('inserts a space at block boundaries so words do not run together', () => {
    expect(noteText('<p>one</p><p>two</p>')).toBe('one two');
    expect(noteText('<ul><li>a</li><li>b</li></ul>')).toBe('a b');
  });

  it('collapses whitespace', () => {
    expect(noteText('<p>lots    of\n\n   space</p>')).toBe('lots of space');
  });
});

describe('noteSnippet', () => {
  it('returns short text unchanged when there is no query', () => {
    expect(noteSnippet('short text', '')).toBe('short text');
  });

  it('truncates long text with an ellipsis when there is no query', () => {
    const out = noteSnippet('a'.repeat(200), '');
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBe(91); // 90 chars + ellipsis
  });

  it('returns the whole string when a short match fits in the window', () => {
    expect(noteSnippet('hello world foo bar', 'world')).toBe('hello world foo bar');
  });

  it('windows around a match deep in a long body, ellipsised both ends', () => {
    const text = 'x'.repeat(100) + 'NEEDLE' + 'y'.repeat(100);
    const out = noteSnippet(text, 'needle');
    expect(out.startsWith('…')).toBe(true);
    expect(out.endsWith('…')).toBe(true);
    expect(out).toContain('NEEDLE');
  });
});

describe('searchNotes', () => {
  const note = (id: string, title: string, body: string): NoteDoc => ({ id, title, body });
  const docs = [
    note('1', 'Groceries', '<p>milk and eggs</p>'),
    note('2', 'Work', '<p>meeting notes</p>'),
  ];

  it('returns every note with no snippet when the query is empty', () => {
    const out = searchNotes(docs, '');
    expect(out.map(r => r.doc.id)).toEqual(['1', '2']);
    expect(out.every(r => r.snippet === undefined)).toBe(true);
  });

  it('matches body text and carries a snippet around the hit', () => {
    const out = searchNotes(docs, 'milk');
    expect(out.map(r => r.doc.id)).toEqual(['1']);
    expect(out[0].snippet).toContain('milk');
  });

  it('matches the title without a snippet', () => {
    const out = searchNotes(docs, 'work');
    expect(out.map(r => r.doc.id)).toEqual(['2']);
    expect(out[0].snippet).toBeUndefined();
  });

  it('a title-only match has no snippet even when the body differs', () => {
    const out = searchNotes(docs, 'grocer');   // matches title, not body
    expect(out.map(r => r.doc.id)).toEqual(['1']);
    expect(out[0].snippet).toBeUndefined();
  });

  it('excludes notes that match neither title nor body', () => {
    expect(searchNotes(docs, 'zzz')).toEqual([]);
  });
});
