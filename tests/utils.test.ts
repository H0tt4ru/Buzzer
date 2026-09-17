import { describe, expect, it } from 'vitest';
import { formatRelative, parseNames, studentLink } from '@/lib/utils';

describe('parseNames', () => {
  it('splits one name per line', () => {
    expect(parseNames('Andi\nBudi\nCitra', 1)).toEqual(['Andi', 'Budi', 'Citra']);
  });

  it('trims stray whitespace from a pasted class list', () => {
    expect(parseNames('  Andi  \n\tBudi\t', 1)).toEqual(['Andi', 'Budi']);
  });

  it('keeps the seat but fills the name when a line is blank', () => {
    // A register with gaps still has to line up: blank line 2 stays seat 2.
    expect(parseNames('Andi\n\nCitra', 1)).toEqual(['Andi', 'Siswa 2', 'Citra']);
  });

  it('drops trailing blank lines rather than inventing students', () => {
    expect(parseNames('Andi\nBudi\n\n\n', 1)).toEqual(['Andi', 'Budi']);
  });

  it('generates placeholders when nothing was typed', () => {
    expect(parseNames('', 3)).toEqual(['Siswa 1', 'Siswa 2', 'Siswa 3']);
  });

  it('always yields at least one student', () => {
    expect(parseNames('', 0)).toEqual(['Siswa 1']);
  });

  it('preserves duplicate names, since two students can share one', () => {
    expect(parseNames('Andi\nAndi', 1)).toEqual(['Andi', 'Andi']);
  });
});

describe('studentLink', () => {
  it('builds a play URL from an explicit origin', () => {
    expect(studentLink('abc123', 'https://bel.example.com')).toBe(
      'https://bel.example.com/play/abc123',
    );
  });

  it('does not double the slash when the origin has a trailing one', () => {
    expect(studentLink('abc123', 'https://bel.example.com/')).toBe(
      'https://bel.example.com/play/abc123',
    );
  });
});

describe('formatRelative', () => {
  it('renders a dash for a student who has never connected', () => {
    expect(formatRelative(null)).toBe('—');
  });

  it('says "just now" inside the heartbeat window', () => {
    expect(formatRelative(new Date().toISOString())).toBe('baru saja');
  });

  it('counts in seconds, then minutes, then hours', () => {
    const ago = (ms: number) => formatRelative(new Date(Date.now() - ms).toISOString());
    expect(ago(30_000)).toContain('detik');
    expect(ago(5 * 60_000)).toContain('menit');
    expect(ago(3 * 3_600_000)).toContain('jam');
  });
});
