/**
 * FNV-1a 64-bit over a string, returned as 16 hex chars.
 *
 * Pure integer arithmetic on two uint32 halves — deterministic everywhere, no
 * crypto dependency, fast enough for hashing a whole match log. Used by the
 * determinism harness (ADR-010). Not cryptographic; not meant to be.
 */
export function fnv1a64(str: string): string {
  // offset basis 0xcbf29ce484222325, prime 0x100000001b3
  let hi = 0xcbf29ce4, lo = 0x84222325;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    // xor low byte(s) of the code unit
    lo = (lo ^ (c & 0xff)) >>> 0;
    [hi, lo] = mulPrime(hi, lo);
    if (c > 0xff) {
      lo = (lo ^ (c >>> 8)) >>> 0;
      [hi, lo] = mulPrime(hi, lo);
    }
  }
  return hex8(hi) + hex8(lo);
}

/** (hi:lo) * 0x100000001b3 mod 2^64. prime = 2^40 + 0x1b3. */
function mulPrime(hi: number, lo: number): [number, number] {
  // lo * 0x1b3 (full 64-bit)
  const l0 = lo & 0xffff, l1 = lo >>> 16;
  const p0 = l0 * 0x1b3;              // < 2^25
  const p1 = l1 * 0x1b3;              // < 2^25
  let newLo = p0 + (p1 % 65536) * 65536; // may exceed 2^32
  let carry = 0;
  if (newLo >= 4294967296) { carry = Math.floor(newLo / 4294967296); newLo -= carry * 4294967296; }
  let newHi = Math.floor(p1 / 65536) + carry + Math.imul(hi, 0x1b3);
  // + (hi:lo) << 40  → contributes lo << 8 to hi (only bits that fit)
  newHi = (newHi + ((lo << 8) >>> 0)) >>> 0;
  return [newHi, newLo >>> 0];
}

function hex8(n: number): string {
  return (n >>> 0).toString(16).padStart(8, '0');
}

/**
 * Canonical JSON: keys sorted recursively so structurally equal objects hash equal
 * regardless of insertion order. Numbers are serialised by JSON.stringify's
 * shortest-round-trip algorithm, which is fully specified (ECMA-262 Number::toString).
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === 'object') {
    const src = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) out[k] = sortKeys(src[k]);
    return out;
  }
  return v;
}

export function hashValue(value: unknown): string {
  return fnv1a64(canonicalJson(value));
}
