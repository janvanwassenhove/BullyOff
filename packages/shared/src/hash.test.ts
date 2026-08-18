import { describe, expect, it } from 'vitest';
import { canonicalJson, fnv1a64, hashValue } from './hash.js';

describe('fnv1a64', () => {
  it('matches known FNV-1a 64 vectors', () => {
    expect(fnv1a64('')).toBe('cbf29ce484222325');
    expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
    expect(fnv1a64('foobar')).toBe('85944171f73967e8');
  });
  it('canonical JSON is insertion-order independent', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
    expect(hashValue({ x: 1, y: 2 })).toBe(hashValue({ y: 2, x: 1 }));
    expect(hashValue({ x: 1, y: 2 })).not.toBe(hashValue({ x: 1, y: 3 }));
  });
});
