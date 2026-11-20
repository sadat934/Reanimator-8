import { describe, expect, it } from 'vitest';
import { pickRenderer } from '../../src/ui/crt';
import { boltPath } from '../../src/ui/lightning';

describe('pickRenderer', () => {
  it('uses WebGL only when it is available and not forced off', () => {
    expect(pickRenderer({ webglAvailable: true, forceCss: false })).toBe('webgl');
  });
  it('falls back to CSS when WebGL is unavailable', () => {
    expect(pickRenderer({ webglAvailable: false, forceCss: false })).toBe('css');
  });
  it('honours the forced CSS switch even when WebGL works', () => {
    expect(pickRenderer({ webglAvailable: true, forceCss: true })).toBe('css');
  });
  it('uses CSS when WebGL is unavailable and CSS is forced', () => {
    expect(pickRenderer({ webglAvailable: false, forceCss: true })).toBe('css');
  });
});

describe('boltPath', () => {
  it('keeps both end points and doubles the segments per depth level', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 100 };
    const path = boltPath(a, b, 4, () => 0.75);
    expect(path[0]).toEqual(a);
    expect(path[path.length - 1]).toEqual(b);
    expect(path).toHaveLength(2 ** 4 + 1);
  });
  it('returns just the end points at depth 0', () => {
    const a = { x: 1, y: 2 };
    const b = { x: 3, y: 4 };
    expect(boltPath(a, b, 0, () => 0.5)).toEqual([a, b]);
  });
});
